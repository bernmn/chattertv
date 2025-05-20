import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number): string {
  if (!seconds) return "0:00";
  
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function formatTimeAgo(date: Date | string | null): string {
  if (!date) return 'Just now';
  
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - new Date(date).getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffTime / (1000 * 60));
  
  if (diffDays > 30) {
    const diffMonths = Math.floor(diffDays / 30);
    return `${diffMonths} ${diffMonths === 1 ? 'month' : 'months'} ago`;
  } else if (diffDays > 0) {
    return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  } else if (diffHours > 0) {
    return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`;
  } else {
    return 'just now';
  }
}

export function formatViewCount(count: number): string {
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1) + 'M';
  } else if (count >= 1000) {
    return (count / 1000).toFixed(1) + 'K';
  } else {
    return count.toString();
  }
}

// This is now just a stub to prevent component errors
// We no longer generate placeholder thumbnails - we use actual video frames
export function generatePlaceholderThumbnail(_title?: string): string {
  return '';
}

/**
 * Normalize path for different deployment environments
 * Returns a properly formatted path for videos or thumbnails
 * 
 * This function handles both file paths and URLs, ensuring assets are served correctly.
 */
export function getAssetPath(path: string, type: 'video' | 'thumbnail', title?: string): string {
  // Safety check for empty paths
  if (!path || path === 'null' || path === 'undefined') {
    // If we have a title and it's a thumbnail, return a base64 placeholder
    if (type === 'thumbnail' && title) {
      return generateFallbackThumbnail(title);
    }
    return '';
  }
  
  console.log(`Processing ${type} path: ${path}`);
  
  // For thumbnail files (with or without thumbnails/ prefix)
  if (type === 'thumbnail') {
    // Extract just the filename regardless of path format
    let filename = path;
    
    // Handle various path formats
    if (path.includes('/') || path.includes('\\')) {
      const parts = path.split(/[\/\\]/); // Split on both forward and back slashes
      filename = parts[parts.length - 1];
    }
    
    // Clean up any URL parameters
    filename = filename.split('?')[0];
    
    console.log(`Thumbnail path for video ${title || ''}: ${filename}`);
    
    // Use our thumbnail endpoint
    const result = `/thumbnails/api/${encodeURIComponent(filename)}`;
    console.log(`Processed thumbnail URL: ${result}`);
    return result;
  }
  
  // For video files
  if (type === 'video') {
    // Check if it's an S3 URL (keeps the full S3 URL intact)
    if (path.startsWith('https://') && path.includes('amazonaws.com')) {
      console.log(`Video path is S3 URL: ${path}`);
      
      // S3 URLs need full path processing - extract just the part after the last /
      const parts = path.split('/');
      const filename = parts[parts.length - 1].split('?')[0]; // Remove any query parameters
      
      // For S3 videos, we need to use the path that goes through our custom streaming handler
      const result = `/videos/${encodeURIComponent(filename)}`;
      console.log(`Processed S3 video URL: ${result}`);
      return result;
    }
    
    // For local video files in uploads/ directory
    if (path.startsWith('uploads/')) {
      const filename = path.replace('uploads/', '').split('?')[0];
      console.log(`Video path from uploads: ${filename}`);
      
      // Use our custom streaming handler
      const result = `/videos/${encodeURIComponent(filename)}`;
      console.log(`Processed video URL: ${result}`);
      return result;
    }
    
    // For any other video path format (direct filename, etc.)
    let filename = path;
    
    // Handle various path formats
    if (path.includes('/') || path.includes('\\')) {
      const parts = path.split(/[\/\\]/); // Split on both forward and back slashes
      filename = parts[parts.length - 1];
    }
    
    // Clean up any URL parameters
    filename = filename.split('?')[0];
    
    console.log(`Video path: ${filename}`);
    
    // Use our custom streaming handler
    const result = `/videos/${encodeURIComponent(filename)}`;
    console.log(`Processed video URL: ${result}`);
    return result;
  }
  
  // Fallback to original path
  return path;
}

/**
 * Generate a simple color-based thumbnail when a real one isn't available
 * Returns a base64-encoded SVG image
 */
function generateFallbackThumbnail(text: string): string {
  // Generate a deterministic color based on the text
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Convert to a pleasing pastel color
  const h = Math.abs(hash) % 360;
  const s = 70; // Saturation percentage
  const l = 60; // Lightness percentage
  
  // Create a simple SVG with the text's first character
  const firstChar = text.charAt(0).toUpperCase();
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200">
      <rect width="300" height="200" fill="hsl(${h}, ${s}%, ${l}%)" />
      <text x="150" y="110" font-family="Arial, sans-serif" font-size="72" font-weight="bold" 
        fill="white" text-anchor="middle" dominant-baseline="middle">${firstChar}</text>
      <text x="150" y="160" font-family="Arial, sans-serif" font-size="20" 
        fill="rgba(255,255,255,0.8)" text-anchor="middle">${text.substring(0, 15)}${text.length > 15 ? '...' : ''}</text>
    </svg>
  `;
  
  // Convert SVG to base64 data URL
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
