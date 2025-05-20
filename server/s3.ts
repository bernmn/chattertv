import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, CompletedPart, PutBucketCorsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import crypto from 'crypto';

// Check if the required S3 environment variables are set
const checkS3Configuration = () => {
  console.log('=== S3 Configuration Check ===');
  
  const requiredVars = [
    'AWS_ACCESS_KEY_ID', 
    'AWS_SECRET_ACCESS_KEY', 
    'AWS_REGION', 
    'AWS_S3_BUCKET'
  ];
  
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.log(`❌ Missing required S3 environment variables: ${missingVars.join(', ')}`);
    console.log('⚠️ S3 integration will be DISABLED');
    console.log('Using local file storage only');
    return false;
  }
  
  console.log('✅ All required S3 environment variables are present');
  console.log(`AWS Region: ${process.env.AWS_REGION}`);
  console.log(`S3 Bucket: ${process.env.AWS_S3_BUCKET}`);
  console.log('⭐ S3 integration is ENABLED');
  return true;
};

// Determine if S3 should be used based on environment variables
export const USE_S3 = checkS3Configuration();

// Initialize the S3 client if S3 is enabled
export const s3Client = USE_S3 ? new S3Client({
  region: process.env.AWS_REGION || '',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  }
}) : null;

const bucket = USE_S3 ? process.env.AWS_S3_BUCKET || '' : '';

/**
 * Uploads a file from a local path to S3
 * @param localFilePath The local path of the file to upload
 * @param s3Key The S3 key (path) where the file should be stored
 * @param contentType The MIME type of the file (optional)
 * @returns The URL of the uploaded file
 */
export async function uploadFileToS3(localFilePath: string, s3Key: string, contentType?: string): Promise<string> {
  if (!USE_S3 || !s3Client) {
    throw new Error('S3 integration is not properly configured');
  }

  try {
    console.log(`Uploading ${localFilePath} to S3 at ${s3Key}`);
    const fileContent = fs.readFileSync(localFilePath);
    
    // Normalize the S3 key
    const normalizedKey = normalizeS3Key(s3Key);
    
    // Upload the file to S3
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: normalizedKey,
      Body: fileContent,
      ContentType: contentType || 'application/octet-stream'
    });

    await s3Client.send(command);
    
    // Return the public URL
    return getS3Url(normalizedKey);
  } catch (error) {
    console.error('Error uploading file to S3:', error);
    throw error;
  }
}

/**
 * Generates a presigned URL for uploading directly to S3 from the client
 * @param key The S3 key (path) where the file should be stored
 * @param contentType The MIME type of the file
 * @param expiresIn The number of seconds until the presigned URL expires (default: 3600)
 * @returns Object containing the upload URL and key
 */
export async function generatePresignedUploadUrl(
  key: string, 
  contentType: string, 
  expiresIn: number = 3600
): Promise<{ uploadUrl: string; key: string }> {
  if (!USE_S3 || !s3Client) {
    throw new Error('S3 integration is not properly configured');
  }

  // Generate a unique key if one wasn't provided
  const finalKey = key || `uploads/${crypto.randomUUID()}`;
  const normalizedKey = normalizeS3Key(finalKey);
  
  // Create the command for getting a presigned URL
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: normalizedKey,
    ContentType: contentType
  });

  try {
    // Generate the presigned URL
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
    
    return {
      uploadUrl: signedUrl,
      key: normalizedKey
    };
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    throw error;
  }
}

/**
 * Generates a presigned POST policy for true browser-to-S3 uploads
 * 
 * @param fileName Original file name for reference
 * @param fileType MIME type of the file
 * @param fileSize Size of the file in bytes
 * @returns Presigned POST data for direct browser upload
 */
