import { 
  getStorage, 
  ref, 
  uploadBytesResumable, 
  getDownloadURL, 
  UploadTask, 
  UploadTaskSnapshot 
} from 'firebase/storage';
import { getAuth } from 'firebase/auth';

export interface UploadResult {
  fileId: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storagePath: string;
  uploadedAt: string;
}

export interface UploadOptions {
  onProgress?: (percent: number, snapshot: UploadTaskSnapshot) => void;
  onStateChange?: (state: string) => void;
  userId?: string;
  maxSizeBytes?: number;
  timeoutMs?: number;
  onTaskCreated?: (task: UploadTask) => void;
}

const MAX_FILE_SIZE_DEFAULT = 100 * 1024 * 1024; // 100 MB default max
const DEFAULT_TIMEOUT_MS = 20000; // 20-second activity timeout to prevent infinite hanging

// In-memory cache to prevent re-uploading the exact same file during retry / reconnect
const uploadCache = new Map<string, UploadResult>();

/**
 * Generate a cache key for a file based on name, size, and last modified timestamp.
 */
function getFileCacheKey(file: File, userId: string): string {
  return `${userId}_${file.name}_${file.size}_${file.lastModified}`;
}

/**
 * Sanitize a user-provided file name to prevent path traversal and special character issues.
 */
export function sanitizeFileName(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  // Avoid leading dots or path traversal
  const cleaned = base.replace(/^\.+/, '');
  return cleaned.substring(0, 120) || 'file.bin';
}

/**
 * Generate a unique file ID.
 */
export function generateFileId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `file_${timestamp}_${randomPart}`;
}

