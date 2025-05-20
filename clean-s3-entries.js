// Script to remove S3 video entries and create fresh data store
import fs from 'fs';

// Check if the data store exists
if (!fs.existsSync('data-store.json')) {
  console.error('data-store.json not found');
  process.exit(1);
}

// Read the current data store
const data = JSON.parse(fs.readFileSync('data-store.json', 'utf8'));

// Create a backup before making changes
fs.writeFileSync(`data-store.backup-${Date.now()}.json`, JSON.stringify(data, null, 2));
console.log('Created backup of current data store');

// Keep only users, remove all videos
const cleanData = {
  videos: [],
  users: data.users || [],
  comments: []
};

// Write the clean data back
fs.writeFileSync('data-store.json', JSON.stringify(cleanData, null, 2));
console.log('Removed all videos from data store');
console.log('Please restart the server to apply changes');
