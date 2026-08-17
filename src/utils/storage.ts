/**
 * Supabase Storage Direct Large File Upload Utility (Max 50MB)
 *
 * Uploads large binary files directly from the browser to Supabase Storage
 * using Signed Upload URLs, keeping raw binaries completely outside of n8n webhooks.
 */

import { getAuth } from 'firebase/auth';

export interface UploadResult {
  fileId: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storagePath: string;
  storageProvider: 'supabase';
  uploadedAt: string;
}

export interface UploadTaskHandle {
  cancel: () => void;
}

export interface UploadOptions {
  onProgress?: (percent: number) => void;
  onStateChange?: (state: string) => void;
  userId?: string;
  maxSizeBytes?: number;
  timeoutMs?: number;
  onTaskCreated?: (task: UploadTaskHandle) => void;
}

export const MAX_FILE_SIZE_DEFAULT = 50 * 1024 * 1024; // 50 MB hard maximum application ceiling
const DEFAULT_TIMEOUT_MS = 60000; // 60s timeout for large file upload chunking

// In-memory cache to prevent re-uploading the exact same file during prompt retries
const uploadCache = new Map<string, UploadResult>();

/**
 * Generate a cache key for a file based on name, size, last modified timestamp, and user ID.
 */
function getFileCacheKey(file: File, userId: string): string {
  return `${userId}_${file.name}_${file.size}_${file.lastModified}`;
}

/**
 * Direct-to-Supabase Storage Resumable/Signed Upload (Max 50MB)
 * 1. Immediate client-side validation against 50MB ceiling
 * 2. Requests signed upload URL from /api/upload/presign with authenticated JWT
 * 3. Streams the binary directly to Supabase Storage using XMLHttpRequest with progress tracking
 * 4. Generates a verified, tokenized signed download URL after upload completes
 * 5. Returns the complete signed download URL for n8n to download the file
 */
