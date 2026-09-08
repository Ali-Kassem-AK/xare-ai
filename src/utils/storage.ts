/**
 * Storage Utility Entrypoint - Re-exports from provider-neutral storage service
 *
 * Provides complete backward compatibility with existing imports while delegating
 * directly to the modular storage abstraction layer in `src/services/storage`.
 */

export * from '../services/storage';
