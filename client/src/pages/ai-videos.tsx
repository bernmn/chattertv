import React from "react";
import { useQuery } from "@tanstack/react-query";
import Navbar from "@/components/navbar";
import VideoCategory from "@/components/video-category";
import { useModal } from "@/contexts/modal-context";
import { Button } from "@/components/ui/button";
import { Video } from "@shared/schema";

export default function AIVideos() {
  const { uploadModal } = useModal();
  
  // Fetch AI videos
  const { data: aiVideos = [], isLoading: isLoadingAIVideos } = useQuery<Video[]>({
    queryKey: ['/api/videos/ai'],
    staleTime: 1000 * 60, // 1 minute
  });

  const handleUploadClick = () => {
    uploadModal.openModal();
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-24 pb-16">
        {/* AI Videos Page Header */}
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-indigo-500 to-pink-500 text-transparent bg-clip-text">AI-Generated Videos</h1>
          <p className="text-gray-300 max-w-3xl mx-auto mb-6">
            Explore our collection of AI-generated videos that showcase the cutting edge of 
            artificial intelligence in content creation. These videos can be freely downloaded and used.
          </p>
          <Button
            onClick={handleUploadClick}
            className="bg-gradient-to-r from-indigo-500 to-pink-500 hover:from-indigo-600 hover:to-pink-600 text-white px-6 py-5 text-lg font-medium rounded-md"
          >
            Upload Your AI Video
          </Button>
        </div>

        {/* AI Videos Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {isLoadingAIVideos ? (
            // Loading skeletons
            Array(9).fill(0).map((_, index) => (
              <div key={index} className="aspect-video rounded-lg bg-zinc-800 animate-pulse"></div>
            ))
          ) : (
            aiVideos.map(video => (
              <div key={video.id} className="col-span-1">
                <VideoCategory
                  title=""
                  videos={[video]}
                  isAI={true}
                />
              </div>
            ))
          )}
        </div>

        {/* AI Video Info Section */}
        <div className="bg-zinc-900 rounded-xl p-8 mb-12">
          <h2 className="text-2xl font-bold mb-4">About AI-Generated Videos</h2>
          <p className="text-gray-300 mb-4">
            AI-generated videos are created using machine learning algorithms and artificial intelligence technology.
            These videos demonstrate the capabilities of AI in generating realistic and creative content.
          </p>
          <h3 className="text-xl font-bold mb-2">Usage Guidelines</h3>
          <ul className="list-disc pl-5 space-y-2 text-gray-300">
            <li>All AI videos can be downloaded and used for personal or educational purposes</li>
            <li>When sharing or reusing, please credit Chronicle as the source</li>
            <li>If you upload an AI-generated video, make sure to mark it as AI during the upload process</li>
          </ul>
        </div>
      </main>
    </div>
  );
}