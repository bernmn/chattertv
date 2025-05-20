import express, { type Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertVideoSchema, insertCommentSchema } from "@shared/schema";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import * as crypto from "crypto";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { exec } from "child_process";
import { Readable } from "stream";
import { 
  USE_S3, 
  generatePresignedUploadUrl, 
  initiateMultipartUpload,
  getMultipartPresignedUrl,
  completeMultipartUpload,
  uploadFileToS3,
  downloadFileFromS3,
  deleteFileFromS3,
  getPresignedUrl,
  configureS3CorsForDirectUploads,
  getDirectBrowserUploadConfig,
  getS3Url,
  getS3KeyFromUrl,
  fileExistsInS3,
  s3Client
} from "./s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { DEPLOYMENT_CONFIG, isProduction } from "./deployment-config";

// Set up storage for uploaded files
const uploadDir = path.join(process.cwd(), "uploads");
const thumbnailDir = path.join(process.cwd(), "thumbnails");

// Log paths for debugging
console.log('Upload directory:', uploadDir);
console.log('Thumbnail directory:', thumbnailDir);

// Helper function to generate a thumbnail from a video using ffmpeg
function generateThumbnail(videoPath: string, thumbnailPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Extract thumbnail at 10 second mark
    const command = `ffmpeg -i "${videoPath}" -ss 00:00:10.000 -vframes 1 "${thumbnailPath}" -y`;
    
    exec(command, (error) => {
      if (error) {
        console.error(`Error generating thumbnail: ${error.message}`);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

// Ensure upload directories exist
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(thumbnailDir)) {
  fs.mkdirSync(thumbnailDir, { recursive: true });
}

// Get file size limit from environment variable or use default (500MB)
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '524288000'); // Exactly 500MB in bytes (500 * 1024 * 1024)
const TEST_FILE_SIZE = MAX_FILE_SIZE + (100 * 1024 * 1024); // Add 100MB buffer for test endpoints

// Configure multer for file uploads
const storage_config = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueFilename = `${randomUUID()}${path.extname(file.originalname)}`;
    cb(null, uniqueFilename);
  }
});

// Create a multer configuration with appropriate settings for handling larger files
// In deployment, use a more conservative file size limit
const effectiveFileSize = isProduction() && DEPLOYMENT_CONFIG.enforceFileSizeLimit 
  ? DEPLOYMENT_CONFIG.maxFileSize 
  : MAX_FILE_SIZE;

console.log(`=== File Upload Configuration in ${isProduction() ? 'PRODUCTION' : 'DEVELOPMENT'} mode ===`);
console.log(`Effective maximum file size: ${Math.round(effectiveFileSize / (1024 * 1024))} MB`);
console.log(`S3 multipart uploads ${isProduction() && DEPLOYMENT_CONFIG.disableMultipartUploads ? 'DISABLED' : 'ENABLED'}`);

