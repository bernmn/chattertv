import { Video, InsertVideo } from '@shared/schema';
import type { IStorage } from './storage';
import fs from 'fs';
import path from 'path';

/**
 * Formats a UUID or filename into a readable title
 * @param input The input string (filename or UUID)
 * @returns A formatted title string
 */
function formatTitle(input: string): string {
  // Check if it looks like a UUID (contains many hyphens and is long)
  const isUUID = input.includes('-') && input.length > 30;
  
  if (isUUID) {
    // For UUIDs, use a generic name instead of the UUID itself
    return 'Recovered Video';
  }
  
  // For regular filenames, format them nicely
  return input
    .replace(/[-_]/g, ' ')                // Replace dashes and underscores with spaces
    .replace(/\b\w/g, c => c.toUpperCase()) // Capitalize first letter of each word
    .trim();
}

/**
 * Function to recover videos from S3 and local filesystem that might not be in the storage.
 * This helps ensure videos are tracked in the database even after server restarts.
 */
export async function syncWithS3(storage: IStorage): Promise<void> {
  try {
    // Check if there's a do-not-sync flag file
    const doNotSyncPath = path.join(process.cwd(), 'do-not-sync.flag');
    if (fs.existsSync(doNotSyncPath)) {
      console.log("⚠️ do-not-sync.flag file found - skipping video synchronization");
      return;
    }
    
    // First, try to sync from local uploads directory
    await syncFromLocalFiles(storage);
    
    // Then, try to sync from S3 if available
    await syncFromS3Storage(storage);
  } catch (error) {
    console.error("Error in main sync function:", error);
  }
}

/**
 * Synchronize videos from the local filesystem
 */
async function syncFromLocalFiles(storage: IStorage): Promise<void> {
  try {
    console.log("Checking local filesystem for videos...");
    
    // The directory where uploads are stored
    const uploadsDir = './uploads';
    
    // Make sure the directory exists
    if (!fs.existsSync(uploadsDir)) {
      console.log("Uploads directory does not exist, creating it");
      fs.mkdirSync(uploadsDir, { recursive: true });
      return;
    }
    
    // Read all files in the uploads directory
    const files = fs.readdirSync(uploadsDir);
    const videoFiles = files.filter(file => 
      /\.(mp4|webm|mov|avi|mkv)$/i.test(file)
    );
    
    console.log(`Found ${videoFiles.length} video files in local uploads directory`);
    
    if (videoFiles.length === 0) {
      return;
    }
    
    // Get existing videos in storage
    const existingVideos = await storage.getVideos();
    
    // Map of existing file paths for quick lookup
    const existingPaths = new Set<string>(existingVideos.map(v => {
      // Handle both formats: with and without "uploads/" prefix
      if (v.filePath.startsWith('uploads/')) {
        return v.filePath;
      } else {
        return `uploads/${v.filePath}`;
      }
    }));
    
    // Add also the bare filenames without the path
    existingVideos.forEach(v => {
      const filename = v.filePath.split('/').pop();
      if (filename) {
        existingPaths.add(filename);
      }
    });
    
    // Track how many videos were synchronized
    let syncCount = 0;
    
    // Process each video file
    for (const videoFile of videoFiles) {
      // Skip if this video is already in the database
      if (existingPaths.has(videoFile) || existingPaths.has(`uploads/${videoFile}`)) {
        console.log(`Local video already in database: ${videoFile}`);
        continue;
      }
      
      // Get the file stats to check size and dates
      const stats = fs.statSync(path.join(uploadsDir, videoFile));
      
      // Skip files that are empty or too small (likely corrupted)
      if (stats.size < 1024) { // 1KB
        console.log(`Skipping very small file (likely corrupted): ${videoFile}`);
        continue;
      }
      
      // Get the base name without extension for the thumbnail
      const baseName = videoFile.split('.')[0];
      
      // Check if a thumbnail exists
      let thumbnailPath = `thumbnails/thumbnail-${baseName}.jpg`;
      
      // If no specific thumbnail found, use a generic one or create one
      if (!fs.existsSync(`./thumbnails/thumbnail-${baseName}.jpg`)) {
        thumbnailPath = 'thumbnails/default-thumbnail.jpg';
      }
      
      // Create a new video record
      try {
        const title = formatTitle(baseName);
        const videoExtension = videoFile.split('.').pop()?.toLowerCase() || 'mp4';
        
        // Try to determine the category based on file metadata
        const isAI = videoFile.toLowerCase().includes('ai') || 
                     baseName.toLowerCase().includes('ai');
        
        const newVideo: InsertVideo = {
          title,
          description: `Local video recovered during sync`,
          duration: 0, // We don't know the duration without processing
          filePath: `uploads/${videoFile}`,
          thumbnailPath,
          category: 'Videos',
          tags: [videoExtension.toUpperCase(), 'Recovered'],
          isFeatured: false,
          isContest: false,
          isAI,
          userId: 1 // Default to the demo user
        };
        
        await storage.createVideo(newVideo);
        syncCount++;
        console.log(`Synchronized local video: ${videoFile}`);
      } catch (err) {
        console.error(`Error creating video record for ${videoFile}:`, err);
      }
    }
    
    console.log(`Local filesystem synchronization complete. Recovered ${syncCount} videos.`);
  } catch (error) {
    console.error("Error syncing from local files:", error);
  }
}

