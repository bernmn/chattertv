import React from "react";
import { Button } from "@/components/ui/button";
import { useModal } from "@/contexts/modal-context";
import { Upload } from "lucide-react";

const UploadCTA: React.FC = () => {
  const { uploadModal } = useModal();

  return (
    <section className="my-16 px-4 md:px-8">
      <div className="relative bg-gradient-to-r from-[#6A5ACD] to-[#00B9FF] rounded-xl overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute inset-0 bg-black opacity-40"></div>
          <img 
            src="https://images.unsplash.com/photo-1536240478700-b869070f9279?ixlib=rb-1.2.1&auto=format&fit=crop&w=2000&q=80" 
            alt="Background" 
            className="w-full h-full object-cover"
          />
        </div>
        <div className="relative z-10 py-12 px-6 md:px-12 flex flex-col md:flex-row items-center justify-between">
          <div className="mb-6 md:mb-0 md:mr-8">
            <h2 className="text-2xl md:text-3xl font-bold mb-3">Share Your Story With The World</h2>
            <p className="text-gray-200 max-w-lg">
              Upload your videos to ChatterTV and join our community of creators. 
              Get discovered, gain followers, and participate in contests to win prizes.
            </p>
          </div>
          <div className="flex space-x-2">
            <Button 
              variant="secondary"
              className="bg-white text-[#6A5ACD] hover:bg-gray-100 py-3 px-8 rounded-full font-semibold text-lg"
              onClick={uploadModal.openModal}
            >
              <Upload className="h-5 w-5 mr-2" /> Upload Video
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default UploadCTA;