const upload = multer({ 
  storage: storage_config,
  limits: { 
    fileSize: effectiveFileSize,  // Use appropriate size limit based on environment
    fieldSize: 25 * 1024 * 1024,  // Increase field size limit
    files: 1,                     // Only allow one file per request
    parts: 10                     // Limit number of parts in request
  },
  fileFilter: (req, file, cb) => {
    // Allow video files - be more accepting of different formats/MIME types
    const filetypes = /mp4|mov|avi|webm|mkv|flv|wmv|ogg|3gp/;
    
    // Check for video/ mimetype or known extensions
    const isVideoMimetype = file.mimetype.startsWith('video/');
    const hasVideoExtension = filetypes.test(path.extname(file.originalname).toLowerCase());
    
    console.log(`File upload attempt: ${file.originalname} (${file.mimetype})`);
    console.log(`    File size information not available at filter stage`);
    
    if (isVideoMimetype || hasVideoExtension) {
      console.log(`Video file accepted: ${file.originalname}`);
      return cb(null, true);
    }
    
    console.log(`File rejected (not a video): ${file.originalname}`);
    cb(new Error("Error: Only video files are allowed!"));
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Create a separate multer instance with an even higher size limit for testing (memory-based)
  const testUpload = multer({
    storage: multer.memoryStorage(), // Use memory storage to avoid saving files
    limits: { fileSize: TEST_FILE_SIZE }, // Test size limit (MAX_FILE_SIZE + 100MB)
  });
  
  // Setup a separate multer instance for disk-based test endpoint
  const testDiskUpload = multer({
    dest: path.join(process.cwd(), 'test-uploads'), // Save to test-uploads directory
    limits: { fileSize: TEST_FILE_SIZE }, // Test size limit (MAX_FILE_SIZE + 100MB)
  });
  
  // Direct-to-S3 upload URL generator endpoint
  app.get('/api/upload-url', async (req: Request, res: Response) => {
    try {
      if (!USE_S3) {
        console.log('S3 upload URL requested but S3 integration is disabled');
        return res.status(400).json({
          error: "S3 not configured",
          message: "S3 integration is disabled. Please use the standard upload endpoint.",
          fallbackAvailable: true
        });
      }
      
      const fileType = req.query.fileType as string;
      const fileName = req.query.fileName as string;
      
      if (!fileType || !fileName) {
        return res.status(400).json({
          error: "Missing parameters",
          message: "fileType and fileName query parameters are required"
        });
      }
      
      // Generate a unique key for the file
      const fileKey = `uploads/${crypto.randomUUID()}-${fileName}`;
      
      // Get a presigned URL for uploading the file
      const { uploadUrl, key } = await generatePresignedUploadUrl(fileKey, fileType);
      
      console.log(`Generated S3 presigned URL for ${fileName} (${fileType}): ${key}`);
      
      res.json({
        uploadUrl,
        key,
        fields: {}, // For compatibility with older clients
        maxSize: MAX_FILE_SIZE
      });
    } catch (error) {
      console.error('Error generating upload URL:', error);
      res.status(500).json({
        error: "Failed to generate upload URL",
        message: "There was an error generating the upload URL. Please try again."
      });
    }
  });
  
  // Endpoint for multipart upload initialization
  app.post('/api/multipart-upload/init', async (req: Request, res: Response) => {
    try {
      // Check if multipart uploads are disabled in deployment
      if (isProduction() && DEPLOYMENT_CONFIG.disableMultipartUploads) {
        return res.status(400).json({
          error: "Multipart uploads disabled in deployment",
          message: "For security and reliability reasons, multipart uploads are disabled in the deployed version. Please use the standard upload endpoint or upload smaller files.",
          fallbackAvailable: true,
          maxSizeBytes: DEPLOYMENT_CONFIG.maxFileSize,
          maxSizeMB: DEPLOYMENT_CONFIG.maxFileSize / 1024 / 1024
        });
      }
      
      if (!USE_S3) {
        return res.status(400).json({
          error: "S3 not configured",
          message: "S3 integration is disabled. Please use the standard upload endpoint."
        });
      }
      
      const { fileName, fileType, fileSize } = req.body;
      
      if (!fileName || !fileType) {
        return res.status(400).json({
          error: "Missing parameters",
          message: "fileName and fileType are required"
        });
      }
      
      // Check if file size is too large
      if (fileSize && parseInt(fileSize) > MAX_FILE_SIZE) {
        return res.status(413).json({
          error: "File too large",
          message: `Maximum file size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
          maxSizeBytes: MAX_FILE_SIZE,
          maxSizeMB: MAX_FILE_SIZE / 1024 / 1024
        });
      }
      
      // Generate a unique key for the file
      const fileKey = `uploads/${crypto.randomUUID()}-${fileName}`;
      
      // Initialize the multipart upload
      const { uploadId, key } = await initiateMultipartUpload(fileKey, fileType);
      
      console.log(`Initiated multipart upload for ${fileName}: uploadId=${uploadId}, key=${key}`);
      
      res.json({
        uploadId,
        key
      });
    } catch (error) {
      console.error('Error initiating multipart upload:', error);
      res.status(500).json({
        error: "Failed to initiate upload",
        message: "There was an error initiating the multipart upload. Please try again."
      });
    }
  });
  
  // Endpoint to get a presigned URL for a specific part
  app.get('/api/multipart-upload/part-url', async (req: Request, res: Response) => {
    try {
      if (!USE_S3) {
        return res.status(400).json({
          error: "S3 not configured",
          message: "S3 integration is disabled. Please use the standard upload endpoint."
        });
      }
      
      const { key, uploadId, partNumber } = req.query;
      
      if (!key || !uploadId || !partNumber) {
        return res.status(400).json({
          error: "Missing parameters",
          message: "key, uploadId, and partNumber query parameters are required"
        });
      }
      
      // Generate a presigned URL for this part with extended expiration time
      // Use a longer expiry time (3 hours) for large file parts
      const partNum = parseInt(partNumber as string);
      const expiryTime = 60 * 60 * 3; // 3 hours expiry time 
      
      console.log(`Generating presigned URL for part ${partNum} of ${key} with ${expiryTime}s expiry`);
      
      const partUrl = await getMultipartPresignedUrl(
        key as string,
        uploadId as string,
        partNum,
        expiryTime
      );
      
      res.json({ partUrl });
    } catch (error) {
      console.error('Error generating part upload URL:', error);
      res.status(500).json({
        error: "Failed to generate part URL",
        message: "There was an error generating the part upload URL. Please try again."
      });
    }
  });
  
  // Endpoint to complete a multipart upload
  app.post('/api/multipart-upload/complete', async (req: Request, res: Response) => {
    try {
      if (!USE_S3) {
        return res.status(400).json({
          error: "S3 not configured",
          message: "S3 integration is disabled. Please use the standard upload endpoint."
        });
      }
      
      const { key, uploadId, parts } = req.body;
      
      if (!key || !uploadId || !parts || !Array.isArray(parts)) {
        return res.status(400).json({
          error: "Missing parameters",
          message: "key, uploadId, and parts array are required"
        });
      }
      
      // Complete the multipart upload
      const fileUrl = await completeMultipartUpload(key, uploadId, parts);
      
      console.log(`Completed multipart upload for ${key}`);
      
      res.json({ 
        fileUrl,
        key
      });
    } catch (error) {
      console.error('Error completing multipart upload:', error);
      res.status(500).json({
        error: "Failed to complete upload",
        message: "There was an error completing the multipart upload. Please try again."
      });
    }
  });
  
  // ===== TRUE DIRECT BROWSER UPLOAD ENDPOINTS =====
  // These endpoints allow direct browser-to-S3 uploads that completely bypass the server
  
  // API endpoint for configuration and setup of true direct browser-to-S3 uploads
  app.post('/api/direct-upload/config', async (req: Request, res: Response) => {
    if (!USE_S3) {
      return res.status(400).json({
        error: "S3 not configured",
        message: "S3 integration is disabled. Use the standard file upload endpoint.",
        fallbackAvailable: true
      });
    }
    
    try {
      // Make sure CORS is properly configured for direct browser uploads
      await configureS3CorsForDirectUploads();
      
      // Extract file information from request
      const { fileName, fileType, fileSize } = req.body;
      
      if (!fileName || !fileType || !fileSize) {
        return res.status(400).json({ 
          error: "Missing parameters",
          message: "Missing required parameters. Please provide fileName, fileType, and fileSize."
        });
      }
      
      // Generate all necessary configuration for direct browser upload
      const uploadConfig = await getDirectBrowserUploadConfig(
        fileName,
        fileType,
        parseInt(fileSize, 10)
      );
      
      console.log(`Generated direct browser upload config for ${fileName} (${Math.round(parseInt(fileSize, 10)/1024/1024)}MB)`);
      
      res.json(uploadConfig);
    } catch (error: any) {
      console.error('Error generating direct upload configuration:', error);
      res.status(500).json({ 
        error: "Failed to generate upload configuration",
        message: error.message || "Failed to generate upload configuration" 
      });
    }
  });
  
  // API endpoint to complete a direct browser multipart upload
  app.post('/api/direct-upload/complete', async (req: Request, res: Response) => {
    if (!USE_S3) {
      return res.status(400).json({ 
        error: "S3 not configured",
        message: "S3 integration is disabled." 
      });
    }
    
    try {
      const { key, uploadId, parts } = req.body;
      
      if (!key || !uploadId || !parts || !Array.isArray(parts)) {
        return res.status(400).json({ 
          error: "Missing parameters",
          message: "Missing required parameters. Please provide key, uploadId, and parts array."
        });
      }
      
      // Complete the multipart upload
      const fileUrl = await completeMultipartUpload(key, uploadId, parts);
      
      console.log(`Completed direct browser multipart upload for ${key}`);
      
      res.json({ 
        success: true, 
        fileUrl,
        key
      });
    } catch (error: any) {
      console.error('Error completing multipart upload:', error);
      res.status(500).json({ 
        error: "Failed to complete upload",
        message: error.message || "Failed to complete multipart upload"
      });
    }
  });
  
  // Register the uploaded S3 file in our database (create video entry)
  app.post('/api/direct-upload/register', async (req: Request, res: Response) => {
    if (!USE_S3) {
      return res.status(400).json({ 
        error: "S3 not configured",
        message: "S3 integration is disabled." 
      });
    }
    
    try {
      const { key, title, description, duration, category, tags, isContest, isAI } = req.body;
      
      if (!key || !title) {
        return res.status(400).json({ 
          error: "Missing parameters",
          message: "Missing required parameters. Please provide key and title at minimum."
        });
      }
      
      // Generate a thumbnail from the uploaded video
      // First, download the video from S3 to a temporary location
      const tempDir = path.join(process.cwd(), 'temp-videos');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const localVideoPath = path.join(tempDir, path.basename(key));
      
      await downloadFileFromS3(key, localVideoPath);
      
      // Generate a thumbnail
      const thumbnailName = `thumbnail-${crypto.randomUUID()}.jpg`;
      const thumbnailPath = path.join(thumbnailDir, thumbnailName);
      
      const thumbnailSuccess = await generateThumbnail(localVideoPath, thumbnailPath);
      let thumbnailUrl = '';
      
      if (thumbnailSuccess) {
        // Upload the thumbnail to S3 if generation was successful
        thumbnailUrl = await uploadFileToS3(thumbnailPath, `thumbnails/${thumbnailName}`, 'image/jpeg');
      }
      
      // Clean up temporary local files
      try {
        fs.unlinkSync(localVideoPath);
      } catch (err) {
        console.warn('Could not delete temporary video file:', err);
      }
      
      // Create the video entry in the database
      const video = await storage.createVideo({
        title,
        description: description || null,
        filePath: key, // Store the S3 key as the filePath
        thumbnailPath: thumbnailUrl || "", // Use the S3 key for thumbnail or empty string
        duration: duration ? parseInt(duration, 10) : 0,
        category: category || '',
        tags: tags ? tags.split(',') : [],
        isContest: isContest === true,
        isAI: isAI === true,
        userId: 1 // Default user
      });
      
      console.log(`Registered direct browser upload video: ${title} (key: ${key})`);
      
      res.json(video);
    } catch (error: any) {
      console.error('Error registering uploaded file:', error);
      res.status(500).json({ 
        error: "Failed to register upload",
        message: error.message || "Failed to register uploaded file"
      });
    }
  });
  
  // Endpoint to handle uploaded S3 videos
  app.post('/api/videos/s3', async (req: Request, res: Response) => {
    try {
      if (!USE_S3) {
        console.log('S3 upload endpoint accessed but S3 integration is disabled');
        return res.status(400).json({
          error: "S3 not configured",
          message: "S3 integration is disabled. Please use the standard upload endpoint.",
          fallbackAvailable: true
        });
      }
      
      const { key, title, description, duration, category, tags, isFeatured, isContest, isAI } = req.body;
      
      if (!key) {
        return res.status(400).json({
          error: "Missing key",
          message: "S3 object key is required"
        });
      }
      
      // Generate a thumbnail for the video
      // For S3 uploads, we need to download the video first to generate a thumbnail
      const tempFilePath = path.join(process.cwd(), 'uploads', `temp-${crypto.randomUUID()}.mp4`);
      const thumbnailFilename = `thumbnail-${crypto.randomUUID()}.jpg`;
      const thumbnailFullPath = path.join(thumbnailDir, thumbnailFilename);
      
      try {
        // Download the video from S3 to generate the thumbnail
        await downloadFileFromS3(key, tempFilePath);
        
        // Generate thumbnail from the downloaded video
        const thumbnailSuccess = await generateThumbnail(tempFilePath, thumbnailFullPath);
        
        if (!thumbnailSuccess) {
          console.warn("Failed to generate thumbnail, using generic thumbnail");
        }
        
        // Upload the thumbnail to S3 if it was successfully generated
        let thumbnailPath = '';
        if (thumbnailSuccess) {
          const thumbnailKey = `thumbnails/${thumbnailFilename}`;
          thumbnailPath = await uploadFileToS3(thumbnailFullPath, thumbnailKey, 'image/jpeg');
        }
        
        // Clean up the temporary file
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
        
        // Parse boolean flags from form data strings if needed
        const parsedIsFeatured = typeof isFeatured === 'string' ? isFeatured === 'true' : !!isFeatured;
        const parsedIsContest = typeof isContest === 'string' ? isContest === 'true' : !!isContest;
        const parsedIsAI = typeof isAI === 'string' ? isAI === 'true' : !!isAI;
        
        // Use Zod to validate video data
        const validatedData = insertVideoSchema.parse({
          title: title || path.basename(key),
          description: description || "",
          duration: duration ? parseInt(duration) : 0,
          filePath: key,
          thumbnailPath: thumbnailPath || thumbnailFilename, // Store either S3 path or local path
          category: category || "",
          tags: tags ? (typeof tags === 'string' ? tags.split(',') : tags) : [],
          isFeatured: parsedIsFeatured,
          isContest: parsedIsContest,
          isAI: parsedIsAI,
          userId: 1 // Default to demo user for now
        });
        
        // Create the video in storage
        const video = await storage.createVideo(validatedData);
        
        res.status(201).json(video);
      } catch (error) {
        // Clean up temporary files if they exist
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
        
        throw error;
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      
      console.error("Error processing S3 video upload:", error);
      res.status(500).json({
        error: "Failed to process upload",
        message: "There was an error processing the uploaded video. Please try again."
      });
    }
  });
  
  // Add a test endpoint for file size limits
  app.post('/api/test/file-size', testUpload.single('testFile'), (req: Request, res: Response) => {
    try {
      console.log("📊 TEST FILE UPLOAD RECEIVED");
      
      if (!req.file) {
        console.error("❌ Test upload failed: No file uploaded");
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      const fileSize = req.file.size;
      const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
      
      console.log(`
=========================================
📈 TEST UPLOAD SUCCESSFUL
=========================================
📝 File name: ${req.file.originalname}
📦 File size: ${fileSizeMB}MB (${fileSize} bytes)
🔖 MIME type: ${req.file.mimetype}
📂 Memory Storage Used (file not saved to disk)
🕒 Timestamp: ${new Date().toISOString()}
=========================================
      `);
      
      // Note: We're using memory storage (multer.memoryStorage) so there's no file to delete
      // The file is automatically discarded after the request
      
      return res.status(200).json({
        message: "File size test successful",
        fileDetails: {
          name: req.file.originalname,
          size: req.file.size,
          sizeMB: parseFloat(fileSizeMB),
          mimeType: req.file.mimetype,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error("❌ ERROR PROCESSING TEST FILE:", error);
      return res.status(500).json({ 
        message: "File upload test failed", 
        error: (error as Error).message,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Add a disk-based test endpoint for file size limits
  app.post('/api/test/file-size-disk', testDiskUpload.single('testFileDisk'), (req: Request, res: Response) => {
    try {
      console.log("📊 DISK-BASED TEST FILE UPLOAD RECEIVED");
      
      if (!req.file) {
        console.error("❌ Disk test upload failed: No file uploaded");
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      const fileSize = req.file.size;
      const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
      
      console.log(`
=========================================
📈 DISK-BASED TEST UPLOAD SUCCESSFUL
=========================================
📝 File name: ${req.file.originalname}
📦 File size: ${fileSizeMB}MB (${fileSize} bytes)
🔖 MIME type: ${req.file.mimetype}
📂 Saved to disk at: ${req.file.path}
🕒 Timestamp: ${new Date().toISOString()}
=========================================
      `);
      
      // Create the test-uploads directory if it doesn't exist
      const testUploadsDir = path.join(process.cwd(), 'test-uploads');
      if (!fs.existsSync(testUploadsDir)) {
        fs.mkdirSync(testUploadsDir, { recursive: true });
      }
      
      // Delete the test file after successful processing
      try {
        setTimeout(() => {
          if (req.file?.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
            console.log(`🗑️ Test file deleted after delay: ${req.file.path}`);
          }
        }, 5000); // Delete after 5 seconds to allow for client to finish getting response
      } catch (deleteError) {
        console.error('Error scheduling file deletion:', deleteError);
        // Continue - deletion failure is not critical
      }
      
      return res.status(200).json({
        message: "File size test successful (disk storage)",
        fileDetails: {
          name: req.file.originalname,
          size: req.file.size,
          sizeMB: parseFloat(fileSizeMB),
          mimeType: req.file.mimetype,
          path: req.file.path,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error("❌ ERROR PROCESSING DISK TEST FILE:", error);
      return res.status(500).json({ 
        message: "File upload test failed", 
        error: (error as Error).message,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // IMPORTANT: Serve static files - this is configured to match the client-side URL patterns
  // Instead of using express.static for videos, we'll implement our own handler with streaming support
  app.get('/videos/:filename', async (req: Request, res: Response) => {
    try {
      const filename = req.params.filename;
      console.log('Video streaming request for:', filename);
      
      // First try to serve from local storage
      const localPath = path.join(uploadDir, filename);
      
      if (fs.existsSync(localPath)) {
        console.log('Found video locally, streaming from:', localPath);
        return streamLocalVideoFile(localPath, req, res);
      }
      
      // If not found locally, try to stream from S3
      if (USE_S3) {
        const s3Key = `uploads/${filename}`;
        console.log('Video not found locally, trying to stream from S3:', s3Key);
        
        try {
          const exists = await fileExistsInS3(s3Key);
          if (exists) {
            console.log('Found video in S3, streaming...');
            
            // Get a presigned URL from S3 with a long expiration
            const presignedUrl = await getPresignedUrl(s3Key, 3600);
            
            // Redirect to the presigned URL for direct streaming from S3
            // This is more efficient than proxying through our server
            return res.redirect(presignedUrl);
          }
        } catch (s3Error) {
          console.error('Error checking S3:', s3Error);
        }
      }
      
      // If we get here, the video wasn't found
      console.error(`Video not found locally or in S3: ${filename}`);
      return res.status(404).send('Video not found');
    } catch (error) {
      console.error('Error serving video:', error);
      return res.status(500).send('Error processing video request');
    }
  });
  
  app.use('/thumbnails', express.static(thumbnailDir, {
    setHeaders: (res, path) => {
      if (path.endsWith('.svg')) {
        res.setHeader('Content-Type', 'image/svg+xml');
      } else if (path.endsWith('.html')) {
        res.setHeader('Content-Type', 'text/html');
      }
    }
  }));
  app.use(express.static(path.join(process.cwd(), 'public')));
  
  // Thumbnail API endpoint - serves thumbnails from local storage or S3
  app.get('/thumbnails/api/:filename', async (req: Request, res: Response) => {
    try {
      const filename = req.params.filename;
      console.log('Thumbnail API request for:', filename);
      
      // Special handling for default thumbnail
      if (filename === 'default-thumbnail.jpg') {
        // Create the default thumbnail path
        const defaultPath = path.join(thumbnailDir, 'default-thumbnail.jpg');
        
        // If default thumbnail exists
        if (fs.existsSync(defaultPath)) {
          console.log('Serving default thumbnail');
          return res.sendFile(defaultPath);
        } else {
          // Try to create the default thumbnail dynamically
          try {
            // Ensure thumbnails directory exists
            if (!fs.existsSync(thumbnailDir)) {
              fs.mkdirSync(thumbnailDir, { recursive: true });
            }
            
            // Create a color block image for default thumbnail
            const base64Image = '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';
            
            // Convert the base64 string to a buffer
            const buffer = Buffer.from(base64Image, 'base64');
            
            // Save the buffer to a file
            fs.writeFileSync(defaultPath, buffer);
            
            console.log('Created new default thumbnail image');
            
            // Serve the newly created thumbnail
            return res.sendFile(defaultPath);
          } catch (createError) {
            console.error('Error creating default thumbnail:', createError);
            
            // Fall back to a simple SVG if we can't create the image
            console.log('Falling back to SVG placeholder');
            const placeholderSvg = `
              <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
                <rect width="640" height="360" fill="#6A5ACD" />
                <text x="50%" y="180" font-family="Arial, sans-serif" font-size="36" fill="#ffffff" text-anchor="middle">
                  ChatterTV
                </text>
                <text x="50%" y="220" font-family="Arial, sans-serif" font-size="20" fill="#ffffff" text-anchor="middle">
                  Recovered Video
                </text>
              </svg>
            `;
            
            res.setHeader('Content-Type', 'image/svg+xml');
            return res.send(placeholderSvg);
          }
        }
      }
      
      // Check if this file exists locally
      const localPath = path.join(thumbnailDir, filename);
      console.log('Checking local path:', localPath);
      
      if (fs.existsSync(localPath)) {
        console.log('Found thumbnail locally, serving from:', localPath);
        return res.sendFile(localPath);
      }
      
      console.log('Thumbnail not found locally');
      
      // Check if this is a custom thumbnail in S3 (for videos uploaded via S3)
      if (USE_S3 && s3Client) {
        try {
          // Try both with and without the thumbnails/ prefix
          const s3Key = filename.startsWith('thumbnails/') ? filename : `thumbnails/${filename}`;
          const exists = await fileExistsInS3(s3Key);
          
          if (exists) {
            // Generate a presigned URL for the S3 thumbnail
            const presignedUrl = await getPresignedUrl(s3Key, 7 * 24 * 3600); // 7 days
            console.log(`Found thumbnail in S3, redirecting to presigned URL valid for 7 days`);
            return res.redirect(presignedUrl);
          }
        } catch (s3Error) {
          console.error('Error checking S3 for thumbnail:', s3Error);
        }
      }
      
      // If we get here, the thumbnail wasn't found - serve the default
      console.log(`Thumbnail not found: ${filename}, serving default thumbnail instead`);
      
      // Try to use the default thumbnail if it exists
      const defaultPath = path.join(thumbnailDir, 'default-thumbnail.jpg');
      if (fs.existsSync(defaultPath)) {
        console.log('Serving default thumbnail as fallback');
        return res.sendFile(defaultPath);
      }
      
      // Last resort - serve a simple SVG placeholder
      console.log('No default thumbnail available, serving SVG placeholder');
      const placeholderSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
          <rect width="640" height="360" fill="#6A5ACD" />
          <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="24" fill="#ffffff" text-anchor="middle">
            ChatterTV
          </text>
        </svg>
      `;
      
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.send(placeholderSvg);
    } catch (error) {
      console.error('Error serving thumbnail:', error);
      res.status(500).send('Error processing thumbnail request');
    }
  });
  
  // Video download endpoint for both local and S3 files with a focus on browser compatibility
  app.get("/api/videos/:id/download", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const video = await storage.getVideo(id);
      
      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }
      
      // Verify this is an AI video that should be downloadable
      if (!video.isAI) {
        console.warn(`Attempt to download non-AI video (id: ${id})`);
        return res.status(403).json({ message: "Only AI-generated videos can be downloaded" });
      }
      
      console.log(`Preparing download for video ${id}:`, video.filePath);
      
      // Determine if this is an S3 video or local
      const isS3Video = video.filePath.startsWith('https://') && video.filePath.includes('amazonaws.com');
      
      // Create a proper filename for the download
      const safeFilename = video.title 
        ? `${video.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.mp4` 
        : 'video.mp4';
      
      // Extract original filename from path or URL
      let originalFilename = video.filePath;
      if (video.filePath.startsWith('https://')) {
        const parts = video.filePath.split('/');
        originalFilename = parts[parts.length - 1].split('?')[0]; // Remove any query parameters
      } else if (video.filePath.startsWith('uploads/')) {
        originalFilename = video.filePath.replace('uploads/', '');
      }
      
      // First try serving from local storage - direct file transfer
      const videoPath = path.join(process.cwd(), 'uploads', originalFilename);
      
      if (fs.existsSync(videoPath)) {
        console.log(`Serving local file for download: ${videoPath}`);
        
        // Set appropriate headers for the download
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
        
        // For local files, use direct file transfer instead of streaming
        const fileStream = fs.createReadStream(videoPath);
        return fileStream.pipe(res);
      }
      
      // If not found locally and it's not an S3 video, it's an error
      if (!isS3Video) {
        console.error(`Video file not found locally at: ${videoPath}`);
        return res.status(404).json({ message: "Video file not found" });
      }
      
      // For S3 videos, first try to download to a temp location for more reliable download
      console.log('File not available locally, downloading from S3');
      
      try {
        // Get S3 key
        let s3Key;
        if (video.filePath.startsWith('uploads/')) {
          s3Key = video.filePath;
        } else if (video.filePath.startsWith('https://')) {
          s3Key = getS3KeyFromUrl(video.filePath);
        } else {
          s3Key = `uploads/${originalFilename}`;
        }
        
        console.log(`Downloading S3 file with key: ${s3Key}`);
        
        // Create a temporary file path
        const tempDir = path.join(process.cwd(), 'temp-videos');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const tempFilePath = path.join(tempDir, originalFilename);
        
        try {
          // Download the file from S3 to the temporary location
          await downloadFileFromS3(s3Key, tempFilePath);
          
          console.log(`Successfully downloaded S3 file to ${tempFilePath}, serving to client`);
          
          // Set appropriate headers for the download
          res.setHeader('Content-Type', 'video/mp4');
          res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
          
          // Stream the file to the client
          const fileStream = fs.createReadStream(tempFilePath);
          
          // Clean up the temp file after download completes
          fileStream.on('close', () => {
            setTimeout(() => {
              try {
                if (fs.existsSync(tempFilePath)) {
                  fs.unlinkSync(tempFilePath);
                  console.log(`Cleaned up temporary file: ${tempFilePath}`);
                }
              } catch (cleanupError) {
                console.error(`Error cleaning up temp file: ${cleanupError}`);
              }
            }, 5000); // 5 second delay to ensure file is completely streamed
          });
          
          return fileStream.pipe(res);
        } catch (downloadError) {
          console.error('Error downloading from S3:', downloadError);
          
          // If direct download fails, fall back to redirect approach
          console.log('Falling back to presigned URL redirect');
          
          // Generate a presigned URL with a longer expiration time (1 hour)
          const presignedUrl = await getPresignedUrl(s3Key, 3600);
          
          // Instead of streaming, redirect to the presigned URL
          return res.redirect(presignedUrl);
        }
      } catch (s3Error) {
        console.error('Error with S3 operations:', s3Error);
        return res.status(500).json({ message: "Failed to download video from storage" });
      }
    } catch (error) {
      console.error("Error downloading video:", error);
      res.status(500).json({ message: "Failed to download video" });
    }
  });
  
  // Helper function to stream a local video file with proper range support
  function streamLocalVideoFile(filePath: string, req: Request, res: Response) {
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    
    // Handle range requests (for video seeking)
    const range = req.headers.range;
    
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      
      const chunkSize = (end - start) + 1;
      const file = fs.createReadStream(filePath, { start, end });
      
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'video/mp4',
      });
      
      file.pipe(res);
    } else {
      // No range requested, send entire file
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      });
      
      fs.createReadStream(filePath).pipe(res);
    }
  }
  
  // Helper function to stream directly from S3 to response
  async function streamS3VideoToResponse(s3Key: string, req: Request, res: Response) {
    if (!USE_S3 || !s3Client) {
      throw new Error('S3 integration is not properly configured');
    }
    
    console.log(`Streaming S3 video with key: ${s3Key}`);
    
    // Get proper S3 key format
    const normalizedKey = s3Key.startsWith('/') ? s3Key.substring(1) : s3Key;
    
    // Get the deployment configuration options
    const isProd = isProduction();
    const streamingConfig = DEPLOYMENT_CONFIG.videoStreaming;
    
    // In production with very large files, we might want to use presigned URLs
    // instead of proxying through our server to save resources
    if (isProd && streamingConfig.preferS3PresignedUrls) {
      try {
        console.log('Production mode: Using presigned URL approach for S3 streaming');
        const presignedUrl = await getPresignedUrl(normalizedKey, 3600);
        return res.redirect(presignedUrl);
      } catch (presignedError) {
        console.error('Error generating presigned URL, falling back to direct streaming:', presignedError);
        // Fall through to direct streaming approach
      }
    }
    
    // For direct streaming through our server
    try {
      // Create S3 command to get the object
      const command = new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET as string,
        Key: normalizedKey,
        // For video streaming, we should handle range requests
        Range: req.headers.range ? req.headers.range : undefined
      });
      
      // Get the object from S3
      const response = await s3Client.send(command);
      
      // Set response headers
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Accept-Ranges', 'bytes');
      
      // If it's a range request, handle partial content
      if (req.headers.range && response.ContentRange) {
        res.setHeader('Content-Range', response.ContentRange);
        res.status(206); // Partial content
      } else {
        res.status(200); // OK
      }
      
      // Set content length if available
      if (response.ContentLength !== undefined) {
        res.setHeader('Content-Length', response.ContentLength);
      }
      
      // Make sure we have a Body
      if (!response.Body) {
        throw new Error('S3 response body is missing');
      }
      
      // Handle streaming based on the response type
      if (response.Body instanceof Readable) {
        // Direct stream for Node.js Readable stream
        const stream = response.Body;
        
        // Stream to response
        stream.pipe(res);
        
        // Return a promise that resolves when the stream ends or errors
        return new Promise<boolean>((resolve, reject) => {
          stream.on('end', () => {
            console.log(`Successfully streamed S3 file: ${s3Key}`);
            resolve(true);
          });
          
          stream.on('error', (err: any) => {
            console.error(`Error streaming S3 file: ${s3Key}`, err);
            reject(err);
          });
          
          // Handle client disconnect
          res.on('close', () => {
            stream.destroy();
            resolve(true);
          });
        });
      } else {
        // For AWS SDK v3, the Body might be a Web Stream, Blob, or other type
        console.log('Response is not a Node.js Readable stream, using Web Streams API');
        
        if (!response.Body) {
          throw new Error('S3 response body is empty');
        }
        
        try {
          // Try to handle as a Web Stream
          if (response.Body.transformToByteArray) {
            // If we can convert to byte array directly
            console.log('Converting Web Stream to byte array');
            // @ts-ignore - AWS SDK types don't fully match TypeScript's expectations
            const data = await response.Body.transformToByteArray();
            res.write(Buffer.from(data));
            res.end();
            console.log(`Successfully streamed S3 file using byte array: ${s3Key}`);
            return true;
          } 
          else if (response.Body.transformToString) {
            // If we can convert to string directly
            console.log('Converting Web Stream to string');
            // @ts-ignore - AWS SDK types don't fully match TypeScript's expectations
            const data = await response.Body.transformToString();
            res.write(data);
            res.end();
            console.log(`Successfully streamed S3 file using string: ${s3Key}`);
            return true;
          }
          else if ('getReader' in response.Body) {
            // Handle as ReadableStream from Web Streams API
            console.log('Using ReadableStream handling');
            // @ts-ignore - AWS SDK types don't fully match TypeScript's expectations
            const reader = response.Body.getReader();
            
            // Process the stream chunks
            let processStream = async () => {
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  
                  // Process each chunk (value is a Uint8Array)
                  res.write(Buffer.from(value));
                }
                
                res.end();
                console.log(`Successfully streamed S3 file using ReadableStream: ${s3Key}`);
                return true;
              } catch (streamError) {
                console.error('Error processing stream:', streamError);
                res.status(500).end();
                return false;
              }
            };
            
            return await processStream();
          }
          else {
            // Last resort for any other type of response
            console.log('Using fallback method for unknown body type');
            
            // Try to convert the body to a buffer or string somehow
            // @ts-ignore - We're trying our best with an unknown type
            const data = await response.Body;
            
            if (data instanceof Buffer || data instanceof Uint8Array) {
              res.write(Buffer.from(data));
            } else if (typeof data === 'string') {
              res.write(data);
            } else if (data instanceof ArrayBuffer) {
              res.write(Buffer.from(data));
            } else {
              // As a last resort, try to JSON stringify
              try {
                res.write(JSON.stringify(data));
              } catch (e) {
                console.error('Could not convert response body to sendable format');
                throw new Error('Unsupported response body type from S3');
              }
            }
            
            res.end();
            console.log(`Successfully streamed S3 file using fallback: ${s3Key}`);
            return true;
          }
        } catch (streamError) {
          console.error('Error handling S3 response stream:', streamError);
          throw streamError;
        }
      }
    } catch (error) {
      console.error(`Error getting S3 object for streaming (${s3Key}):`, error);
      
      // For production, we'll fall back to a presigned URL as last resort
      if (isProd) {
        try {
          console.log('Production fallback: Using presigned URL approach after streaming failed');
          const presignedUrl = await getPresignedUrl(normalizedKey, 3600);
          return res.redirect(presignedUrl);
        } catch (fallbackError) {
          console.error('Both streaming and presigned URL fallback failed:', fallbackError);
        }
      }
      
      throw error;
    }
  }

  // Health check endpoint
  app.get("/api/health", (req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  // Video endpoints
  app.get("/api/videos", async (req: Request, res: Response) => {
    try {
      const videos = await storage.getVideos();
      res.json(videos);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch videos" });
    }
  });

  app.get("/api/videos/recent", async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 5;
      const videos = await storage.getRecentVideos(limit);
      res.json(videos);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch recent videos" });
    }
  });

  app.get("/api/videos/featured", async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 5;
      const videos = await storage.getFeaturedVideos(limit);
      res.json(videos);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch featured videos" });
    }
  });

  app.get("/api/videos/contest", async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 5;
      const videos = await storage.getContestVideos(limit);
      res.json(videos);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch contest videos" });
    }
  });
  
  app.get("/api/videos/ai", async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 5;
      const videos = await storage.getAIVideos(limit);
      res.json(videos);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch AI videos" });
    }
  });

  app.get("/api/videos/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const video = await storage.getVideo(id);
      
      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }
      
      // Increment views when video is fetched
      await storage.incrementViews(id);
      
      res.json(video);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch video" });
    }
  });

  // Define custom error handler for multer
  const uploadErrorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
    console.error("❌ Upload error occurred:", err);
    
    if (err.code === 'LIMIT_FILE_SIZE') {
      console.error(`File size limit exceeded (max: ${MAX_FILE_SIZE/1024/1024}MB)`);
      return res.status(413).json({
        message: "File is too large",
        error: `Maximum file size is ${MAX_FILE_SIZE/1024/1024}MB`,
        code: "FILE_TOO_LARGE",
        maxSizeBytes: MAX_FILE_SIZE,
        maxSizeMB: MAX_FILE_SIZE/1024/1024
      });
    }
    
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      console.error("Unexpected field in upload request");
      return res.status(400).json({
        message: "Unexpected field in upload request",
        error: "The form contains an invalid field",
        code: "INVALID_FIELD", 
        tip: "Make sure the file field is named 'video'"
      });
    }
    
    // Handle generic multer errors
    console.error("Generic upload error:", err.message);
    return res.status(500).json({
      message: "File upload failed",
      error: err.message || "Unknown upload error",
      code: "UPLOAD_FAILED"
    });
  };
  
  // Video upload endpoint with optimized error handling for larger files
  app.post("/api/videos", (req: Request, res: Response, next: NextFunction) => {
    console.log("📤 Standard video upload endpoint called");
    
    // Use multer upload with custom error handling
    upload.single("video")(req, res, (err) => {
      if (err) {
        return uploadErrorHandler(err, req, res, next);
      }
      
      // Continue to actual handler if no multer errors
      processVideoUpload(req, res).catch(next);
    });
  });
  
  // Separate function to process the upload after multer has handled the file
  async function processVideoUpload(req: Request, res: Response) {
    try {
      console.log("🎬 Processing video upload");
      
      if (!req.file) {
        console.error("❌ No file in request - upload failed");
        return res.status(400).json({ 
          message: "No video file uploaded", 
          error: "Missing file attachment",
          code: "MISSING_FILE",
          tip: "Make sure the file is included in the FormData with the key 'video'"
        });
      }
      
      console.log(`Processing uploaded file: ${req.file.originalname} (${req.file.size} bytes, ${req.file.mimetype})`);
      

      // Get local paths
      const filename = path.basename(req.file.path);
      const videoFullPath = req.file.path;
      
      // Generate thumbnail filename and path
      const thumbnailFilename = `thumbnail-${randomUUID()}.jpg`;
      const thumbnailFullPath = path.join(thumbnailDir, thumbnailFilename);
      
      // Generate thumbnail from the uploaded video
      const thumbnailSuccess = await generateThumbnail(videoFullPath, thumbnailFullPath);
      if (!thumbnailSuccess) {
        console.warn("Failed to generate thumbnail, using video without thumbnail");
      }
      
      // Default to local paths
      let videoPath = filename;
      let thumbnailPath = thumbnailFilename;
      
      // Try to upload to S3 if it's enabled
      if (USE_S3) {
        try {
          console.log('Uploading files to S3...');
          
          // Upload video to S3
          const videoKey = `uploads/${filename}`;
          const s3VideoUrl = await uploadFileToS3(videoFullPath, videoKey, req.file.mimetype);
          videoPath = videoKey; // Store the S3 key in the database
          
          // Upload thumbnail to S3 if we have one
          if (thumbnailSuccess) {
            const thumbnailKey = `thumbnails/${thumbnailFilename}`;
            const s3ThumbnailUrl = await uploadFileToS3(thumbnailFullPath, thumbnailKey, 'image/jpeg');
            thumbnailPath = thumbnailKey; // Store the S3 key in the database
          }
          
          console.log('Successfully uploaded files to S3');
        } catch (error) {
          console.error('Failed to upload to S3, falling back to local storage:', error);
          // Fallback to local storage (paths already set)
        }
      } else {
        console.log('AWS S3 integration is disabled, using local storage.');
      }
      
      console.log('Final video path:', videoPath);
      console.log('Final thumbnail path:', thumbnailPath);
      
      // Parse boolean flags from form data strings
      const isContest = req.body.isContest === "true";
      const isAI = req.body.isAI === "true";
      console.log("Creating video with isContest:", isContest, "isAI:", isAI);
      
      // Use Zod to validate request body
      const validatedData = insertVideoSchema.parse({
        title: req.body.title,
        description: req.body.description || "",
        duration: parseInt(req.body.duration || "0"),
        filePath: videoPath,
        thumbnailPath: thumbnailPath,
        category: req.body.category || "",
        tags: req.body.tags ? req.body.tags.split(",") : [],
        isFeatured: req.body.isFeatured === "true",
        isContest: isContest,
        isAI: isAI,
        userId: 1 // Default to demo user for now (in a real app, would be from auth)
      });
      
      const video = await storage.createVideo(validatedData);
      
      // No need to clean up local files - we keep them as backups 
      // even when S3 upload succeeds for additional redundancy
      
      res.status(201).json(video);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      
      console.error("Error uploading video:", error);
      res.status(500).json({ message: "Failed to upload video" });
    }
  }

  app.delete("/api/videos/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const video = await storage.getVideo(id);
      
      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }
      
      // Try deleting from S3 first if the path looks like an S3 key
      if (USE_S3 && video.filePath && !video.filePath.includes("://")) {
        try {
          console.log('Attempting to delete video from S3:', video.filePath);
          await deleteFileFromS3(video.filePath);
          
          // Also delete thumbnail from S3
          if (video.thumbnailPath) {
            console.log('Attempting to delete thumbnail from S3:', video.thumbnailPath);
            await deleteFileFromS3(video.thumbnailPath);
          }
        } catch (s3Error) {
          console.error('Error deleting files from S3:', s3Error);
          // Continue to try local deletion as fallback
        }
      }
      
      // Also clean up local files (we keep them as backups)
      
      // Delete the video file from local storage
      try {
        // Extract just the filename
        const filename = path.basename(video.filePath);
        const fullFilePath = path.join(uploadDir, filename);
        
        if (fs.existsSync(fullFilePath)) {
          fs.unlinkSync(fullFilePath);
          console.log('Deleted video file from local storage:', fullFilePath);
        } else {
          console.warn('Video file not found in local storage at path:', fullFilePath);
        }
      } catch (fileError) {
        console.error('Error deleting video file:', fileError);
        // Continue with deletion even if file delete fails
      }
      
      // Delete the thumbnail file from local storage
      try {
        // Extract just the filename
        const filename = path.basename(video.thumbnailPath);
        const fullThumbnailPath = path.join(thumbnailDir, filename);
        
        if (fs.existsSync(fullThumbnailPath)) {
          fs.unlinkSync(fullThumbnailPath);
          console.log('Deleted thumbnail file from local storage:', fullThumbnailPath);
        } else {
          console.warn('Thumbnail file not found in local storage at path:', fullThumbnailPath);
        }
      } catch (thumbError) {
        console.error('Error deleting thumbnail file:', thumbError);
        // Continue with deletion even if thumbnail delete fails
      }
      
      // Delete from database
      const success = await storage.deleteVideo(id);
      
      if (success) {
        res.status(204).end();
      } else {
        res.status(500).json({ message: "Failed to delete video from database" });
      }
    } catch (error) {
      console.error("Error deleting video:", error);
      res.status(500).json({ message: "Failed to delete video" });
    }
  });

  // Comment endpoints
  app.get("/api/videos/:id/comments", async (req: Request, res: Response) => {
    try {
      const videoId = parseInt(req.params.id);
      const comments = await storage.getComments(videoId);
      res.json(comments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });

  app.post("/api/videos/:id/comments", async (req: Request, res: Response) => {
    try {
      const videoId = parseInt(req.params.id);
      
      // Validate video exists
      const video = await storage.getVideo(videoId);
      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }
      
      // Validate comment data
      const validatedData = insertCommentSchema.parse({
        content: req.body.content,
        videoId: videoId,
        userId: 1 // Default to demo user for now (in a real app, would be from auth)
      });
      
      const comment = await storage.createComment(validatedData);
      res.status(201).json(comment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      
      res.status(500).json({ message: "Failed to create comment" });
    }
  });

  // Local file access proxy - handles access to files from different locations
  app.get("/api/file/proxy", async (req: Request, res: Response) => {
    try {
      const key = req.query.key as string;
      const type = req.query.type as string;
      
      if (!key) {
        return res.status(400).json({ message: "Missing key parameter" });
      }
      
      // Decode the key to handle special characters
      const decodedKey = decodeURIComponent(key);
      console.log(`File proxy request for: ${decodedKey}, type: ${type}`);
      
      // Determine appropriate path based on file type
      let filePath;
      if (type === 'thumbnail') {
        filePath = path.join(thumbnailDir, path.basename(decodedKey));
      } else {
        filePath = path.join(uploadDir, path.basename(decodedKey));
      }
      
      if (fs.existsSync(filePath)) {
        // Set appropriate content type based on file extension
        if (type === 'thumbnail' || decodedKey.endsWith('.jpg') || decodedKey.endsWith('.jpeg')) {
          res.setHeader('Content-Type', 'image/jpeg');
        } else if (decodedKey.endsWith('.png')) {
          res.setHeader('Content-Type', 'image/png');
        } else if (decodedKey.endsWith('.mp4')) {
          res.setHeader('Content-Type', 'video/mp4');
        } else {
          res.setHeader('Content-Type', 'application/octet-stream');
        }
        
        return res.sendFile(filePath);
      }
      
      console.log('File not found at path:', filePath);
      res.status(404).json({ message: "File not found" });
    } catch (error) {
      console.error("Error in file proxy:", error);
      res.status(500).json({ message: "Failed to proxy file" });
    }
  });

  // Set up static file serving for the uploads directory directly
  app.use('/videos', express.static(path.join(process.cwd(), 'uploads'), {
    setHeaders: (res, filePath) => {
      // Set appropriate headers for video files
      if (filePath.endsWith('.mp4') || filePath.endsWith('.MP4')) {
        res.setHeader('Content-Type', 'video/mp4');
      } else if (filePath.endsWith('.mov') || filePath.endsWith('.MOV')) {
        res.setHeader('Content-Type', 'video/quicktime');
      } else if (filePath.endsWith('.webm')) {
        res.setHeader('Content-Type', 'video/webm');
      }
      res.setHeader('Accept-Ranges', 'bytes');
    }
  }));
  
  // Redirect the streaming endpoint to use the static file server
  app.get("/api/videos/stream", (req: Request, res: Response) => {
    try {
      const key = req.query.key as string;
      if (!key) {
        return res.status(400).json({ message: "Missing key parameter" });
      }
      
      console.log(`Video stream request for: ${key}`);
      
      // Check if the file exists before redirecting
      const filePath = path.join(process.cwd(), 'uploads', key);
      if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return res.status(404).json({ message: "Video file not found" });
      }
      
      // Redirect to the static file URL
      const redirectUrl = `/videos/${encodeURIComponent(key)}`;
      console.log(`Redirecting to static file: ${redirectUrl}`);
      return res.redirect(redirectUrl);
      
    } catch (error) {
      console.error("Error handling stream request:", error);
      res.status(500).json({ message: "Failed to stream video" });
    }
  });
  
  // We already set up static file serving at the top of the function
  const httpServer = createServer(app);
  return httpServer;
}
