// Script to delete all videos from the system
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Delete all entries from data-store.json
try {
  // Read the current data store
  const dataFile = 'data-store.json';
  let data = { videos: [], users: [], comments: [] };
  
  if (fs.existsSync(dataFile)) {
    const existingData = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    // Keep users, remove videos and comments
    data.users = existingData.users || [];
  }
  
  // Write back the cleaned data
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
  console.log('Cleared all videos and comments from data store');
  
  // Clean up uploads directory
  const uploadsDir = path.join(__dirname, 'uploads');
  if (fs.existsSync(uploadsDir)) {
    const files = fs.readdirSync(uploadsDir);
    let deletedCount = 0;
    
    for (const file of files) {
      const filePath = path.join(uploadsDir, file);
      // Skip directories, .gitkeep, and hidden files
      if (!fs.statSync(filePath).isDirectory() && file !== '.gitkeep' && !file.startsWith('.')) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    }
    
    console.log(`Deleted ${deletedCount} files from uploads directory`);
  }
  
  // Clean up thumbnails directory
  const thumbnailsDir = path.join(__dirname, 'thumbnails');
  if (fs.existsSync(thumbnailsDir)) {
    const files = fs.readdirSync(thumbnailsDir);
    let deletedCount = 0;
    
    for (const file of files) {
      const filePath = path.join(thumbnailsDir, file);
      // Skip directories, default thumbnails, and hidden files
      if (!fs.statSync(filePath).isDirectory() && !file.startsWith('default-') && !file.startsWith('.')) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    }
    
    console.log(`Deleted ${deletedCount} files from thumbnails directory`);
  }
  
  console.log('Clean-up complete. You can now restart the server and upload fresh videos.');
} catch (error) {
  console.error('Error during clean-up:', error);
}
