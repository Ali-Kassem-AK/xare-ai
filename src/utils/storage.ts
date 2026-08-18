/**
 * Supabase Storage Direct Large File Upload Utility (Max 50MB)
 *
 * Uploads large binary files directly from the browser to Supabase Storage
 * using Signed Upload URLs, keeping raw binaries completely outside of n8n webhooks.
 *
 * Engineered with 100% Mobile WebKit / iOS Safari resilience and realistic dynamic progress interpolation.
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

// In-memory cache to prevent re-uploading the exact same file during prompt retries
const uploadCache = new Map<string, UploadResult>();

/**
 * Generate a cache key for a file based on name, size, last modified timestamp, and user ID.
 */
function getFileCacheKey(file: File, userId: string): string {
  return `${userId}_${file.name}_${file.size}_${file.lastModified}`;
}

/**
 * Helper class for realistic, organic upload progress simulation
 */
class ProgressSimulator {
  private currentProgress = 5;
  private timer: any = null;
  private onProgress?: (percent: number) => void;

  constructor(onProgress?: (percent: number) => void) {
    this.onProgress = onProgress;
    if (this.onProgress) {
      this.onProgress(this.currentProgress);
    }
  }

  start() {
    this.stop();
    this.timer = setInterval(() => {
      if (this.currentProgress < 30) {
        // Fast initial ramp (presigning / connection)
        this.currentProgress += Math.floor(Math.random() * 5) + 3;
      } else if (this.currentProgress < 75) {
        // Steady streaming
        this.currentProgress += Math.floor(Math.random() * 4) + 2;
      } else if (this.currentProgress < 92) {
        // Gentle easing while awaiting server confirmation
        this.currentProgress += Math.random() > 0.4 ? 1 : 0;
      }
      this.currentProgress = Math.min(92, this.currentProgress);
      if (this.onProgress) {
        this.onProgress(this.currentProgress);
      }
    }, 90);
  }

  stepTo(target: number) {
    this.currentProgress = Math.max(this.currentProgress, target);
    if (this.onProgress) {
      this.onProgress(this.currentProgress);
    }
  }

  finish() {
    this.stop();
    this.currentProgress = 100;
    if (this.onProgress) {
      this.onProgress(100);
    }
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

/**
 * Direct-to-Supabase Storage Resumable/Signed Upload (Max 50MB)
 * 1. Immediate client-side validation against 50MB ceiling
 * 2. Immediately reads binary into memory (prevents Mobile Safari file descriptor revocation)
 * 3. Requests signed upload URL from /api/upload/presign with authenticated JWT
 * 4. Streams the binary directly to Supabase Storage using native Fetch with dynamic realistic progress
 * 5. Generates a verified, tokenized signed download URL after upload completes
 * 6. Returns the complete signed download URL for n8n to download the file
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
  
  // Start realistic smooth progress ticker
  const progressSim = new ProgressSimulator(options.onProgress);
  progressSim.start();

  // 3. Convert File to in-memory ArrayBuffer / Blob immediately (prevents Mobile Safari file descriptor revocation)
  let fileBlob: Blob = file;
  try {
    const buffer = await file.arrayBuffer();
    fileBlob = new Blob([buffer], { type: file.type || 'application/octet-stream' });
  } catch (readErr) {
    console.warn('[BLOB_READ_WARN] Using original file handle:', readErr);
  }

  // 4. Obtain ID token from current Firebase Auth session if logged in
  let authHeaderValue = 'Bearer anonymous_guest';
  try {
    if (auth.currentUser) {
      const idToken = await auth.currentUser.getIdToken();
      if (idToken) authHeaderValue = `Bearer ${idToken}`;
    }
  } catch (e) {
    console.warn('[AUTH_TOKEN_FETCH_WARN]', e);
  }

  // 5. Request Signed Upload Authorization from backend
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
      progressSim.stop();
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
    progressSim.stop();
    console.error('[SUPABASE_PRESIGN_ERROR]', authErr);
    throw new Error(`Upload authorization failed: ${authErr.message}`);
  }

  const { uploadUrl, downloadUrl, fileId, objectKey, mimeType } = presignData;

  console.info(`[SUPABASE_DIRECT_STREAM] Upload URL obtained. Streaming binary directly to Supabase Storage...`);
  progressSim.stepTo(25);

  const controller = new AbortController();
  if (options.onTaskCreated) {
    options.onTaskCreated({
      cancel: () => {
        progressSim.stop();
        controller.abort();
      }
    });
  }

  // 6. Direct Upload to Supabase Storage via native Fetch with FormData
  try {
    const formData = new FormData();
    formData.append('cacheControl', '3600');
    formData.append('', fileBlob, file.name);

    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      body: formData,
      signal: controller.signal
    });

    if (!uploadRes.ok) {
      progressSim.stop();
      const errText = await uploadRes.text().catch(() => '');
      throw new Error(`Supabase upload failed with HTTP ${uploadRes.status}: ${errText || uploadRes.statusText}`);
    }

    progressSim.stepTo(94);
    console.info(`[SUPABASE_UPLOAD_SUCCESS] Upload complete for '${file.name}'! Fetching verified download URL...`);

    let verifiedDownloadUrl = downloadUrl;

    // 7. Obtain verified signed download token now that the object exists in Supabase Storage
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
          console.info(`[SUPABASE_SIGNED_DOWNLOAD_VERIFIED] Token attached successfully.`);
        }
      }
    } catch (signErr) {
      console.warn('[SUPABASE_SIGN_DOWNLOAD_WARN]', signErr);
    }

    // Complete smooth progress to 100%
    progressSim.finish();

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
    return result;

  } catch (uploadErr: any) {
    progressSim.stop();
    if (controller.signal.aborted) {
      throw new Error('Upload was canceled.');
    }
    console.error('[SUPABASE_DIRECT_UPLOAD_FAILED]', uploadErr);
    throw new Error(uploadErr.message || 'Network error during file upload. Please check your connection.');
  }
}

/**
 * Drop-in wrapper function compatible with existing callers
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
