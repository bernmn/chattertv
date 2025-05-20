# AWS S3 Integration for ChatterTV

This document explains how ChatterTV integrates with AWS S3 for cloud storage of videos and thumbnails.

## Overview

ChatterTV uses a dual storage approach:
1. **Primary Storage**: AWS S3 cloud storage
2. **Fallback Storage**: Local filesystem

This approach provides redundancy and ensures the application continues to function even when S3 is unavailable.

## Key Features

- **Transparent File Access**: The application automatically decides whether to fetch files from S3 or local storage.
- **Presigned URLs**: S3 access is secured using presigned URLs that expire after a set period.
- **Redundant Storage**: Files are stored both in S3 and locally to ensure maximum reliability.
- **Graceful Degradation**: If S3 is unavailable, the system automatically falls back to local storage.

## Components

### server/s3.ts

This file contains all S3-related utilities:

- **Connection Management**: Initializes the S3 client using credentials from environment variables
- **Upload Functions**: Handles uploading files to S3 with proper content types
- **Download Functions**: Generates presigned URLs for secure, time-limited access
- **Delete Functions**: Removes files from S3 when videos are deleted
- **Utility Functions**: Helper methods for path normalization, URL generation, and error handling

### Storage Flow

1. **Uploads**:
   - File is uploaded to local storage first
   - If S3 is available, file is also uploaded to S3
   - Database record stores either the S3 URL (if upload succeeded) or local path

2. **Downloads/Streaming**:
   - System first checks if file exists in S3
   - If available in S3, generates a presigned URL and redirects
   - If not in S3, falls back to serving from local storage

3. **Thumbnails**:
   - Generated locally from video frames
   - Uploaded to S3 when possible
   - Served via presigned URL or locally as needed

## Environment Variables

The following environment variables are required for S3 integration:

- `AWS_ACCESS_KEY_ID`: Your AWS access key
- `AWS_SECRET_ACCESS_KEY`: Your AWS secret key
- `AWS_S3_BUCKET`: Name of your S3 bucket
- `AWS_REGION`: AWS region where your bucket is located

## Disabling S3

If you need to disable S3 and use only local storage:

1. Set the environment variable `USE_S3=false`
2. The application will automatically handle reverting to local-only storage

## Testing

When testing the S3 integration:

1. Ensure all required environment variables are set
2. Upload a new video to test the upload process
3. Stream the video to verify presigned URL generation
4. Delete the video to confirm proper cleanup in both S3 and local storage

## Troubleshooting

If you encounter issues with S3 integration:

1. Check the application logs for specific S3 error messages
2. Verify your AWS credentials and permissions
3. Confirm the S3 bucket exists and is accessible
4. Ensure your network allows connections to AWS services

The application is designed to fall back to local storage if any S3 operation fails, so service disruption should be minimal.