export async function generatePresignedPost(
  fileName: string,
  fileType: string,
  fileSize: number,
  expiresIn: number = 3600
): Promise<{
  url: string;
  fields: Record<string, string>;
}> {
  if (!USE_S3 || !s3Client) {
    throw new Error('S3 integration is not properly configured');
  }

  // Generate a unique key for this upload
  const uniqueId = crypto.randomUUID();
  const fileExtension = fileName.split('.').pop() || '';
  const key = `uploads/${uniqueId}.${fileExtension}`;
  const normalizedKey = normalizeS3Key(key);

  try {
    // Use the @aws-sdk/s3-presigned-post package to create the presigned POST policy
    const { url, fields } = await createPresignedPost(s3Client, {
      Bucket: bucket,
      Key: normalizedKey,
      Conditions: [
        // Content length restrictions
        ["content-length-range", 0, fileSize + 1024], // Add a small buffer
        // Content type restriction
        ["eq", "$Content-Type", fileType],
      ],
      Fields: {
        'Content-Type': fileType
      },
      Expires: expiresIn
    });

    return {
      url,
      fields
    };
  } catch (error) {
    console.error('Error generating presigned POST policy:', error);
    throw error;
  }
}

/**
 * Generates all necessary data for true direct browser-to-S3 uploads
 * This bypasses our server entirely for the file transfer
 * 
 * @param fileName Original file name for reference
 * @param fileType MIME type of the file
 * @param fileSize Size of the file in bytes
 * @returns Configuration object with all needed data for direct browser upload
 */
export async function getDirectBrowserUploadConfig(
  fileName: string,
  fileType: string,
  fileSize: number
): Promise<{
  url?: string;
  fields?: Record<string, string>;
  uploadId?: string;
  key: string;
  urls?: { url: string; partNumber?: number }[];
  config: {
    bucket: string;
    region: string;
    isMultipart: boolean;
    maxPartSize: number;
    expiresIn: number;
    usePresignedPost: boolean;
  };
}> {
  if (!USE_S3 || !s3Client) {
    throw new Error('S3 integration is not properly configured');
  }

  // Determine the file size threshold for different upload strategies
  const usePresignedPost = fileSize > 150 * 1024 * 1024; // Use presigned POST for large files (150MB+)
  const useMultipart = !usePresignedPost && fileSize > 50 * 1024 * 1024; // Use multipart for medium files (50-150MB)
  
  const uniqueId = crypto.randomUUID();
  const fileExtension = fileName.split('.').pop() || '';
  const key = `uploads/${uniqueId}.${fileExtension}`;
  const normalizedKey = normalizeS3Key(key);
  
  // Configure longer expiration for large files
  const expiresIn = fileSize > 200 * 1024 * 1024 ? 24 * 3600 : 3600; // 24 hours for very large files
  
  try {
    // For very large files, use presigned POST policy (simplest for browser uploads)
    if (usePresignedPost) {
      console.log(`Using presigned POST for large file (${Math.round(fileSize/1024/1024)}MB)`);
      const presignedPostData = await generatePresignedPost(fileName, fileType, fileSize, expiresIn);
      
      return {
        url: presignedPostData.url,
        fields: presignedPostData.fields,
        key: normalizedKey,
        config: {
          bucket,
          region: process.env.AWS_REGION || '',
          isMultipart: false,
          maxPartSize: fileSize,
          expiresIn,
          usePresignedPost: true
        }
      };
    } 
    // For medium-sized files, use multipart upload
    else if (useMultipart) {
      console.log(`Using multipart upload for medium file (${Math.round(fileSize/1024/1024)}MB)`);
      // For multipart uploads, we need to initialize a multipart upload process
      const { uploadId } = await initiateMultipartUpload(normalizedKey, fileType);
      
      // Determine optimal part size and count
      const basePartSize = 5 * 1024 * 1024; // 5MB minimum
      let maxPartSize = basePartSize;
      
      if (fileSize > 100 * 1024 * 1024) {
        // For larger files use 10MB parts
        maxPartSize = 10 * 1024 * 1024;
      }
      
      // Calculate number of parts needed
      const partCount = Math.ceil(fileSize / maxPartSize);
      
      // Generate presigned URLs for each part
      const urls = await Promise.all(
        Array.from({ length: partCount }, (_, i) => i + 1).map(async (partNumber) => {
          const url = await getMultipartPresignedUrl(normalizedKey, uploadId, partNumber, expiresIn);
          return { url, partNumber };
        })
      );
      
      return {
        uploadId,
        key: normalizedKey,
        urls,
        config: {
          bucket,
          region: process.env.AWS_REGION || '',
          isMultipart: true,
          maxPartSize,
          expiresIn,
          usePresignedPost: false
        }
      };
    } else {
      // For smaller files, we just need a single presigned URL
      console.log(`Using single presigned URL for small file (${Math.round(fileSize/1024/1024)}MB)`);
      const { uploadUrl } = await generatePresignedUploadUrl(normalizedKey, fileType, expiresIn);
      
      return {
        key: normalizedKey,
        urls: [{ url: uploadUrl }],
        config: {
          bucket,
          region: process.env.AWS_REGION || '',
          isMultipart: false,
          maxPartSize: fileSize,
          expiresIn,
          usePresignedPost: false
        }
      };
    }
  } catch (error) {
    console.error('Error generating direct browser upload config:', error);
    throw error;
  }
}

