import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the data store file
const dataStorePath = path.join(process.cwd(), 'data-store.json');

console.log(`Attempting to clean all videos from: ${dataStorePath}`);

// Load the data
try {
  const data = JSON.parse(fs.readFileSync(dataStorePath, 'utf8'));
  
  console.log(`Current data: ${data.videos.length} videos, ${data.users.length} users`);
  
  // Save the number of videos before clearing
  const numVideos = data.videos.length;
  
  // Clear all videos
  data.videos = [];
  
  // Reset the nextVideoId
  data.nextVideoId = 1;
  
  // Save the updated data
  fs.writeFileSync(dataStorePath, JSON.stringify(data, null, 2));
  console.log(`Removed ${numVideos} videos. Data saved successfully.`);
  
  console.log('Next step: restart the application for changes to take effect');
} catch (error) {
  console.error('Error processing data store:', error);
}