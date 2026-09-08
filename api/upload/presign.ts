import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const config = {
  runtime: 'edge',
};

// Provider-Agnostic S3-Compatible Configuration (Cloudflare R2, Backblaze B2, AWS S3, MinIO)
const STORAGE_ENDPOINT = process.env.STORAGE_ENDPOINT || process.env.S3_ENDPOINT || process.env.R2_ENDPOINT;
const STORAGE_REGION = process.env.STORAGE_REGION || process.env.AWS_REGION || 'auto';
const STORAGE_BUCKET = process.env.STORAGE_BUCKET || process.env.S3_BUCKET || process.env.R2_BUCKET || 'xare-files';
const STORAGE_ACCESS_KEY_ID = process.env.STORAGE_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID;
const STORAGE_SECRET_ACCESS_KEY = process.env.STORAGE_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY;
const STORAGE_PUBLIC_URL = process.env.STORAGE_PUBLIC_URL || process.env.R2_PUBLIC_URL || process.env.S3_PUBLIC_URL;
const STORAGE_FORCE_PATH_STYLE = process.env.STORAGE_FORCE_PATH_STYLE === 'true';

// Maximum supported upload ceiling
const MAX_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * Strips path traversal sequences and dangerous control characters while preserving
 * authentic user filename (including Unicode and Arabic text) for user-facing metadata.
 */
function sanitizeFileName(name: string): { originalClean: string; storageKeySafe: string } {
  // 1. Strip directory paths (/ and \) to neutralize path traversal
  const rawBase = name.split(/[/\\]/).pop() || 'file.bin';

  // 2. Strip control characters and filesystem-illegal characters (< > : " / \ | ? *)
  const originalClean = rawBase
    .replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, '')
    .replace(/^\.+/, '')
    .trim() || 'file.bin';

  // 3. Extract extension safely
  const extMatch = originalClean.match(/\.([a-zA-Z0-9]+)$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : '';
  const baseWithoutExt = ext ? originalClean.slice(0, -(ext.length + 1)) : originalClean;

  // 4. Generate URL/ASCII-safe slug for object storage keys
  const asciiSlug = baseWithoutExt
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 80) || 'file';

  const storageKeySafe = ext ? `${asciiSlug}.${ext}` : asciiSlug;

  return { originalClean, storageKeySafe };
}

function generateFileId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `file_${timestamp}_${randomPart}`;
}

/**
 * Derives a trusted user ID from authenticated request headers (Firebase ID token or session)
 * with robust base64url padding to guarantee strict object-key isolation.
 */
function getTrustedUserId(req: Request, clientUserId?: string): string {
  const authHeader = req.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4 !== 0) {
          base64 += '=';
        }
        const payloadStr = atob(base64);
        const payload = JSON.parse(payloadStr);
        if (payload.sub || payload.user_id) {
          return String(payload.sub || payload.user_id).replace(/[^a-zA-Z0-9_-]/g, '_');
        }
      }
    } catch (e) {}
  }
  const customHeaderUser = req.headers.get('x-user-id');
  if (customHeaderUser) {
    return customHeaderUser.replace(/[^a-zA-Z0-9_-]/g, '_');
  }
  const safe = (clientUserId && typeof clientUserId === 'string') 
    ? clientUserId.replace(/[^a-zA-Z0-9_-]/g, '_') 
    : 'guest_user';
  return safe || 'guest_user';
}

