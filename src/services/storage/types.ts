/**
 * Provider-neutral Storage Abstraction Type Definitions for Xare AI
 * 
 * Supports S3-compatible object storage (Cloudflare R2, Backblaze B2, AWS S3, MinIO)
 * with direct browser streaming, mobile Safari resilience, and realistic progress tracking.
 */

export type StorageProviderType = 's3' | 'r2' | 'b2' | 'blob' | 'fallback' | 'supabase';

export interface UploadProgressInfo {
  percent: number;
  bytesUploaded: number;
  totalBytes: number;
  state?: string;
}

export interface UploadTaskHandle {
  cancel: () => void;
}

export interface UploadOptions {
  onProgress?: (percent: number, info?: UploadProgressInfo) => void;
  onStateChange?: (state: string) => void;
  userId?: string;
  maxSizeBytes?: number;
  timeoutMs?: number;
  onTaskCreated?: (task: UploadTaskHandle) => void;
}

export interface UploadResult {
  fileId: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storagePath: string;
  storageProvider: string;
  uploadedAt: string;
}

export interface PresignUploadRequest {
  fileName: string;
  fileSize: number;
  mimeType: string;
  userId?: string;
}

export interface PresignUploadResponse {
  success: boolean;
  uploadUrl: string;
  downloadUrl: string;
  fileId: string;
  objectKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageProvider: string;
  headers?: Record<string, string>;
  expiresIn: number;
}

export interface PresignDownloadRequest {
  action: 'sign-download' | 'download';
  objectKey: string;
  userId?: string;
  expiresIn?: number;
}

export interface PresignDownloadResponse {
  success: boolean;
  downloadUrl: string;
  fileUrl: string;
  objectKey: string;
  expiresIn: number;
}

export interface StorageProviderConfig {
  endpoint?: string;
  region?: string;
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  publicUrlBase?: string;
  forcePathStyle?: boolean;
}
