import React, { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Navbar from "@/components/navbar";
import HeroSection from "@/components/hero-section";
import VideoCategory from "@/components/video-category";
import UploadCTA from "@/components/upload-cta";
import Footer from "@/components/footer";
import { Video } from "@shared/schema";

const Home: React.FC = () => {
  const queryClient = useQueryClient();
  
  // Refresh videos on initial page load and when returning to the page
  useEffect(() => {
    // Refresh all video data when the component mounts
    const refreshVideos = async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/videos/recent"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/videos/featured"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/videos/contest"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/videos/ai"] })
      ]);
    };
    
    refreshVideos();
    
    // Set up a refresh interval for real-time updates (every 15 seconds)
    const intervalId = setInterval(refreshVideos, 15000);
    
    return () => clearInterval(intervalId);
  }, [queryClient]);

  const { data: recentVideos, isLoading: loadingRecent } = useQuery<Video[]>({
    queryKey: ["/api/videos/recent"],
  });

  const { data: featuredVideos, isLoading: loadingFeatured } = useQuery<Video[]>({
    queryKey: ["/api/videos/featured"],
  });

  const { data: contestVideos, isLoading: loadingContest } = useQuery<Video[]>({
    queryKey: ["/api/videos/contest"],
  });

  const { data: aiVideos, isLoading: loadingAI } = useQuery<Video[]>({
    queryKey: ["/api/videos/ai"],
  });

  // Get the first featured video for the hero section, fallback to first recent video if no featured videos
  const heroVideo = (featuredVideos && featuredVideos.length > 0) 
    ? featuredVideos[0] 
    : (recentVideos && recentVideos.length > 0) 
      ? recentVideos[0] 
      : null;

  return (
    <div className="min-h-screen bg-[#141414] text-white">
      <Navbar />
      
      <main className="pt-24 pb-12">
        {heroVideo && <HeroSection video={heroVideo} />}
        
        <VideoCategory
          title="Recently Uploaded"
          videos={recentVideos || []}
          isLoading={loadingRecent}
          showViewAll={true}
        />
        
        <VideoCategory
          title="Featured Videos"
          videos={featuredVideos || []}
          isLoading={loadingFeatured}
          isFeatured={true}
          showViewAll={true}
        />
        
        <VideoCategory
          title="Contest Videos"
          videos={contestVideos || []}
          isLoading={loadingContest}
          isContest={true}
          showViewAll={true}
        />

        <VideoCategory
          title="A.I. Videos"
          videos={aiVideos || []}
          isLoading={loadingAI}
          isAI={true}
          showViewAll={true}
        />
        
        <UploadCTA />
      </main>
      
      <Footer />
    </div>
  );
};

export default Home;