/**
 * Initiates a multipart upload for large files
 * @param key The S3 key for the file
 * @param contentType The content type of the file
 * @returns The upload ID needed for subsequent parts
 */
export async function initiateMultipartUpload(key: string, contentType: string): Promise<{ uploadId: string, key: string }> {
  if (!USE_S3 || !s3Client) {
    throw new Error('S3 integration is not properly configured');
  }
  
  const normalizedKey = normalizeS3Key(key);
  
  const command = new CreateMultipartUploadCommand({
    Bucket: bucket,
    Key: normalizedKey,
    ContentType: contentType
  });
  
  try {
    const response = await s3Client.send(command);
    return {
      uploadId: response.UploadId || '',
      key: normalizedKey
    };
  } catch (error) {
    console.error('Error initiating multipart upload:', error);
    throw error;
  }
}

/**
 * Generates a presigned URL for uploading a part in a multipart upload
 * @param key The S3 key for the file
 * @param uploadId The upload ID from initiateMultipartUpload
 * @param partNumber The part number (1-10000)
 * @param expiresIn The expiration time for the URL in seconds
 * @returns The presigned URL for uploading this part
 */
export async function getMultipartPresignedUrl(
  key: string,
  uploadId: string,
  partNumber: number,
  expiresIn: number = 3600
): Promise<string> {
  if (!USE_S3 || !s3Client) {
    throw new Error('S3 integration is not properly configured');
  }
  
  const normalizedKey = normalizeS3Key(key);
  
  const command = new UploadPartCommand({
    Bucket: bucket,
    Key: normalizedKey,
    UploadId: uploadId,
    PartNumber: partNumber
  });
  
  try {
    return await getSignedUrl(s3Client, command, { expiresIn });
  } catch (error) {
    console.error(`Error generating presigned URL for part ${partNumber}:`, error);
    throw error;
  }
}

/**
 * Completes a multipart upload after all parts have been uploaded
 * @param key The S3 key for the file
 * @param uploadId The upload ID from initiateMultipartUpload
 * @param parts Array of completed parts with ETag and PartNumber
 * @returns The final S3 URL for the completed file
 */
export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: CompletedPart[]
): Promise<string> {
  if (!USE_S3 || !s3Client) {
    throw new Error('S3 integration is not properly configured');
  }
  
  const normalizedKey = normalizeS3Key(key);
  
  const command = new CompleteMultipartUploadCommand({
    Bucket: bucket,
    Key: normalizedKey,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts
    }
  });
  
  try {
    await s3Client.send(command);
    return getS3Url(normalizedKey);
  } catch (error) {
    console.error('Error completing multipart upload:', error);
    throw error;
  }
}

/**
 * Gets a presigned URL for retrieving an object from S3
 * @param key The S3 key of the object
 * @param expiresIn The number of seconds until the URL expires (default: 86400 - 24 hours)
 * @returns The presigned URL for accessing the object
 */