export async function uploadFileDirectly(
  file: File,
  options: UploadOptions = {}
): Promise<UploadResult> {
  const maxBytes = options.maxSizeBytes || MAX_FILE_SIZE_DEFAULT;
  
  // 1. Strict Immediate 50MB Validation
  if (file.size > maxBytes) {
    const maxMb = Math.round(maxBytes / (1024 * 1024));
    throw new Error(`File too large. Maximum supported size is ${maxMb}MB. (Provided: ${(file.size / (1024 * 1024)).toFixed(1)} MB)`);
  }

  const auth = getAuth();
  const currentUserId = options.userId || auth.currentUser?.uid || 'guest_user';

  // 2. Check in-memory cache for instant zero-overhead retry
  const cacheKey = getFileCacheKey(file, currentUserId);
  const cached = uploadCache.get(cacheKey);
  if (cached && cached.fileUrl && cached.fileUrl.startsWith('http') && cached.fileUrl.includes('token=')) {
    console.info(`[SUPABASE_CACHE_HIT] Reusing existing Supabase upload for '${file.name}'`);
    if (options.onProgress) {
      options.onProgress(100);
    }
    return cached;
  }

  console.info(`[SUPABASE_UPLOAD_START] Requesting signed upload authorization for '${file.name}' (${(file.size / (1024*1024)).toFixed(2)} MB)`);

  // 3. Obtain ID token from current Firebase Auth session if logged in
  let authHeaderValue = 'Bearer anonymous_guest';
  try {
    if (auth.currentUser) {
      const idToken = await auth.currentUser.getIdToken();
      if (idToken) authHeaderValue = `Bearer ${idToken}`;
    }
  } catch (e) {
    console.warn('[AUTH_TOKEN_FETCH_WARN]', e);
  }

  // 4. Request Signed Upload Authorization from backend
  let presignData: any;
  try {
    const presignRes = await fetch('/api/upload/presign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeaderValue,
        'x-chatbot-token': 'ali1234',
        'x-user-id': currentUserId
      },
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        userId: currentUserId
      })
    });

    if (!presignRes.ok) {
      const errJson = await presignRes.json().catch(() => ({}));
      if (errJson.error === 'SUPABASE_CONFIG_MISSING') {
        throw new Error(`Supabase Storage is not configured: ${errJson.message}`);
      }
      if (errJson.error === 'FILE_TOO_LARGE') {
        throw new Error(errJson.message || 'File too large. Maximum supported size is 50MB.');
      }
      throw new Error(errJson.error || errJson.message || `Presign failed with HTTP ${presignRes.status}`);
    }

    presignData = await presignRes.json();
  } catch (authErr: any) {
    console.error('[SUPABASE_PRESIGN_ERROR]', authErr);
    throw new Error(`Upload authorization failed: ${authErr.message}`);
  }

  const { uploadUrl, downloadUrl, fileId, objectKey, mimeType } = presignData;

  console.info(`[SUPABASE_DIRECT_STREAM] Signed upload URL obtained. Streaming binary directly to Supabase Storage...`);

  // 5. Perform Direct Streaming Upload to Supabase Storage using XMLHttpRequest
  return new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let isSettled = false;

    const cleanup = () => {
      isSettled = true;
    };

    if (options.onTaskCreated) {
      options.onTaskCreated({
        cancel: () => {
          if (!isSettled) {
            console.warn(`[SUPABASE_UPLOAD_CANCELED] User canceled upload for '${file.name}'`);
            xhr.abort();
            cleanup();
            reject(new Error('Upload was canceled.'));
          }
        }
      });
    }

    // Progress tracking (0% -> 100%)
    xhr.upload.onprogress = (event) => {
      if (isSettled) return;
      if (event.lengthComputable && event.total > 0) {
        const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
        console.info(`[SUPABASE_PROGRESS] ${file.name}: ${percent}% (${event.loaded}/${event.total} bytes)`);
        if (options.onProgress) {
          options.onProgress(percent);
        }
      }
    };

    xhr.onload = async () => {
      if (isSettled) return;
      cleanup();

      if (xhr.status >= 200 && xhr.status < 300) {
        console.info(`[SUPABASE_UPLOAD_SUCCESS] Upload complete for '${file.name}'! Fetching verified download URL with signed token...`);
        if (options.onProgress) {
          options.onProgress(100);
        }

        let verifiedDownloadUrl = downloadUrl;

        // Obtain verified signed download token now that the object exists in Supabase Storage
        try {
          const signRes = await fetch('/api/upload/presign', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': authHeaderValue,
              'x-chatbot-token': 'ali1234',
              'x-user-id': currentUserId
            },
            body: JSON.stringify({
              action: 'sign-download',
              objectKey: objectKey,
              userId: currentUserId
            })
          });

          if (signRes.ok) {
            const signData = await signRes.json();
            if (signData.downloadUrl) {
              verifiedDownloadUrl = signData.downloadUrl;
              console.info(`[SUPABASE_SIGNED_DOWNLOAD_VERIFIED] Token attached successfully (length: ${verifiedDownloadUrl.length})`);
            }
          }
        } catch (signErr) {
          console.warn('[SUPABASE_SIGN_DOWNLOAD_WARN]', signErr);
        }

        const result: UploadResult = {
          fileId: fileId,
          fileUrl: verifiedDownloadUrl,
          fileName: file.name,
          fileSize: file.size,
          mimeType: mimeType || file.type || 'application/octet-stream',
          storagePath: objectKey,
          storageProvider: 'supabase',
          uploadedAt: new Date().toISOString()
        };

        // Cache result for quick retries
        uploadCache.set(cacheKey, result);
        resolve(result);
      } else {
        console.error(`[SUPABASE_UPLOAD_FAILED] HTTP ${xhr.status}: ${xhr.statusText}`);
        reject(new Error(`Direct Supabase upload failed with HTTP ${xhr.status}: ${xhr.statusText || 'Storage error'}`));
      }
    };

    xhr.onerror = () => {
      if (isSettled) return;
      cleanup();
      console.error(`[SUPABASE_NETWORK_ERROR] Network connection failed during upload.`);
      reject(new Error('Network error during file upload. Please check your internet connection and retry.'));
    };

    xhr.ontimeout = () => {
      if (isSettled) return;
      cleanup();
      console.error(`[SUPABASE_TIMEOUT_ERROR] Upload timed out.`);
      reject(new Error('Upload timed out. Please try again with a faster network connection.'));
    };

    xhr.onabort = () => {
      if (isSettled) return;
      cleanup();
      reject(new Error('Upload was canceled.'));
    };

    const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    xhr.timeout = timeoutMs;

    try {
      // Supabase Signed Upload URLs accept PUT with the binary file
      xhr.open('PUT', uploadUrl, true);
      xhr.setRequestHeader('Content-Type', mimeType || file.type || 'application/octet-stream');
      xhr.send(file);
    } catch (sendErr: any) {
      cleanup();
      console.error('[SUPABASE_SEND_ERROR]', sendErr);
      reject(new Error(`Failed to initiate PUT request: ${sendErr.message}`));
    }
  });
}

/**
 * Drop-in wrapper function compatible with existing App.tsx callers
 */
export async function uploadFileDirect(
  file: File,
  onProgress?: (progress: number) => void
): Promise<UploadResult> {
  return uploadFileDirectly(file, {
    onProgress: (percent) => {
      if (onProgress) onProgress(percent);
    }
  });
}

/**
 * Clear cached upload results if needed (e.g. on session reset)
 */
export function clearUploadCache(): void {
  uploadCache.clear();
}
