import React from "react";
import { useQuery } from "@tanstack/react-query";
import Navbar from "@/components/navbar";
import VideoCategory from "@/components/video-category";
import { useModal } from "@/contexts/modal-context";
import { Button } from "@/components/ui/button";
import { Video } from "@shared/schema";

export default function Featured() {
  const { uploadModal } = useModal();
  
  // Fetch featured videos
  const { data: featuredVideos = [], isLoading: isLoadingFeaturedVideos } = useQuery<Video[]>({
    queryKey: ['/api/videos/featured'],
    staleTime: 1000 * 60, // 1 minute
  });

  const handleUploadClick = () => {
    uploadModal.openModal();
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-24 pb-16">
        {/* Featured Page Header */}
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-purple-500 to-blue-500 text-transparent bg-clip-text">Featured Videos</h1>
          <p className="text-gray-300 max-w-3xl mx-auto mb-6">
            Discover our curated selection of featured videos from top creators. 
            These videos were hand-picked by our team for their exceptional quality and creativity.
          </p>
          <Button
            onClick={handleUploadClick}
            className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white px-6 py-5 text-lg font-medium rounded-md"
          >
            Upload Your Video
          </Button>
        </div>

        {/* Featured Videos Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {isLoadingFeaturedVideos ? (
            // Loading skeletons
            Array(9).fill(0).map((_, index) => (
              <div key={index} className="aspect-video rounded-lg bg-zinc-800 animate-pulse"></div>
            ))
          ) : (
            featuredVideos.map(video => (
              <div key={video.id} className="col-span-1">
                <VideoCategory
                  title=""
                  videos={[video]}
                  isFeatured={true}
                />
              </div>
            ))
          )}
        </div>

        {/* How to get featured section */}
        <div className="bg-zinc-900 rounded-xl p-8 mb-12">
          <h2 className="text-2xl font-bold mb-4">How to get featured</h2>
          <ul className="list-disc pl-5 space-y-2 text-gray-300">
            <li>Create high-quality original content</li>
            <li>Build engagement with the community</li>
            <li>Use appropriate tags and descriptions</li>
            <li>Regularly upload new content</li>
            <li>Follow our community guidelines</li>
          </ul>
        </div>
      </main>
    </div>
  );
}