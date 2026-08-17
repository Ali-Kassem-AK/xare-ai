import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const config = {
  runtime: 'nodejs', // Using standard Node.js serverless runtime for AWS SDK compatibility
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
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // 1. Authenticate Request
    const authHeader = req.headers.get('Authorization') || req.headers.get('x-chatbot-token');
    if (!authHeader || authHeader.length < 3) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing authentication token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Parse & Validate Payload
    const body = await req.json();
    const { fileName, mimeType, fileSize, userId } = body;

    if (!fileName || !fileSize) {
      return new Response(JSON.stringify({ error: 'Bad Request: fileName and fileSize are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 100MB Hard Ceiling
    const MAX_SIZE = 100 * 1024 * 1024;
    if (fileSize > MAX_SIZE) {
      return new Response(JSON.stringify({ error: `File size exceeds the 100 MB limit (${(fileSize / (1024 * 1024)).toFixed(1)} MB)` }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 4. Initialize S3 Client for Cloudflare R2
    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });

    // 5. Generate Presigned PUT URL (Valid for 30 minutes for browser direct upload)
    const putCommand = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: objectKey,
      ContentType: effectiveMimeType,
      ContentLength: fileSize,
    });

    const uploadUrl = await getSignedUrl(s3, putCommand, { expiresIn: 1800 });

    // 6. Generate Presigned GET URL (Valid for 2 hours for n8n downstream automation download)
    let downloadUrl: string;
    if (R2_PUBLIC_DOMAIN) {
      downloadUrl = `https://${R2_PUBLIC_DOMAIN}/${objectKey}`;
    } else {
      const getCommand = new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: objectKey,
      });
      downloadUrl = await getSignedUrl(s3, getCommand, { expiresIn: 7200 });
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
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
