/**
 * Client-side deployment configuration
 * This mirrors settings from server/deployment-config.ts
 */

export const DEPLOYMENT_CONFIG = {
  // Maximum file size in bytes - matches server's deployed limit
  // The server enforces this limit, but we check on client to provide better UX
  maxFileSize: 500 * 1024 * 1024, // 500MB for deployment
  
  // In development, allow files up to 500MB (same as production now)
  devMaxFileSize: 500 * 1024 * 1024, // 500MB for development
  
  // When true, uploads above the file size limit will be prevented on client-side
  enforceFileSizeLimit: true,
  
  // Allow multipart uploads in production to handle large files
  disableMultipartUploads: false,
  
  // Warning threshold (in bytes) - show warnings when files exceed this size
  warningSizeThreshold: 200 * 1024 * 1024, // 200MB - warning for very large files
  
  // Video playback configuration
  videoPlayback: {
    // Use a retry mechanism if video fails to load initially
    enableAutoRetry: true,
    
    // Maximum number of retry attempts for video loading
    maxRetryAttempts: 3,
    
    // Delay between retry attempts (milliseconds)
    retryDelay: 2000,
    
    // Use a special streaming URL format in production
    useStreamingFormat: true,
    
    // Preload settings for videos in production
    preloadSetting: 'metadata',  // Options: 'none', 'metadata', 'auto'
    
    // Set a timeout for video loading (milliseconds)
    loadTimeout: 30000,
    
    // In production, should we force videos through the streaming endpoint?
    forceStreamingEndpoint: true
  },
  
  // S3 specific configuration for the client
  s3Config: {
    // Whether to use S3 direct browser upload in production
    // (we set this automatically based on file size in the upload modal)
    useDirectUpload: true,
    
    // Maximum concurrent chunks for multipart uploads
    maxConcurrentChunks: 4,
    
    // Client-side verification after uploads
    verifyUploads: true
  }
};

/**
 * Helper function to check if we're running in production/deployment mode
 * For browser environment
 */
export function isProduction(): boolean {
  // Check for production environment indicators
  // In Replit deployments, we'll be on a *.replit.app domain or a custom domain
  const hostname = window.location.hostname;
  return hostname.includes('.replit.app');
}