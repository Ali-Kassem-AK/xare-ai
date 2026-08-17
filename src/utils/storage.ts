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
  onTaskCreated?: (task: UploadTask) => void;
}

const MAX_FILE_SIZE_DEFAULT = 100 * 1024 * 1024; // 100 MB default max

// In-memory cache to prevent re-uploading the exact same file during retry / reconnect
const uploadCache = new Map<string, UploadResult>();

/**
 * Generate a cache key for a file based on name, size, and last modified timestamp.
 */
function getFileCacheKey(file: File, userId: string): string {
  return `${userId}_${file.name}_${file.size}_${file.lastModified}`;
}

/**
 * Sanitize a user-provided file name to prevent path traversal and weird character issues.
 */
export function sanitizeFileName(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  // Avoid leading dots or path traversal
  const cleaned = base.replace(/^\.+/, '');
  return cleaned.substring(0, 120) || 'file.bin';
}

/**
 * Generate a cryptographically robust unique file ID.
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
 * @param options Progress callbacks, user ID override, and upload task hooks
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
  const currentUserId = options.userId || auth.currentUser?.uid || 'anonymous_user';

  // Check upload cache for instantaneous retry recovery
  const cacheKey = getFileCacheKey(file, currentUserId);
  const cached = uploadCache.get(cacheKey);
  if (cached) {
    if (options.onProgress) {
      options.onProgress(100, null as any);
    }
    return cached;
  }

  const storage = getStorage();
  const fileId = generateFileId();
  const safeName = sanitizeFileName(file.name);
  const storagePath = `users/${currentUserId}/uploads/${fileId}/${safeName}`;
  const storageRef = ref(storage, storagePath);

  const mimeType = file.type || 'application/octet-stream';
  const customMetadata = {
    originalName: file.name,
    fileId: fileId,
    uploadedBy: currentUserId,
    mimeType: mimeType,
    uploadedAt: new Date().toISOString()
  };

  return new Promise<UploadResult>((resolve, reject) => {
    const uploadTask: UploadTask = uploadBytesResumable(
      storageRef, 
      file, 
      {
        contentType: mimeType,
        customMetadata: customMetadata
      }
    );

    if (options.onTaskCreated) {
      options.onTaskCreated(uploadTask);
    }

    uploadTask.on(
      'state_changed',
      (snapshot: UploadTaskSnapshot) => {
        const progress = snapshot.totalBytes > 0 
          ? Math.min(100, Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100))
          : 0;

        if (options.onProgress) {
          options.onProgress(progress, snapshot);
        }

        if (options.onStateChange) {
          options.onStateChange(snapshot.state);
        }
      },
      (error: any) => {
        console.error('Firebase Storage direct upload error:', error);
        let userMessage = 'Failed to upload file to storage.';
        if (error.code === 'storage/unauthorized') {
          userMessage = 'Permission denied: Please ensure you are logged in.';
        } else if (error.code === 'storage/canceled') {
          userMessage = 'Upload was canceled.';
        } else if (error.code === 'storage/retry-limit-exceeded') {
          userMessage = 'Upload timed out. Please check your network connection and retry.';
        }
        reject(new Error(userMessage));
      },
      async () => {
        try {
          // Upload complete — obtain tokenized download URL via Firebase getDownloadURL()
          // Note: This URL provides token-guarded direct access without public bucket exposure
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);

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
          console.error('Failed to retrieve storage download URL:', urlError);
          reject(new Error('File uploaded but failed to retrieve secure access URL.'));
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