/**
 * Synchronize videos from S3 storage
 */
async function syncFromS3Storage(storage: IStorage): Promise<void> {
  try {
    // Check if S3 module is available and enabled
    const s3Module = await import('./s3');
    if (!s3Module.USE_S3) {
      console.log("S3 not enabled, skipping S3 sync");
      return;
    }
    
    console.log("Starting S3 bucket synchronization...");
    
    // List all objects in S3 - we'll scan both uploads/ and other directories
    const allKeys = await s3Module.listS3Objects('');
    
    // Filter for video files
    const videoKeys = allKeys.filter(key => 
      /\.(mp4|webm|mov|avi|mkv)$/i.test(key)
    );
    
    if (videoKeys.length === 0) {
      console.log("No video files found in S3, skipping S3 sync");
      return;
    }
    
    console.log(`Found ${videoKeys.length} video objects in S3`);
    
    // Get existing videos in storage
    const existingVideos = await storage.getVideos();
    
    // Map of existing file paths for quick lookup
    const existingPaths = new Set<string>();
    
    // Add all variations of paths to handle different formats
    existingVideos.forEach(v => {
      existingPaths.add(v.filePath);
      
      // Also add without uploads/ prefix if it has one
      if (v.filePath.startsWith('uploads/')) {
        existingPaths.add(v.filePath.substring(8)); // Remove 'uploads/'
      } else {
        // Also add with uploads/ prefix if it doesn't have one
        existingPaths.add(`uploads/${v.filePath}`);
      }
      
      // Add just the filename
      const filename = v.filePath.split('/').pop();
      if (filename) {
        existingPaths.add(filename);
      }
    });
    
    // Track how many videos were synchronized
    let syncCount = 0;
    
    // Create a video entry for each S3 key that doesn't exist in storage
    for (const videoKey of videoKeys) {
      // Skip if this video is already in the database (check all variations)
      let isExisting = false;
      
      if (existingPaths.has(videoKey)) {
        isExisting = true;
      }
      
      // Check without path prefix
      const filename = videoKey.split('/').pop();
      if (filename && existingPaths.has(filename)) {
        isExisting = true;
      }
      
      if (isExisting) {
        console.log(`S3 video already in database: ${videoKey}`);
        continue;
      }
      
      // Generate a thumbnail key based on the video key
      const baseName = videoKey.split('/').pop()?.split('.')[0] || '';
      let thumbnailKey = `thumbnails/thumbnail-${baseName}.jpg`;
      
      // Check if this thumbnail exists in S3
      const thumbnailExists = await s3Module.fileExistsInS3(thumbnailKey);
      if (!thumbnailExists) {
        // If no custom thumbnail, use a generic default for now
        thumbnailKey = 'thumbnails/default-thumbnail.jpg';
      }
      
      // Create a new video record
      try {
        const title = formatTitle(baseName);
        const videoExtension = videoKey.split('.').pop()?.toLowerCase() || 'mp4';
        
        // Determine if it's an AI video based on filename
        const isAI = videoKey.toLowerCase().includes('ai') || 
                    baseName.toLowerCase().includes('ai');
        
        // Determine if it's a contest video based on path or name
        const isContest = videoKey.toLowerCase().includes('contest') || 
                         baseName.toLowerCase().includes('contest');
        
        // Create the video record
        const newVideo: InsertVideo = {
          title,
          description: `S3 Video (${videoExtension.toUpperCase()})`,
          duration: 0, // We don't know the duration without processing the video
          filePath: videoKey, // Store the full S3 key
          thumbnailPath: thumbnailKey,
          category: 'Videos',
          tags: [videoExtension.toUpperCase(), 'S3'],
          isFeatured: false,
          isContest,
          isAI,
          userId: 1 // Default to the demo user
        };
        
        await storage.createVideo(newVideo);
        syncCount++;
        console.log(`Synchronized video from S3: ${videoKey}`);
      } catch (err) {
        console.error(`Error creating video record for ${videoKey}:`, err);
      }
    }
    
    console.log(`S3 synchronization complete. Synchronized ${syncCount} videos.`);
  } catch (error) {
    console.error("Error syncing with S3:", error);
  }
}