export async function getPresignedUrl(key: string, expiresIn: number = 86400): Promise<string> {
  if (!USE_S3 || !s3Client) {
    throw new Error('S3 integration is not properly configured');
  }

  const normalizedKey = normalizeS3Key(key);
  
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: normalizedKey
  });

  try {
    // Generate the presigned URL with longer expiration (default 24 hours)
    // This ensures videos are accessible for longer periods
    const url = await getSignedUrl(s3Client, command, { expiresIn });
    console.log(`Generated presigned URL for ${normalizedKey} with expiration of ${expiresIn/3600} hours`);
    return url;
  } catch (error) {
    console.error('Error generating presigned URL for retrieval:', error);
    throw error;
  }
}

/**
 * Downloads a file from S3 and saves it to a local path
 * @param s3Key The S3 key of the file to download
 * @param localPath The local path where the file should be saved
 * @returns Promise that resolves when the download is complete
 */
export async function downloadFileFromS3(s3Key: string, localPath: string): Promise<void> {
  if (!USE_S3 || !s3Client) {
    throw new Error('S3 integration is not properly configured');
  }

  const normalizedKey = normalizeS3Key(s3Key);
  
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: normalizedKey
  });

  try {
    const response = await s3Client.send(command);
    
    // Ensure the response body is a readable stream
    if (response.Body instanceof Readable) {
      // Create a write stream to the local path
      const writeStream = fs.createWriteStream(localPath);
      
      // Pipe the S3 stream to the local file
      await new Promise((resolve, reject) => {
        const stream = response.Body as Readable;
        stream.pipe(writeStream)
          .on('error', reject)
          .on('finish', resolve);
      });
      
      console.log(`Successfully downloaded ${s3Key} to ${localPath}`);
    } else {
      throw new Error('Response body is not a readable stream');
    }
  } catch (error) {
    console.error(`Error downloading file from S3 (${s3Key}):`, error);
    throw error;
  }
}

/**
 * Deletes a file from S3
 * @param s3Key The S3 key of the file to delete
 * @returns Promise that resolves to true if deletion was successful
 */
export async function deleteFileFromS3(s3Key: string): Promise<boolean> {
  if (!USE_S3 || !s3Client) {
    throw new Error('S3 integration is not properly configured');
  }

  const normalizedKey = normalizeS3Key(s3Key);
  
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: normalizedKey
  });

  try {
    await s3Client.send(command);
    console.log(`Successfully deleted ${s3Key} from S3`);
    return true;
  } catch (error) {
    console.error(`Error deleting file from S3 (${s3Key}):`, error);
    return false;
  }
}

/**
 * Extracts the S3 key from a full S3 URL
 * @param url The full S3 URL
 * @returns The S3 key portion of the URL
 */
export function getS3KeyFromUrl(url: string): string {
  if (!url) return '';
  
  try {
    // Parse the URL
    const parsed = new URL(url);
    
    // Extract the path (removing the leading slash)
    let key = parsed.pathname;
    if (key.startsWith('/')) {
      key = key.substring(1);
    }
    
    return key;
  } catch (error) {
    console.error('Error parsing S3 URL:', error);
    return '';
  }
}

/**
 * Checks if a file exists in S3
 * @param s3Key The S3 key to check
 * @returns Promise that resolves to true if the file exists
 */
export async function fileExistsInS3(s3Key: string): Promise<boolean> {
  if (!USE_S3 || !s3Client) {
    return false;
  }

  const normalizedKey = normalizeS3Key(s3Key);
  
  try {
    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: normalizedKey
    });
    
    await s3Client.send(command);
    return true;
  } catch (error) {
    // Don't log the error as this is a common check
    return false;
  }
}

/**
 * Constructs the public URL for an S3 object
 * @param s3Key The S3 key of the object
 * @returns The public URL for the object
 */
export function getS3Url(s3Key: string): string {
  if (!USE_S3) return '';
  
  const normalizedKey = normalizeS3Key(s3Key);
  return `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${normalizedKey}`;
}

/**
 * Validates if a string is a valid URL
 * @param urlString The URL string to validate
 * @returns True if the string is a valid URL
 */