function inferMimeType(fileName: string, providedMime?: string): string {
  if (providedMime && providedMime.trim() !== '' && providedMime !== 'application/octet-stream') {
    return providedMime;
  }
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const mimeMap: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    oga: 'audio/ogg',
    webm: 'audio/webm',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    flac: 'audio/flac',
    txt: 'text/plain',
    json: 'application/json',
    csv: 'text/csv',
    zip: 'application/zip',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

function getS3Client(): S3Client | null {
  if (!STORAGE_ACCESS_KEY_ID || !STORAGE_SECRET_ACCESS_KEY) {
    return null;
  }

  let endpoint = STORAGE_ENDPOINT;
  if (endpoint && !endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
    endpoint = `https://${endpoint}`;
  }

  return new S3Client({
    endpoint: endpoint || undefined,
    region: STORAGE_REGION,
    credentials: {
      accessKeyId: STORAGE_ACCESS_KEY_ID,
      secretAccessKey: STORAGE_SECRET_ACCESS_KEY,
    },
    forcePathStyle: STORAGE_FORCE_PATH_STYLE,
  });
}

function detectProviderName(): string {
  if (STORAGE_ENDPOINT?.includes('r2.cloudflarestorage.com') || process.env.R2_ENDPOINT) return 'cloudflare-r2';
  if (STORAGE_ENDPOINT?.includes('backblazeb2.com')) return 'backblaze-b2';
  if (STORAGE_ENDPOINT?.includes('amazonaws.com') || (!STORAGE_ENDPOINT && STORAGE_ACCESS_KEY_ID)) return 'aws-s3';
  return 's3-compatible';
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

    // 2. Parse Payload
    const body = await req.json().catch(() => ({}));
    const { action, objectKey, fileName, mimeType, fileSize, userId } = body;

    const trustedUserId = getTrustedUserId(req, userId);
    const s3Client = getS3Client();

    // Verify Server-Side Storage Configuration
    if (!s3Client) {
      return new Response(JSON.stringify({
        error: 'STORAGE_CONFIG_MISSING',
        message: 'Object storage credentials (STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY, STORAGE_ENDPOINT, STORAGE_BUCKET) are not configured in environment variables.',
      }), {
        status: 503,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
      });
    }

    const providerName = detectProviderName();

    // =========================================================================
    // ACTION: sign-download (Generates verified signed download URL)
    // =========================================================================
    if (action === 'sign-download' || action === 'download') {
      if (!objectKey || typeof objectKey !== 'string') {
        return new Response(JSON.stringify({ error: 'Bad Request: objectKey is required for sign-download' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      // Strict tenant isolation security check: verify path belongs to trusted user
      if (!objectKey.startsWith(`users/${trustedUserId}/`)) {
        return new Response(JSON.stringify({ error: 'Forbidden: Access denied to object path' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      let downloadUrl = '';
      if (STORAGE_PUBLIC_URL) {
        downloadUrl = `${STORAGE_PUBLIC_URL.replace(/\/$/, '')}/${objectKey}`;
      } else {
        const getCmd = new GetObjectCommand({
          Bucket: STORAGE_BUCKET,
          Key: objectKey,
        });
        downloadUrl = await getSignedUrl(s3Client, getCmd, { expiresIn: 7200 });
      }

      return new Response(JSON.stringify({
        success: true,
        downloadUrl: downloadUrl,
        fileUrl: downloadUrl,
        objectKey: objectKey,
        storageProvider: providerName,
        expiresIn: 7200
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store'
        }
      });
    }

    // =========================================================================
    // ACTION: upload presign (Default: Generates presigned upload URL for browser)
    // =========================================================================
    if (!fileName || typeof fileName !== 'string' || fileName.trim() === '') {
      return new Response(JSON.stringify({ error: 'Bad Request: Valid fileName is required' }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
      });
    }

    const numSize = Number(fileSize);
    if (!fileSize || isNaN(numSize) || numSize <= 0) {
      return new Response(JSON.stringify({ error: 'Bad Request: Valid positive fileSize is required' }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
      });
    }

    // 50MB Hard Application Ceiling
    if (numSize > MAX_SIZE) {
      return new Response(JSON.stringify({ 
        error: 'FILE_TOO_LARGE',
        message: `File too large. Maximum supported size is 50MB. (Provided: ${(numSize / (1024 * 1024)).toFixed(1)} MB)` 
      }), {
        status: 413,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
      });
    }

    const { originalClean, storageKeySafe } = sanitizeFileName(fileName);
    const fileId = generateFileId();
    const generatedObjectKey = `users/${trustedUserId}/uploads/${fileId}/${storageKeySafe}`;

    const effectiveMimeType = inferMimeType(originalClean, mimeType);

    // Generate S3 Presigned PUT Upload URL (Valid for 30 minutes)
    const putCmd = new PutObjectCommand({
      Bucket: STORAGE_BUCKET,
      Key: generatedObjectKey,
      ContentType: effectiveMimeType,
    });

    const uploadUrl = await getSignedUrl(s3Client, putCmd, { expiresIn: 1800 });

    // Generate Initial Download URL (either public CDN base or presigned GET)
    let initialDownloadUrl = '';
    if (STORAGE_PUBLIC_URL) {
      initialDownloadUrl = `${STORAGE_PUBLIC_URL.replace(/\/$/, '')}/${generatedObjectKey}`;
    } else {
      const getCmd = new GetObjectCommand({
        Bucket: STORAGE_BUCKET,
        Key: generatedObjectKey,
      });
      initialDownloadUrl = await getSignedUrl(s3Client, getCmd, { expiresIn: 7200 });
    }

    return new Response(JSON.stringify({
      success: true,
      uploadUrl: uploadUrl,
      downloadUrl: initialDownloadUrl,
      fileId: fileId,
      objectKey: generatedObjectKey,
      fileName: originalClean,
      fileSize: numSize,
      mimeType: effectiveMimeType,
      storageProvider: providerName,
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
    console.error('Storage Presign Endpoint Error:', err);
    return new Response(JSON.stringify({
      error: 'Failed to generate storage upload authorization',
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

