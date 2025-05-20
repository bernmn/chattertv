import React from "react";
import { useModal } from "@/contexts/modal-context";
import { Button } from "@/components/ui/button";
import { Video } from "@shared/schema";
import { Play, Plus } from "lucide-react";
import { getAssetPath } from "@/lib/utils";

interface HeroSectionProps {
  video: Video;
}

const HeroSection: React.FC<HeroSectionProps> = ({ video }) => {
  const { videoPlayerModal } = useModal();

  // Use our utility function to get the properly formatted thumbnail path
  const thumbnailUrl = getAssetPath(video.thumbnailPath, 'thumbnail', video.title);

  return (
    <section className="relative w-full h-[500px] md:h-[600px] overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-t from-[#141414] to-transparent z-10"></div>
      <div className="absolute inset-0 bg-gradient-to-r from-[#141414] to-transparent z-10"></div>
      <img 
        src={thumbnailUrl} 
        alt={`${video.title} thumbnail`} 
        className="absolute inset-0 w-full h-full object-cover"
      />
      
      <div className="relative z-20 h-full flex flex-col justify-end p-6 md:p-16">
        <span className="text-sm font-bold text-[#E50914] uppercase tracking-wider mb-1">FEATURED</span>
        <h1 className="text-3xl md:text-5xl font-bold mb-2">{video.title}</h1>
        <p className="text-gray-300 text-base md:text-lg mb-4 max-w-lg">
          {video.description || "No description provided"}
        </p>
        <div className="flex gap-3 mb-6">
          <Button 
            className="bg-[#E50914] hover:bg-opacity-80 text-white py-2 px-6 rounded-md flex items-center"
            onClick={() => videoPlayerModal.openModal(video.id)}
          >
            <Play className="h-4 w-4 mr-2" /> Play
          </Button>
          <Button 
            variant="secondary"
            className="bg-[#333333] hover:bg-opacity-80 text-white py-2 px-6 rounded-md flex items-center"
          >
            <Plus className="h-4 w-4 mr-2" /> Add to List
          </Button>
        </div>
        <div className="flex items-center">
          <div className="flex -space-x-2">
            <img className="h-8 w-8 rounded-full ring-2 ring-[#141414]" src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2.25&w=256&h=256&q=80" alt="" />
            <img className="h-8 w-8 rounded-full ring-2 ring-[#141414]" src="https://images.unsplash.com/photo-1550525811-e5869dd03032?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2.25&w=256&h=256&q=80" alt="" />
            <img className="h-8 w-8 rounded-full ring-2 ring-[#141414]" src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2.25&w=256&h=256&q=80" alt="" />
          </div>
          <span className="ml-3 text-sm text-gray-300">{video.views || 0} people watching</span>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
