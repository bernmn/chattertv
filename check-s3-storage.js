// Script to check if files are stored in S3
import { S3Client, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { fileURLToPath } from 'url';
import * as path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('S3 Storage Verification - Starting');
console.log('AWS_REGION:', process.env.AWS_REGION);
console.log('AWS_S3_BUCKET:', process.env.AWS_S3_BUCKET);
console.log('AWS_ACCESS_KEY_ID exists:', !!process.env.AWS_ACCESS_KEY_ID);
console.log('AWS_SECRET_ACCESS_KEY exists:', !!process.env.AWS_SECRET_ACCESS_KEY);

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const bucket = process.env.AWS_S3_BUCKET;

// Function to list objects in a S3 prefix
async function listS3Objects(prefix) {
  try {
    console.log(`Listing objects in S3 with prefix: ${prefix}`);
    
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: 20 // Limit to keep response manageable
    });
    
    const response = await s3Client.send(command);
    
    if (response.Contents && response.Contents.length > 0) {
      console.log(`Found ${response.Contents.length} objects in S3 with prefix "${prefix}":`);
      
      response.Contents.forEach((item, index) => {
        const sizeInMB = (item.Size / (1024 * 1024)).toFixed(2);
        console.log(`${index + 1}. ${item.Key} (${sizeInMB} MB) - Last modified: ${item.LastModified}`);
      });
      
      if (response.IsTruncated) {
        console.log(`... and more (response truncated)`);
      }
      
      return true;
    } else {
      console.log(`No objects found in S3 with prefix "${prefix}"`);
      return false;
    }
  } catch (error) {
    console.error(`Error listing S3 objects with prefix "${prefix}":`, error);
    return false;
  }
}

// Main function
async function main() {
  try {
    console.log('\nVerifying AWS S3 Storage Configuration...');
    
    let thumbnailsFound = await listS3Objects('thumbnails/');
    let videosFound = await listS3Objects('videos/');
    
    console.log('\nSummary:');
    console.log('- Thumbnails in S3:', thumbnailsFound ? 'YES' : 'NO');
    console.log('- Videos in S3:', videosFound ? 'YES' : 'NO');
    
    if (thumbnailsFound && videosFound) {
      console.log('\n✅ CONFIRMATION: Both thumbnails and videos are successfully stored on AWS S3.');
    } else if (thumbnailsFound) {
      console.log('\n⚠️ PARTIAL: Thumbnails are stored on S3, but videos are not found.');
    } else if (videosFound) {
      console.log('\n⚠️ PARTIAL: Videos are stored on S3, but thumbnails are not found.');
    } else {
      console.log('\n❌ WARNING: Neither thumbnails nor videos are found in S3. Storage integration may not be working.');
    }
  } catch (error) {
    console.error('Error in main process:', error);
  }
}

// Run the main function
main();