/**
 * Deployment-specific configuration
 * Adjusts settings to accommodate large file uploads in production
 */

export const DEPLOYMENT_CONFIG = {
  // Increase timeout for large file uploads (in milliseconds)
  // 30 minutes should be sufficient for most large uploads
  timeout: 30 * 60 * 1000,
  
  // Maximum file size in bytes
  // Allowing up to 500MB as requested for the production environment
  maxFileSize: 500 * 1024 * 1024,
  
  // When true, uploads above the file size limit will be rejected with an informative message
  // When false, uploads above the limit will be attempted but may fail
  enforceFileSizeLimit: true,
  
  // Allow multipart uploads in production to handle large files
  disableMultipartUploads: false,
  
  // Headers to include for all API requests to improve reliability
  additionalHeaders: {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  },
  
  // Video streaming configuration for deployment
  videoStreaming: {
    // Chunk size for streaming videos (1MB)
    chunkSize: 1024 * 1024,
    
    // Maximum concurrent streams in deployment
    maxConcurrentStreams: 100,
    
    // Whether to prefer S3 presigned URLs in production (more efficient for large files)
    preferS3PresignedUrls: false,
    
    // Whether to force direct streaming through the server in production (more reliable but uses more resources)
    forceDirectStreaming: true,
    
    // In production, should we download from S3 to local temp files first? (improves playback reliability)
    useLocalTempFiles: true,
    
    // Timeout for S3 operations (ms)
    s3Timeout: 60000,
    
    // Buffer size for improved streaming performance
    bufferSize: 64 * 1024
  },
  
  // S3 specific configuration for production
  s3Config: {
    // When true, store original S3 path in database, not just the key
    // This helps with cross-environment compatibility
    storeFullS3Path: true,
    
    // Upload concurrency for multipart uploads
    uploadConcurrency: 4,
    
    // Default ACL for uploaded objects
    acl: 'private',
    
    // Cache control for uploaded objects
    cacheControl: 'max-age=31536000',
    
    // Whether to set Content-Disposition header on uploads
    // Making this false ensures videos can play directly from S3 URLs
    setContentDisposition: false
  }
};

/**
 * Helper function to check if we're running in production/deployment mode
 * Note: Only detects actual deployment, not just being in Replit environment
 */
export function isProduction(): boolean {
  // Only return true for actual deployments, not just Replit development environment
  return Boolean(process.env.REPLIT_DEPLOYMENT);
}