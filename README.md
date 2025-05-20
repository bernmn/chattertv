# ChatterTV - Modern Video Sharing Platform

ChatterTV is a full-stack video sharing platform inspired by Netflix and TikTok. It enables users to upload, stream, and share videos with a modern interface and robust cloud storage capabilities.

![ChatterTV Platform](https://via.placeholder.com/800x400?text=ChatterTV+Platform)

## Features

### User Experience
- Browse videos organized in multiple categories (Recent, Featured, Contest, AI)
- Watch videos with smooth streaming capabilities
- Comment on videos to engage with content
- Share videos with others
- Download AI-generated videos
- Upload videos up to 500MB in size

### Technical Features
- Smart multi-tier upload system:
  - Small files (0-50MB): Standard server upload
  - Medium files (50-150MB): Server-assisted S3 direct upload
  - Large files (150MB+): True direct browser-to-S3 upload
- Automatic thumbnail generation
- Advanced streaming with range request support
- AWS S3 integration for reliable cloud storage
- Persistent video storage that survives server restarts
- Responsive design for mobile and desktop viewing

## Tech Stack

- **Frontend**: React with TypeScript, TailwindCSS, Shadcn UI components
- **Backend**: Express.js, Node.js
- **Storage**: AWS S3 for video files, PostgreSQL/Memory storage for metadata
- **Video Processing**: Server-side thumbnail generation
- **Streaming**: Custom video streaming with range request support
- **Data Validation**: Zod schema validation

## Prerequisites

- Node.js 18+ and npm
- An AWS account with S3 access
- (Optional) PostgreSQL database

## Environment Variables

The following environment variables need to be set:

```
# AWS Configuration
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=your_region
AWS_S3_BUCKET=your_bucket_name

# Database Configuration (if using Postgres)
DATABASE_URL=postgres://user:password@host:port/database

# File Size Limit (optional)
MAX_FILE_SIZE=524288000  # 500MB in bytes
```

## Installation and Setup

1. Clone the repository
   ```
   git clone https://github.com/yourusername/chattertv.git
   cd chattertv
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Set up environment variables
   - Create a `.env` file in the root directory
   - Add the required environment variables

4. Start the development server
   ```
   npm run dev
   ```

5. Build for production
   ```
   npm run build
   ```

6. Start the production server
   ```
   npm start
   ```

## Deployment

ChatterTV can be deployed to various platforms:

### Vercel, Netlify, or Similar Platforms
1. Set up the required environment variables in the platform settings
2. Configure build settings to use `npm run build`
3. Deploy the application

### Self-Hosting
1. Build the application with `npm run build`
2. Transfer the `dist` directory to your server
3. Set up environment variables
4. Start the server with `node dist/index.js`
5. (Recommended) Use PM2 or a similar process manager

## S3 Storage Configuration

For optimal performance and reliability:
- Create an S3 bucket with appropriate permissions
- Enable CORS for the bucket to allow direct browser uploads
- Set up proper lifecycle rules for cost management

## Maintenance

The system includes utilities for maintenance tasks:
- Video synchronization to ensure consistency
- Cleanup tools for removing unwanted videos
- S3 integration status checks

## License

[MIT License](LICENSE)

## Acknowledgments

This project uses various open-source libraries and tools. Thanks to all the maintainers and contributors!