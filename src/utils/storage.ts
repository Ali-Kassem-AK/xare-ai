/**
 * Cloudflare R2 Direct Large File Upload Utility
 *
 * Replaces Firebase Storage with zero-cost Cloudflare R2 object storage.
 * Files are uploaded directly from the browser to Cloudflare R2 via presigned PUT URLs,
 * completely bypassing Vercel/n8n proxies.
 */

export interface UploadResult {
  fileId: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storagePath: string;
  storageProvider: 'cloudflare-r2';
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

const MAX_FILE_SIZE_DEFAULT = 100 * 1024 * 1024; // 100 MB default max
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
 * Direct-to-Cloudflare R2 Upload
 * 1. Requests a presigned PUT URL from /api/upload/presign
 * 2. Streams the binary directly to Cloudflare R2 using XMLHttpRequest with progress tracking
 * 3. Returns the presigned download URL for n8n to process
 */
export async function uploadFileDirectly(
  file: File,
  options: UploadOptions = {}
): Promise<UploadResult> {
  const maxBytes = options.maxSizeBytes || MAX_FILE_SIZE_DEFAULT;
  if (file.size > maxBytes) {
    const maxMb = Math.round(maxBytes / (1024 * 1024));
    throw new Error(`File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the maximum allowed limit of ${maxMb} MB.`);
  }

  const currentUserId = options.userId || 'guest_user';

  // 1. Check in-memory cache for instant zero-overhead retry
  const cacheKey = getFileCacheKey(file, currentUserId);
  const cached = uploadCache.get(cacheKey);
  if (cached && cached.fileUrl && cached.fileUrl.startsWith('http')) {
    console.info(`[R2_CACHE_HIT] Reusing existing R2 upload for '${file.name}'`);
    if (options.onProgress) {
      options.onProgress(100);
    }
    return cached;
  }

  console.info(`[R2_UPLOAD_START] Requesting presigned authorization for '${file.name}' (${(file.size / (1024*1024)).toFixed(2)} MB)`);

  // 2. Request Presigned Upload Authorization from backend
  let presignData: any;
  try {
    const presignRes = await fetch('/api/upload/presign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
      if (errJson.error === 'R2_CONFIG_MISSING') {
        throw new Error(`Cloudflare R2 is not configured: ${errJson.message}`);
      }
      throw new Error(errJson.error || errJson.message || `Presign failed with HTTP ${presignRes.status}`);
    }

    presignData = await presignRes.json();
  } catch (authErr: any) {
    console.error('[R2_PRESIGN_ERROR]', authErr);
    throw new Error(`Upload authorization failed: ${authErr.message}`);
  }

  const { uploadUrl, downloadUrl, fileId, objectKey, mimeType } = presignData;

  console.info(`[R2_DIRECT_STREAM] Presigned URL obtained. Streaming binary directly to Cloudflare R2...`);

  // 3. Perform Direct Streaming Upload to Cloudflare R2 using XMLHttpRequest
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
            console.warn(`[R2_UPLOAD_CANCELED] User canceled upload for '${file.name}'`);
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
        console.info(`[R2_PROGRESS] ${file.name}: ${percent}% (${event.loaded}/${event.total} bytes)`);
        if (options.onProgress) {
          options.onProgress(percent);
        }
      }
    };

    xhr.onload = () => {
      if (isSettled) return;
      cleanup();

      if (xhr.status >= 200 && xhr.status < 300) {
        console.info(`[R2_UPLOAD_SUCCESS] Upload complete for '${file.name}'!`);
        if (options.onProgress) {
          options.onProgress(100);
        }

        const result: UploadResult = {
          fileId: fileId,
          fileUrl: downloadUrl,
          fileName: file.name,
          fileSize: file.size,
          mimeType: mimeType || file.type || 'application/octet-stream',
          storagePath: objectKey,
          storageProvider: 'cloudflare-r2',
          uploadedAt: new Date().toISOString()
        };

        // Cache result for quick retries
        uploadCache.set(cacheKey, result);
        resolve(result);
      } else {
        console.error(`[R2_UPLOAD_FAILED] HTTP ${xhr.status}: ${xhr.statusText}`);
        reject(new Error(`Direct R2 upload failed with HTTP ${xhr.status}: ${xhr.statusText || 'Storage error'}`));
      }
    };

    xhr.onerror = () => {
      if (isSettled) return;
      cleanup();
      console.error(`[R2_NETWORK_ERROR] Network connection failed during upload.`);
      reject(new Error('Network error during file upload. Please check your internet connection and retry.'));
    };

    xhr.ontimeout = () => {
      if (isSettled) return;
      cleanup();
      console.error(`[R2_TIMEOUT_ERROR] Upload timed out.`);
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
      xhr.open('PUT', uploadUrl, true);
      xhr.setRequestHeader('Content-Type', mimeType || file.type || 'application/octet-stream');
      xhr.send(file);
    } catch (sendErr: any) {
      cleanup();
      console.error('[R2_SEND_ERROR]', sendErr);
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
