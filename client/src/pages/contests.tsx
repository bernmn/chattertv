import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Navbar from "@/components/navbar";
import VideoCategory from "@/components/video-category";
import { useModal } from "@/contexts/modal-context";
import { Button } from "@/components/ui/button";
import { Video } from "@shared/schema";

export default function Contests() {
  const { uploadModal } = useModal();
  
  // Fetch contest videos
  const { data: contestVideos = [], isLoading: isLoadingContestVideos } = useQuery<Video[]>({
    queryKey: ['/api/videos/contest'],
    staleTime: 1000 * 60, // 1 minute
  });

  const handleUploadClick = () => {
    uploadModal.openModal();
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-24 pb-16">
        {/* Contest Page Header */}
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-[#E50914] to-[#FF9A00] text-transparent bg-clip-text">Creator Contest</h1>
          <p className="text-gray-300 max-w-3xl mx-auto mb-6">
            Submit your best videos to our contest for a chance to be featured on the homepage and win prizes. 
            All contest entries are judged by our community.
          </p>
          <Button
            onClick={handleUploadClick}
            className="bg-[#E50914] hover:bg-opacity-80 text-white px-6 py-5 text-lg font-medium rounded-md"
          >
            Submit Your Entry
          </Button>
        </div>

        {/* Contest Videos Section */}
        <div className="mb-16">
          <VideoCategory
            title="Current Contest Entries"
            videos={contestVideos}
            isLoading={isLoadingContestVideos}
            isContest={true}
          />
        </div>

        {/* Contest Rules */}
        <div className="bg-zinc-900 rounded-xl p-8 mb-12">
          <h2 className="text-2xl font-bold mb-4">Contest Rules</h2>
          <ul className="list-disc pl-5 space-y-2 text-gray-300">
            <li>Videos must be original content created by you</li>
            <li>Maximum video length is 10 minutes</li>
            <li>Content must be appropriate for all audiences</li>
            <li>Multiple entries are allowed, but only one can win</li>
            <li>Winners will be announced at the end of each month</li>
          </ul>
        </div>
      </main>
    </div>
  );
}