export function isValidUrl(urlString: string): boolean {
  try {
    new URL(urlString);
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalizes an S3 key by removing the leading slash if present
 * @param path The path or key to normalize
 * @returns The normalized key
 */
export function normalizeS3Key(path: string): string {
  // Remove leading slash if present
  return path.startsWith('/') ? path.substring(1) : path;
}

/**
 * Configure the CORS settings for the S3 bucket to allow direct browser uploads
 * This only needs to be run once for the bucket, but we'll provide it as a utility
 */
export async function configureS3CorsForDirectUploads(): Promise<boolean> {
  if (!USE_S3 || !s3Client) {
    console.warn("S3 is not configured, cannot set CORS policy");
    return false;
  }

  try {
    const corsParams = {
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            // Allow requests from any origin with specific methods
            AllowedHeaders: ["*"],
            AllowedMethods: ["PUT", "POST", "GET", "DELETE"],
            AllowedOrigins: ["*"],  // In production, you should restrict this to your domain
            ExposeHeaders: ["ETag", "x-amz-server-side-encryption"],
            MaxAgeSeconds: 3600
          }
        ]
      }
    };

    // Set CORS configuration on the bucket
    const command = new PutBucketCorsCommand(corsParams);
    await s3Client.send(command);
    console.log("Successfully set CORS configuration on S3 bucket for direct uploads");
    return true;
  } catch (error) {
    console.error("Error setting CORS configuration on S3 bucket:", error);
    return false;
  }
}

/**
 * Lists objects in an S3 bucket with a specific prefix
 * @param prefix The prefix to filter objects by (e.g., 'uploads/')
 * @returns An array of S3 keys (object paths)
 */
export async function listS3Objects(prefix: string = ''): Promise<string[]> {
  if (!USE_S3 || !s3Client) {
    console.log('S3 not configured, cannot list objects');
    return [];
  }

  const normalizedPrefix = normalizeS3Key(prefix);
  const keys: string[] = [];

  try {
    console.log(`Listing S3 objects with prefix: ${normalizedPrefix}`);
    
    // Create the command for listing objects
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: normalizedPrefix,
      MaxKeys: 1000 // Get up to 1000 objects at a time
    });

    // Use pagination to get all objects
    let isTruncated = true;
    let continuationToken: string | undefined = undefined;

    while (isTruncated) {
      // If we have a continuation token, include it in the next request
      if (continuationToken) {
        command.input.ContinuationToken = continuationToken;
      }

      // Send the request
      const response = await s3Client.send(command);
      
      // Process the objects in this batch
      if (response.Contents) {
        for (const obj of response.Contents) {
          if (obj.Key) {
            keys.push(obj.Key);
          }
        }
      }

      // Check if there are more objects to fetch
      isTruncated = response.IsTruncated || false;
      continuationToken = response.NextContinuationToken;
    }

    console.log(`Found ${keys.length} objects in S3 with prefix ${normalizedPrefix}`);
    return keys;
  } catch (error) {
    console.error('Error listing S3 objects:', error);
    return [];
  }
}

/**
 * Gets the appropriate URL for an asset, whether it's stored in S3 or locally
 * @param filePath The path or S3 key of the asset
 * @param type The type of asset (video, thumbnail, etc.)
 * @returns The full URL for the asset
 */
export async function getProperAssetUrl(filePath: string, type: 'video' | 'thumbnail' = 'video'): Promise<string> {
  // If the file path is already a URL, just return it
  if (isValidUrl(filePath)) {
    return filePath;
  }
  
  // If using S3 and the file exists in S3, return a presigned URL
  if (USE_S3 && s3Client) {
    try {
      const exists = await fileExistsInS3(filePath);
      if (exists) {
        // Use a long expiration time (7 days) for asset URLs to ensure videos remain playable
        return await getPresignedUrl(filePath, 7 * 24 * 3600);
      }
    } catch (error) {
      console.error('Error checking for asset in S3:', error);
    }
  }
  
  // Default to local path
  return type === 'video' ? `/uploads/${filePath}` : `/thumbnails/${filePath}`;
}