/**
 * Direct-to-Firebase Storage Resumable Upload
 * Streams the file directly from the browser to Firebase Storage, avoiding any
 * intermediate proxies or n8n webhook size limits.
 *
 * @param file The browser File object to upload
 * @param options Progress callbacks, user ID override, timeout, and upload task hooks
 * @returns Promise resolving to the UploadResult containing download URL and metadata
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

  // Determine current authenticated user
  const auth = getAuth();
  const currentUserId = options.userId || auth.currentUser?.uid || 'guest_user';

  // Check upload cache for instantaneous retry recovery
  const cacheKey = getFileCacheKey(file, currentUserId);
  const cached = uploadCache.get(cacheKey);
  if (cached && cached.fileUrl && cached.fileUrl.startsWith('http')) {
    console.info(`[UPLOAD_CACHE_HIT] Reusing existing upload token for '${file.name}'`);
    if (options.onProgress) {
      options.onProgress(100, null as any);
    }
    return cached;
  }

  const storage = getStorage();
  
  // Set fail-fast retry thresholds so network/404 errors surface in seconds instead of 10 minutes
  storage.maxUploadRetryTime = 12000; // 12 seconds max retry
  storage.maxOperationRetryTime = 12000;

  const fileId = generateFileId();
  const safeName = sanitizeFileName(file.name);
  const storagePath = `users/${currentUserId}/uploads/${fileId}/${safeName}`;
  const storageRef = ref(storage, storagePath);

  const mimeType = file.type || (
    file.name.endsWith('.pdf') ? 'application/pdf' :
    file.name.match(/\.(jpg|jpeg|png|webp|gif)$/i) ? 'image/jpeg' :
    file.name.match(/\.(webm|mp3|ogg|wav)$/i) ? 'audio/webm' :
    'application/octet-stream'
  );

  const customMetadata = {
    originalName: file.name,
    fileId: fileId,
    uploadedBy: currentUserId,
    mimeType: mimeType,
    uploadedAt: new Date().toISOString()
  };

  console.info(`[UPLOAD_START] Starting upload: '${file.name}' (${(file.size / (1024*1024)).toFixed(2)} MB) to '${storagePath}' (Auth UID: ${auth.currentUser?.uid || 'none'})`);

  return new Promise<UploadResult>((resolve, reject) => {
    let uploadTask: UploadTask;
    let isSettled = false;
    let timeoutTimer: NodeJS.Timeout | null = null;
    let lastProgressTime = Date.now();

    const cleanup = () => {
      isSettled = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);
    };

    try {
      uploadTask = uploadBytesResumable(
        storageRef, 
        file, 
        {
          contentType: mimeType,
          customMetadata: customMetadata
        }
      );
    } catch (initErr: any) {
      console.error('[UPLOAD_INIT_ERROR]', initErr);
      reject(new Error(`Could not initiate storage upload: ${initErr.message}`));
      return;
    }

    if (options.onTaskCreated) {
      options.onTaskCreated(uploadTask);
    }

    // Activity Watchdog: if no progress occurs within timeoutMs, fail fast with diagnostic reason
    const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    timeoutTimer = setTimeout(() => {
      if (!isSettled) {
        console.warn(`[UPLOAD_TIMEOUT] Upload stalled at 0% for ${timeoutMs/1000}s. Aborting task.`);
        try {
          uploadTask.cancel();
        } catch (e) {}
        cleanup();
        reject(new Error(`Storage upload timed out at 0% after ${timeoutMs/1000}s. The Firebase Storage bucket (xare-5bc49.firebasestorage.app) is unreachable or not yet enabled in the Firebase Console.`));
      }
    }, timeoutMs);

    uploadTask.on(
      'state_changed',
      (snapshot: UploadTaskSnapshot) => {
        if (isSettled) return;
        lastProgressTime = Date.now();

        const progress = snapshot.totalBytes > 0 
          ? Math.min(100, Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100))
          : 0;

        console.info(`[UPLOAD_PROGRESS] ${file.name}: ${progress}% (${snapshot.bytesTransferred}/${snapshot.totalBytes} bytes) - State: ${snapshot.state}`);

        if (options.onProgress) {
          options.onProgress(progress, snapshot);
        }

        if (options.onStateChange) {
          options.onStateChange(snapshot.state);
        }
      },
      (error: any) => {
        if (isSettled) return;
        cleanup();
        console.error('[UPLOAD_ERROR]', error.code, error.message, error.customData);
        
        let userMessage = error.message || 'Failed to upload file to storage.';
        if (error.code === 'storage/unauthorized') {
          userMessage = 'Storage permission denied: Please sign in or ensure you have upload permissions.';
        } else if (error.code === 'storage/canceled') {
          userMessage = 'Upload was canceled.';
        } else if (error.code === 'storage/retry-limit-exceeded' || error.code === 'storage/unknown' || error.status_ === 404) {
          userMessage = 'Firebase Storage bucket (xare-5bc49.firebasestorage.app) is not reachable or not yet provisioned in Firebase Console.';
        } else if (error.code === 'storage/quota-exceeded') {
          userMessage = 'Firebase Storage quota exceeded.';
        }
        reject(new Error(userMessage));
      },
      async () => {
        if (isSettled) return;
        cleanup();
        try {
          // Upload complete — obtain tokenized download URL via Firebase getDownloadURL()
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          console.info(`[UPLOAD_COMPLETE] Successfully uploaded '${file.name}' -> ${downloadUrl.substring(0, 80)}...`);

          const result: UploadResult = {
            fileId: fileId,
            fileUrl: downloadUrl,
            fileName: file.name,
            fileSize: file.size,
            mimeType: mimeType,
            storagePath: storagePath,
            uploadedAt: new Date().toISOString()
          };

          // Cache result for quick retries
          uploadCache.set(cacheKey, result);

          if (options.onProgress) {
            options.onProgress(100, uploadTask.snapshot);
          }

          resolve(result);
        } catch (urlError: any) {
          console.error('[UPLOAD_URL_ERROR] Failed to retrieve storage download URL:', urlError);
          reject(new Error('File uploaded to storage but failed to retrieve access URL.'));
        }
      }
    );
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
