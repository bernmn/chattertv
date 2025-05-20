import React from "react";
import { Link } from "wouter";
import { Video } from "@shared/schema";
import VideoCard from "@/components/ui/video-card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Plus, Video as VideoIcon } from "lucide-react";
import { useModal } from "@/contexts/modal-context";

interface VideoCategoryProps {
  title: string;
  videos: Video[];
  isLoading?: boolean;
  isFeatured?: boolean;
  isContest?: boolean;
  isAI?: boolean;
  showViewAll?: boolean;
}

const VideoCategory: React.FC<VideoCategoryProps> = ({ 
  title, 
  videos, 
  isLoading = false,
  isFeatured = false,
  isContest = false,
  isAI = false,
  showViewAll = true
}) => {
  const { uploadModal } = useModal();
  
  // Open upload modal with pre-selected category option
  const handleUpload = () => {
    // Open the upload modal - the contest/AI checkbox will be handled in the modal itself
    uploadModal.openModal();
  };

  // Create skeleton placeholders for loading state
  const renderSkeletons = () => {
    return Array(5).fill(0).map((_, index) => (
      <div key={index} className="flex-shrink-0 w-64 md:w-80">
        <Skeleton className="aspect-video rounded-lg mb-2" />
        <Skeleton className="h-5 w-3/4 mb-1" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    ));
  };

  return (
    <section className="my-8 px-4 md:px-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl md:text-2xl font-semibold">{title}</h2>
        {showViewAll && (
          <Link 
            to={
              isContest ? "/contests" :
              isFeatured ? "/featured" :
              isAI ? "/ai-videos" :
              "/recent"
            } 
            className="text-sm text-gray-400 hover:text-white"
          >
            View All
          </Link>
        )}
      </div>
      
      <ScrollArea>
        <div className="flex gap-4 pb-4">
          {isLoading ? (
            renderSkeletons()
          ) : videos.length > 0 ? (
            videos.map(video => (
              <VideoCard 
                key={video.id} 
                video={video} 
                isFeatured={isFeatured} 
                isContest={isContest}
                isAI={isAI}
              />
            ))
          ) : (
            <div className="text-gray-400 py-8 text-center w-full">
              No videos available in this category
            </div>
          )}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </section>
  );
};

export default VideoCategory;
