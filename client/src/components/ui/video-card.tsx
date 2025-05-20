import React from "react";
import { Video } from "@shared/schema";
import { useModal } from "@/contexts/modal-context";
import { Button } from "./button";
import { Download, Play, Share2, Trash2 } from "lucide-react";
import { formatTimeAgo, formatViewCount, formatDuration, getAssetPath } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface VideoCardProps {
  video: Video;
  isFeatured?: boolean;
  isContest?: boolean;
  isAI?: boolean;
}

export const VideoCard: React.FC<VideoCardProps> = ({ 
  video, 
  isFeatured = false,
  isContest = false,
  isAI = false
}) => {
  const { videoPlayerModal, shareModal, deleteConfirmModal } = useModal();

  // Handle play with custom videoUrl
  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log(`Opening video player for video ${video.id}, using URL: ${videoUrl}`);
    videoPlayerModal.openModal(video.id);
  };

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    shareModal.openModal(video.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteConfirmModal.openModal(video.id);
  };

  const { toast } = useToast();
  
  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      toast({
        title: "Preparing Download",
        description: "Generating secure download link...",
      });
      
      // Get a presigned URL from our download endpoint
      const response = await fetch(`/api/videos/${video.id}/download`);
      
      if (!response.ok) {
        throw new Error(`Failed to get download URL: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Create a new window to open the video first (this ensures proper MIME type handling)
      const videoWindow = window.open(data.url, '_blank');
      
      if (!videoWindow) {
        // If popup is blocked, create a direct download link as fallback
        toast({
          title: "Popup Blocked",
          description: "Please allow popups to view the video or use the download button below.",
          variant: "destructive"
        });
        
        // Create a direct download link
        const downloadLink = document.createElement('a');
        downloadLink.href = data.url;
        downloadLink.download = data.filename || `${video.title || 'video'}.mp4`;
        downloadLink.target = '_blank';
        downloadLink.textContent = 'Download Video';
        downloadLink.style.display = 'block';
        downloadLink.style.margin = '10px auto';
        downloadLink.style.textAlign = 'center';
        downloadLink.style.padding = '10px';
        downloadLink.style.backgroundColor = '#6A5ACD';
        downloadLink.style.color = 'white';
        downloadLink.style.borderRadius = '5px';
        downloadLink.style.textDecoration = 'none';
        
        // Create a modal/popup element
        const modal = document.createElement('div');
        modal.style.position = 'fixed';
        modal.style.top = '50%';
        modal.style.left = '50%';
        modal.style.transform = 'translate(-50%, -50%)';
        modal.style.backgroundColor = '#1f1f1f';
        modal.style.padding = '20px';
        modal.style.borderRadius = '10px';
        modal.style.zIndex = '1000';
        modal.style.boxShadow = '0 0 20px rgba(0,0,0,0.5)';
        
        // Add message and link
        const message = document.createElement('p');
        message.textContent = 'Click the button below to download your video:';
        message.style.color = 'white';
        message.style.marginBottom = '15px';
        
        const closeButton = document.createElement('button');
        closeButton.textContent = 'Close';
        closeButton.style.display = 'block';
        closeButton.style.margin = '10px auto 0';
        closeButton.style.padding = '8px 15px';
        closeButton.style.backgroundColor = '#444';
        closeButton.style.color = 'white';
        closeButton.style.border = 'none';
        closeButton.style.borderRadius = '5px';
        closeButton.style.cursor = 'pointer';
        closeButton.onclick = () => document.body.removeChild(modal);
        
        modal.appendChild(message);
        modal.appendChild(downloadLink);
        modal.appendChild(closeButton);
        document.body.appendChild(modal);
        
        return;
      }
      
      toast({
        title: "Video Ready",
        description: `${video.title} is ready to view or download from the new tab.`,
        variant: "default"
      });
      
    } catch (error) {
      console.error('Error downloading video:', error);
      toast({
        title: "Download Failed",
        description: error instanceof Error ? error.message : "Failed to download video",
        variant: "destructive"
      });
    }
  };

  // Use our utility function to handle thumbnail paths consistently 
  const thumbnailUrl = getAssetPath(video.thumbnailPath, 'thumbnail', video.title);
  
  // Video path should also be processed consistently
  const videoUrl = React.useMemo(() => {
    return getAssetPath(video.filePath, 'video', video.title);
  }, [video.filePath, video.title]);
  
  // Debug information to help troubleshoot path issues
  React.useEffect(() => {
    console.log('Thumbnail path for video', video.id, ':', video.thumbnailPath);
    console.log('Processed thumbnail URL:', thumbnailUrl);
    console.log('Video path:', video.filePath);
    console.log('Processed video URL:', videoUrl);
  }, [video.id, video.thumbnailPath, thumbnailUrl, video.filePath, videoUrl]);

  return (
    <div className="video-card flex-shrink-0 w-64 md:w-80 relative cursor-pointer group">
      <div className="relative rounded-lg overflow-hidden aspect-video" onClick={handlePlay}>
        <img 
          src={thumbnailUrl} 
          alt={`${video.title} thumbnail`} 
          className="video-thumbnail w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="video-overlay absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Button 
            className="bg-[#6A5ACD] rounded-full w-12 h-12 flex items-center justify-center" 
            size="icon"
            onClick={handlePlay}
          >
            <Play className="h-5 w-5 text-white" />
          </Button>
        </div>
        <span className="absolute bottom-2 right-2 bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded">
          {formatDuration(video.duration || 0)}
        </span>
        
        {isFeatured && (
          <span className="absolute top-2 left-2 bg-[#6A5ACD] text-white text-xs px-2 py-1 rounded-sm">
            FEATURED
          </span>
        )}
        
        {isContest && (
          <span className="absolute top-2 left-2 bg-[#00B9FF] text-white text-xs px-2 py-1 rounded-sm">
            CONTEST
          </span>
        )}
        
        {(isAI || video.isAI) && (
          <span className="absolute top-2 left-2 bg-[#6A40BF] text-white text-xs px-2 py-1 rounded-sm">
            A.I.
          </span>
        )}
      </div>
      <div className="mt-2">
        <div className="flex justify-between">
          <h3 className="text-white font-medium truncate">{video.title}</h3>
          <div className="flex space-x-1">
            {(isAI || video.isAI) && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6 text-gray-400 hover:text-[#6A40BF]" 
                onClick={handleDownload}
                title="Download"
              >
                <Download className="h-4 w-4" />
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6 text-gray-400 hover:text-white" 
              onClick={handleShare}
              title="Share"
            >
              <Share2 className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6 text-gray-400 hover:text-[#F44336]" 
              onClick={handleDelete}
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center mt-1">
          <span className="text-gray-400 text-xs">
            {formatViewCount(video.views || 0)} views • {formatTimeAgo(video.createdAt)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default VideoCard;
