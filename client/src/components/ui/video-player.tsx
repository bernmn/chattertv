import React, { useState, useRef, useEffect } from "react";
import { Button } from "./button";
import { Play, Pause, Volume2, VolumeX, Maximize, SkipBack, SkipForward, Home, ArrowLeft } from "lucide-react";
import { formatDuration } from "@/lib/utils";
import { Link } from "wouter";
import { useModal } from "@/contexts/modal-context";
import { useToast } from "@/hooks/use-toast";

// Helper function to get proper MIME type based on file extension or URL path
const getMimeType = (src: string): string => {
  // For direct video file URLs, check the extension
  const extension = src.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'mp4':
      return 'video/mp4';
    case 'mov':
      return 'video/quicktime';
    case 'webm':
      return 'video/webm';
    case 'avi':
      return 'video/x-msvideo';
    default:
      return 'video/mp4';
  }
};

interface VideoPlayerProps {
  src: string;
  poster?: string;
  autoPlay?: boolean;
  showHomeButton?: boolean;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
  src, 
  poster,
  autoPlay = false,
  showHomeButton = false
}) => {
  const { videoPlayerModal } = useModal();
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(autoPlay);
  const [progress, setProgress] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isControlsVisible, setIsControlsVisible] = useState<boolean>(true);
  const [videoUrl, setVideoUrl] = useState<string>(src);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const controlsTimeout = useRef<NodeJS.Timeout | null>(null);
  
  // Simplified approach for our local file streaming endpoint
  useEffect(() => {
    // Reset state when src changes
    setIsLoading(true);
    setVideoUrl(src);

    // Show technical details in console for debugging
    console.log(`Video player received src: ${src}`);
    
    // For streaming endpoint, we can just use the URL directly
    // No need to fetch first, as our endpoint sends the video data directly
    setIsLoading(false);
  }, [src]);

  // State for tracking load errors
  const [loadError, setLoadError] = useState<boolean>(false);
  const [errorDetails, setErrorDetails] = useState<string>("");
  
  // Set up video event listeners with enhanced error handling
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Reset error state when src changes
    setLoadError(false);
    setErrorDetails("");

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      setProgress((video.currentTime / video.duration) * 100);
    };

    const onLoadedMetadata = () => {
      console.log("Video metadata loaded successfully");
      setDuration(video.duration);
      setLoadError(false);
    };

    const onEnded = () => {
      setIsPlaying(false);
    };
    
    const onError = (e: Event) => {
      console.error("Video error occurred:", video.error);
      setLoadError(true);
      
      // Extract detailed error information
      if (video.error) {
        let errorMessage = "Unknown video error";
        
        switch (video.error.code) {
          case 1:
            errorMessage = "Video loading aborted";
            break;
          case 2:
            errorMessage = "Network error occurred while loading video";
            break;
          case 3:
            errorMessage = "Video decoding failed. The file may be corrupted or in an unsupported format";
            break;
          case 4:
            errorMessage = "Video is not supported in this browser";
            break;
        }
        
        setErrorDetails(errorMessage);
        
        toast({
          title: "Video Playback Error",
          description: errorMessage,
          variant: "destructive"
        });
      }
    };
    
    const onLoadStart = () => {
      console.log("Video loading started");
    };
    
    const onCanPlay = () => {
      console.log("Video can now be played");
      setLoadError(false);
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('ended', onEnded);
    video.addEventListener('error', onError);
    video.addEventListener('loadstart', onLoadStart);
    video.addEventListener('canplay', onCanPlay);

    // Auto-play if specified
    if (autoPlay) {
      video.play().catch(error => {
        console.error("Auto-play was prevented:", error);
        setIsPlaying(false);
        
        // Only show toast for errors other than autoplay restrictions
        if (!error.message.includes("play() failed because the user")) {
          toast({
            title: "Autoplay Error",
            description: "Could not automatically play the video. Please click play.",
            variant: "destructive"
          });
        }
      });
    }

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('error', onError);
      video.removeEventListener('loadstart', onLoadStart);
      video.removeEventListener('canplay', onCanPlay);
    };
  }, [autoPlay, toast, videoUrl]);

  // Set up auto-hide controls
  useEffect(() => {
    const handleMouseMove = () => {
      setIsControlsVisible(true);
      
      if (controlsTimeout.current) {
        clearTimeout(controlsTimeout.current);
      }
      
      controlsTimeout.current = setTimeout(() => {
        if (isPlaying) {
          setIsControlsVisible(false);
        }
      }, 3000);
    };

    window.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (controlsTimeout.current) {
        clearTimeout(controlsTimeout.current);
      }
    };
  }, [isPlaying]);

  // Handle play/pause
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play().catch(error => {
        console.error("Play was prevented:", error);
      });
    }
    
    setIsPlaying(!isPlaying);
  };

  // Handle fullscreen
  const toggleFullscreen = () => {
    const video = videoRef.current;
    if (!video) return;

    if (!document.fullscreenElement) {
      video.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Handle mute/unmute
  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !video.muted;
    setIsMuted(!isMuted);
  };

  // Handle progress bar click
  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const progressBar = progressBarRef.current;
    const video = videoRef.current;
    
    if (!progressBar || !video) return;
    
    const rect = progressBar.getBoundingClientRect();
    const clickPosition = (e.clientX - rect.left) / rect.width;
    const newTime = clickPosition * video.duration;
    
    video.currentTime = newTime;
    setCurrentTime(newTime);
    setProgress(clickPosition * 100);
  };

  // Skip forward/backward
  const skipTime = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    
    const newTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
    video.currentTime = newTime;
  };

  // Function to retry loading the video
  const retryVideoLoad = () => {
    setLoadError(false);
    setErrorDetails("");
    
    // Re-initialize video element by temporarily clearing and resetting the src
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
      setTimeout(() => {
        setVideoUrl("");
        setTimeout(() => {
          console.log("Retrying video load with URL:", src);
          setVideoUrl(src);
        }, 100);
      }, 100);
    }
  };
  
  return (
    <div 
      className="relative w-full bg-black overflow-hidden flex items-center justify-center"
      style={{ minHeight: "300px" }}
      onMouseEnter={() => setIsControlsVisible(true)}
      onMouseLeave={() => isPlaying && setIsControlsVisible(false)}
    >
      {isLoading ? (
        // Loading spinner
        <div className="flex items-center justify-center w-full h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#6A5ACD]"></div>
        </div>
      ) : loadError ? (
        // Error state UI
        <div className="flex flex-col items-center justify-center w-full h-64 p-6 text-center">
          <div className="text-red-500 mb-4 text-xl">Video Playback Error</div>
          <div className="text-white mb-6">{errorDetails || "There was a problem loading the video."}</div>
          <div className="flex space-x-4">
            <Button 
              variant="outline" 
              className="text-white border-[#6A5ACD] hover:bg-[#6A5ACD] hover:text-white"
              onClick={retryVideoLoad}
            >
              Retry
            </Button>
            <Link href="/" onClick={() => videoPlayerModal.closeModal()}>
              <Button 
                variant="ghost" 
                className="text-white hover:bg-white/10"
              >
                Back to Home
              </Button>
            </Link>
          </div>
          <div className="mt-6 text-sm text-gray-400">
            Technical details: {src.substring(0, 50)}{src.length > 50 ? '...' : ''}
          </div>
        </div>
      ) : (
        // Regular video player
        <video
          ref={videoRef}
          className="w-full h-auto max-h-[calc(100vh-300px)] object-contain"
          poster={poster}
          preload="metadata"
          onClick={togglePlay}
          style={{ objectFit: 'contain', objectPosition: 'center center' }}
          controls={false}
        >
          <source src={videoUrl} type={getMimeType(videoUrl)} />
          Your browser does not support the video tag.
        </video>
      )}
      
      {/* Home Button */}
      {showHomeButton && !loadError && (
        <div className="absolute top-4 left-4 z-20">
          <Link href="/" onClick={() => videoPlayerModal.closeModal()}>
            <Button
              variant="outline"
              className="text-white bg-black bg-opacity-50 hover:bg-opacity-70 border-none flex items-center space-x-1"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Home
            </Button>
          </Link>
        </div>
      )}
      
      {/* Overlay play button when paused */}
      {!isPlaying && !isLoading && !loadError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Button 
            className="bg-[#6A5ACD] bg-opacity-80 hover:bg-opacity-100 rounded-full w-16 h-16 flex items-center justify-center transition duration-300"
            onClick={togglePlay}
          >
            <Play className="h-6 w-6 text-white" />
          </Button>
        </div>
      )}
      
      {/* Video Controls - only show when video is loaded and playing */}
      {!loadError && !isLoading && (
        <div 
          className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent px-4 py-3 transition-opacity duration-300 ${
            isControlsVisible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="flex items-center space-x-3">
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-white h-8 w-8" 
              onClick={togglePlay}
            >
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </Button>
            
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-white h-8 w-8" 
              onClick={() => skipTime(-10)}
            >
              <SkipBack className="h-5 w-5" />
            </Button>
            
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-white h-8 w-8" 
              onClick={() => skipTime(10)}
            >
              <SkipForward className="h-5 w-5" />
            </Button>
            
            <div 
              className="flex-1 relative h-1 bg-gray-600 rounded-full overflow-hidden cursor-pointer"
              ref={progressBarRef}
              onClick={handleProgressBarClick}
            >
              <div 
                className="absolute left-0 top-0 bottom-0 bg-[#6A5ACD]"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            
            <span className="text-white text-xs">
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </span>
            
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-white h-8 w-8" 
              onClick={toggleMute}
            >
              {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </Button>
            
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-white h-8 w-8" 
              onClick={toggleFullscreen}
            >
              <Maximize className="h-5 w-5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
