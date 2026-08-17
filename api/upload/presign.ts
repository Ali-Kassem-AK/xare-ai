export const config = {
  runtime: 'edge', // Using Vercel Edge runtime for lightning-fast sub-10ms response
};

// Fail-closed server-side secret management
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'xare-uploads';
const R2_PUBLIC_DOMAIN = process.env.R2_PUBLIC_DOMAIN;

function sanitizeFileName(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const cleaned = base.replace(/^\.+/, '');
  return cleaned.substring(0, 120) || 'file.bin';
}

function generateFileId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `file_${timestamp}_${randomPart}`;
}

async function hmacSha256(key: string | ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    typeof key === 'string' ? new TextEncoder().encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

async function sha256Hex(message: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256Hex(key: ArrayBuffer, message: string): Promise<string> {
  const sigBuffer = await hmacSha256(key, message);
  return Array.from(new Uint8Array(sigBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function generateR2PresignedUrl({
  accountId,
  accessKeyId,
  secretAccessKey,
  bucketName,
  objectKey,
  method = 'PUT',
  expiresIn = 1800,
}: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  objectKey: string;
  method?: string;
  expiresIn?: number;
}): Promise<string> {
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const datestamp = amzDate.substring(0, 8);
  const region = 'auto';
  const service = 's3';
  const credentialScope = `${datestamp}/${region}/${service}/aws4_request`;

  // Encode URI path
  const canonicalUri = `/${bucketName}/${encodeURIComponent(objectKey).replace(/%2F/g, '/')}`;

  // Query parameters must be sorted alphabetically
  const queryParams: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': expiresIn.toString(),
    'X-Amz-SignedHeaders': 'host',
  };

  const canonicalQueryString = Object.keys(queryParams)
    .sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
    .join('&');

  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = 'host';
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const canonicalRequestHash = await sha256Hex(canonicalRequest);

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    canonicalRequestHash,
  ].join('\n');

  // Derive signing key
  const kDate = await hmacSha256('AWS4' + secretAccessKey, datestamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, 'aws4_request');

  // Calculate signature
  const signature = await hmacSha256Hex(kSigning, stringToSign);

  return `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

export default async function handler(req: Request) {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id, x-chatbot-token',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
    });
  }

  try {
    // 1. Authenticate Request
    const authHeader = req.headers.get('Authorization') || req.headers.get('x-chatbot-token');
    if (!authHeader || authHeader.length < 3) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing authentication token' }), {
        status: 401,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
      });
    }

    // 2. Parse & Validate Payload
    const body = await req.json();
    const { fileName, mimeType, fileSize, userId } = body;

    if (!fileName || !fileSize) {
      return new Response(JSON.stringify({ error: 'Bad Request: fileName and fileSize are required' }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
      });
    }

    // 100MB Hard Ceiling
    const MAX_SIZE = 100 * 1024 * 1024;
    if (fileSize > MAX_SIZE) {
      return new Response(JSON.stringify({ error: `File size exceeds the 100 MB limit (${(fileSize / (1024 * 1024)).toFixed(1)} MB)` }), {
        status: 413,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
      });
    }

    const safeUserId = (userId && typeof userId === 'string') ? userId.replace(/[^a-zA-Z0-9_-]/g, '_') : 'guest_user';
    const safeName = sanitizeFileName(fileName);
    const fileId = generateFileId();
    const objectKey = `users/${safeUserId}/uploads/${fileId}/${safeName}`;

    const effectiveMimeType = mimeType || (
      safeName.endsWith('.pdf') ? 'application/pdf' :
      safeName.match(/\.(jpg|jpeg|png|webp|gif)$/i) ? 'image/jpeg' :
      safeName.match(/\.(webm|mp3|ogg|wav)$/i) ? 'audio/webm' :
      'application/octet-stream'
    );

    // 3. Verify Server-Side R2 Configuration
    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
      // Diagnostic mode if R2 credentials are not yet entered in Vercel environment variables
      return new Response(JSON.stringify({
        error: 'R2_CONFIG_MISSING',
        message: 'Cloudflare R2 credentials (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) are not configured on the server.',
        objectKey: objectKey,
        fileId: fileId
      }), {
        status: 503,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
      });
    }

    // 4. Generate Presigned PUT URL (Valid for 30 minutes for browser direct upload)
    const uploadUrl = await generateR2PresignedUrl({
      accountId: R2_ACCOUNT_ID,
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      bucketName: R2_BUCKET_NAME,
      objectKey: objectKey,
      method: 'PUT',
      expiresIn: 1800,
    });

    // 5. Generate Presigned GET URL (Valid for 2 hours for n8n downstream automation download)
    let downloadUrl: string;
    if (R2_PUBLIC_DOMAIN) {
      downloadUrl = `https://${R2_PUBLIC_DOMAIN}/${objectKey}`;
    } else {
      downloadUrl = await generateR2PresignedUrl({
        accountId: R2_ACCOUNT_ID,
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
        bucketName: R2_BUCKET_NAME,
        objectKey: objectKey,
        method: 'GET',
        expiresIn: 7200,
      });
    }

    return new Response(JSON.stringify({
      success: true,
      uploadUrl,
      downloadUrl,
      fileId,
      objectKey,
      fileName: safeName,
      fileSize,
      mimeType: effectiveMimeType,
      storageProvider: 'cloudflare-r2',
      expiresIn: 1800,
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    });

  } catch (err: any) {
    console.error('R2 Presign Endpoint Error:', err);
    return new Response(JSON.stringify({
      error: 'Failed to generate upload authorization',
      message: err.message,
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
    });
  }
}
