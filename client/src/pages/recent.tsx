import React from "react";
import { useQuery } from "@tanstack/react-query";
import Navbar from "@/components/navbar";
import VideoCategory from "@/components/video-category";
import { useModal } from "@/contexts/modal-context";
import { Button } from "@/components/ui/button";
import { Video } from "@shared/schema";

export default function Recent() {
  const { uploadModal } = useModal();
  
  // Fetch recent videos
  const { data: recentVideos = [], isLoading: isLoadingRecentVideos } = useQuery<Video[]>({
    queryKey: ['/api/videos/recent'],
    staleTime: 1000 * 60, // 1 minute
  });

  const handleUploadClick = () => {
    uploadModal.openModal();
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-24 pb-16">
        {/* Recent Videos Page Header */}
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-green-400 to-cyan-500 text-transparent bg-clip-text">Recently Uploaded</h1>
          <p className="text-gray-300 max-w-3xl mx-auto mb-6">
            Discover the latest content from creators around the world.
            Our recent uploads showcase fresh and trending videos just added to ChatterTV.
          </p>
          <Button
            onClick={handleUploadClick}
            className="bg-gradient-to-r from-green-400 to-cyan-500 hover:from-green-500 hover:to-cyan-600 text-white px-6 py-5 text-lg font-medium rounded-md"
          >
            Upload Your Video
          </Button>
        </div>

        {/* Recent Videos Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {isLoadingRecentVideos ? (
            // Loading skeletons
            Array(9).fill(0).map((_, index) => (
              <div key={index} className="aspect-video rounded-lg bg-zinc-800 animate-pulse"></div>
            ))
          ) : (
            recentVideos.map(video => (
              <div key={video.id} className="col-span-1">
                <VideoCategory
                  title=""
                  videos={[video]}
                />
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}