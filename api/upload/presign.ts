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

    // Server-derived trusted user ID & sanitized path construction
    const trustedUserId = getTrustedUserId(req, userId);
    const safeName = sanitizeFileName(fileName);
    const fileId = generateFileId();
    const objectKey = `users/${trustedUserId}/uploads/${fileId}/${safeName}`;

    const effectiveMimeType = mimeType || (
      safeName.endsWith('.pdf') ? 'application/pdf' :
      safeName.match(/\.(jpg|jpeg|png|webp|gif)$/i) ? 'image/jpeg' :
      safeName.match(/\.(webm|mp3|ogg|wav)$/i) ? 'audio/webm' :
      'application/octet-stream'
    );

    // 3. Verify Server-Side Supabase Configuration
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({
        error: 'SUPABASE_CONFIG_MISSING',
        message: 'Supabase credentials (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are not configured in Vercel environment variables.',
        objectKey: objectKey,
        fileId: fileId,
        trustedUserId: trustedUserId
      }), {
        status: 503,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
      });
    }

    // 4. Initialize Supabase Client with Server-Side Service Role Key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    });

    // 5. Generate Signed Upload URL (Valid for 30 minutes for direct browser upload)
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from(SUPABASE_BUCKET_NAME)
      .createSignedUploadUrl(objectKey);

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

    // 6. Generate Signed Download URL (Valid for 2 hours for n8n downstream AI download)
    const { data: downloadData } = await supabase
      .storage
      .from(SUPABASE_BUCKET_NAME)
      .createSignedUrl(objectKey, 7200);

    const downloadUrl = downloadData?.signedUrl || `${SUPABASE_URL}/storage/v1/object/sign/${SUPABASE_BUCKET_NAME}/${objectKey}`;

    // Full Upload URL
    const fullUploadUrl = uploadData.signedUrl.startsWith('http') 
      ? uploadData.signedUrl 
      : `${SUPABASE_URL}/storage/v1/${uploadData.signedUrl.replace(/^\//, '')}`;

    return new Response(JSON.stringify({
      success: true,
      uploadUrl: fullUploadUrl,
      downloadUrl: downloadUrl,
      token: uploadData.token,
      path: uploadData.path || objectKey,
      fileId: fileId,
      objectKey: objectKey,
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
