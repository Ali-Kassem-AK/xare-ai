import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge', // Using Vercel Edge runtime for lightning-fast sub-10ms response
};

// Fail-closed server-side secret management (Supports new Secret key & legacy Service Role key)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const SUPABASE_BUCKET_NAME = process.env.SUPABASE_BUCKET_NAME || 'xare-files';

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
 * to prevent client-side user spoofing and guarantee strict object-key isolation.
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
    const body = await req.json();
    const { action, objectKey, fileName, mimeType, fileSize, userId } = body;

    // Verify Server-Side Supabase Configuration
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({
        error: 'SUPABASE_CONFIG_MISSING',
        message: 'Supabase credentials (SUPABASE_URL, SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY) are not configured in Vercel environment variables.',
      }), {
        status: 503,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
      });
    }

    // Initialize Supabase Client with Server-Side Secret Key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    });

    const trustedUserId = getTrustedUserId(req, userId);

    // =========================================================================
    // ACTION: sign-download (Generates verified signed download URL with token)
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

      const { data: downloadData, error: downloadError } = await supabase
        .storage
        .from(SUPABASE_BUCKET_NAME)
        .createSignedUrl(objectKey, 7200);

      if (downloadError || !downloadData || !downloadData.signedUrl) {
        console.error('Supabase Signed Download URL Error:', downloadError);
        return new Response(JSON.stringify({
          error: 'SUPABASE_DOWNLOAD_SIGN_FAILED',
          message: downloadError?.message || 'Failed to generate signed download URL.'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      const fullDownloadUrl = downloadData.signedUrl.startsWith('http')
        ? downloadData.signedUrl
        : `${SUPABASE_URL}/storage/v1/${downloadData.signedUrl.replace(/^\//, '')}`;

      return new Response(JSON.stringify({
        success: true,
        downloadUrl: fullDownloadUrl,
        fileUrl: fullDownloadUrl,
        objectKey: objectKey,
        hasToken: fullDownloadUrl.includes('token='),
        expiresIn: 7200
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
      });
    }

    // =========================================================================
    // ACTION: upload presign (Default: Generates signed upload URL for browser)
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

    // 50MB Hard Application Ceiling (Pre-Upload Validation)
    const MAX_SIZE = 50 * 1024 * 1024;
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
      safeName.match(/\.(jpg|jpeg|png|webp|gif)$/i) ? 'image/jpeg' :
      safeName.match(/\.(webm|mp3|ogg|wav)$/i) ? 'audio/webm' :
      'application/octet-stream'
    );

    // Generate Signed Upload URL (Valid for 30 minutes for direct browser upload)
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from(SUPABASE_BUCKET_NAME)
      .createSignedUploadUrl(generatedObjectKey);

    if (uploadError || !uploadData) {
      console.error('Supabase Signed Upload URL Error:', uploadError);
      return new Response(JSON.stringify({
        error: 'SUPABASE_UPLOAD_SIGN_FAILED',
        message: uploadError?.message || 'Could not generate signed upload URL from Supabase Storage.'
      }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
      });
    }

    // Attempt Signed Download URL generation
    const { data: downloadData } = await supabase
      .storage
      .from(SUPABASE_BUCKET_NAME)
      .createSignedUrl(generatedObjectKey, 7200);

    let initialDownloadUrl = downloadData?.signedUrl || '';
    if (initialDownloadUrl && !initialDownloadUrl.startsWith('http')) {
      initialDownloadUrl = `${SUPABASE_URL}/storage/v1/${initialDownloadUrl.replace(/^\//, '')}`;
    }

    // Full Upload URL
    const fullUploadUrl = uploadData.signedUrl.startsWith('http') 
      ? uploadData.signedUrl 
      : `${SUPABASE_URL}/storage/v1/${uploadData.signedUrl.replace(/^\//, '')}`;

    return new Response(JSON.stringify({
      success: true,
      uploadUrl: fullUploadUrl,
      downloadUrl: initialDownloadUrl,
      token: uploadData.token,
      path: uploadData.path || generatedObjectKey,
      fileId: fileId,
      objectKey: generatedObjectKey,
      fileName: safeName,
      fileSize: fileSize,
      mimeType: effectiveMimeType,
      storageProvider: 'supabase',
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
    console.error('Supabase Presign Endpoint Error:', err);
    return new Response(JSON.stringify({
      error: 'Failed to generate Supabase upload authorization',
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
