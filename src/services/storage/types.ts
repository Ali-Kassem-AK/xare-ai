/**
 * Provider-neutral Storage Abstraction Type Definitions for Xare AI
 * 
 * Supports S3-compatible object storage (Cloudflare R2, Backblaze B2, AWS S3, MinIO)
 * with direct browser streaming, mobile Safari resilience, and realistic progress tracking.
 */

export type StorageProviderType = 'zero-cost-transport' | 's3' | 'r2' | 'b2' | 'blob' | 'fallback' | 'supabase';

export type TransportState = 
  | 'preparing'   // Hash being calculated
  | 'uploading'   // Binary being transmitted to Kappa
  | 'ready'       // 200 OK on Kappa; ready for single webhook dispatch
  | 'in_flight'   // Webhook dispatched; n8n actively downloading
  | 'purged'      // Remote /api/delete executed (or 404 confirmed); URL is dead
  | 'failed';     // Upload failed or aborted

export interface TransportInstance {
  transportId: string;         // Unique instance ID: `trans_${uuid}`
  contentId: string;           // SHA-256 hash: `sha256_${hex}`
  chatId: string;              // Enforcing chat boundary isolation
  messageId?: string;          // Outbound message snapshot ID
  fileUrl: string;             // Ephemeral binary download URL (https://kappa.lol/...)
  deleteUrl?: string;          // Programmatic deletion URL (https://kappa.lol/api/delete?key=...)
  fileName: string;
  fileSize: number;
  mimeType: string;
  state: TransportState;
  createdAt: number;
  inFlightAt?: number;
  purgedAt?: number;
}

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
  chatId?: string;
  messageId?: string;
  forceFresh?: boolean;
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
  deleteUrl?: string;
  transportId?: string;
  contentId?: string;
  chatId?: string;
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
