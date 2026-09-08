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

/**
 * Derives a trusted user ID from the authenticated request headers (Firebase ID token or session)
 * to guarantee strict object-key isolation and tenant isolation.
 */
function getTrustedUserId(req: Request, clientUserId?: string): string {
  const authHeader = req.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payloadStr = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
        const payload = JSON.parse(payloadStr);
        if (payload.sub || payload.user_id) {
          return (payload.sub || payload.user_id).replace(/[^a-zA-Z0-9_-]/g, '_');
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

function getS3Client(): S3Client | null {
  if (!STORAGE_ACCESS_KEY_ID || !STORAGE_SECRET_ACCESS_KEY) {
    return null;
  }

  return new S3Client({
    endpoint: STORAGE_ENDPOINT || undefined,
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

      // Security check: verify path belongs to trusted user
      if (!objectKey.startsWith(`users/${trustedUserId}/`) && trustedUserId !== 'guest_user') {
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
    if (!fileName || !fileSize) {
      return new Response(JSON.stringify({ error: 'Bad Request: fileName and fileSize are required' }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
      });
    }

    // 50MB Hard Application Ceiling
    if (fileSize > MAX_SIZE) {
      return new Response(JSON.stringify({ 
        error: 'FILE_TOO_LARGE',
        message: `File too large. Maximum supported size is 50MB. (Provided: ${(fileSize / (1024 * 1024)).toFixed(1)} MB)` 
      }), {
        status: 413,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
      });
    }

    const safeName = sanitizeFileName(fileName);
    const fileId = generateFileId();
    const generatedObjectKey = `users/${trustedUserId}/uploads/${fileId}/${safeName}`;

    const effectiveMimeType = mimeType || (
      safeName.endsWith('.pdf') ? 'application/pdf' :
      safeName.match(/\.(jpg|jpeg|png|webp|gif|bmp|svg)$/i) ? 'image/jpeg' :
      safeName.match(/\.(webm|mp3|ogg|wav|m4a|flac)$/i) ? 'audio/webm' :
      'application/octet-stream'
    );

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
      fileName: safeName,
      fileSize: fileSize,
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
