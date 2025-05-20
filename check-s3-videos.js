// Simple script to check the S3 bucket for video files
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

async function listS3Objects(prefix = 'uploads/') {
  // Create an S3 client using environment variables for credentials
  const s3Client = new S3Client({
    region: process.env.AWS_REGION,
  });

  // Setup the parameters for listing objects in the bucket
  const params = {
    Bucket: process.env.AWS_S3_BUCKET,
    Prefix: prefix,
    MaxKeys: 100,
  };

  try {
    console.log(`Checking S3 bucket: ${process.env.AWS_S3_BUCKET} in region: ${process.env.AWS_REGION}`);
    console.log(`Looking for objects with prefix: ${prefix}\n`);
    
    // List objects in the bucket
    const command = new ListObjectsV2Command(params);
    const data = await s3Client.send(command);
    
    if (data.Contents && data.Contents.length > 0) {
      console.log(`Found ${data.Contents.length} objects in S3:\n`);
      
      // Create a table of the objects
      console.log('Key\t\t\t\tSize\t\tLast Modified');
      console.log('-----------------------------------------------------------');
      
      // Sort by last modified date (newest first)
      const sortedContents = [...data.Contents].sort((a, b) => 
        b.LastModified.getTime() - a.LastModified.getTime()
      );
      
      sortedContents.forEach((item) => {
        const key = item.Key;
        const size = (item.Size / 1024 / 1024).toFixed(2) + ' MB';
        const lastModified = item.LastModified.toISOString();
        
        console.log(`${key.padEnd(30)}\t${size.padEnd(8)}\t${lastModified}`);
      });
      
      return sortedContents;
    } else {
      console.log(`No objects found in S3 with prefix: ${prefix}`);
      return [];
    }
  } catch (error) {
    console.error('Error checking S3 bucket:', error);
    throw error;
  }
}

// Also check thumbnails
async function main() {
  console.log('=== CHECKING VIDEOS IN S3 ===');
  await listS3Objects('uploads/');
  
  console.log('\n=== CHECKING THUMBNAILS IN S3 ===');
  await listS3Objects('thumbnails/');
}

main().catch(console.error);