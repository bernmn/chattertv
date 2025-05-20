import React, { useState } from "react";
import { useModal } from "@/contexts/modal-context";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { Video } from "@shared/schema";
import { Copy, X, Facebook, Twitter, Mail, ExternalLink } from "lucide-react";
import { FaWhatsapp, FaPinterest } from "react-icons/fa";

export const ShareModal: React.FC = () => {
  const { shareModal } = useModal();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);

  // Fetch video details if needed
  const { data: video } = useQuery<Video>({
    queryKey: [`/api/videos/${shareModal.videoId}`],
    enabled: shareModal.isOpen && !!shareModal.videoId,
  });

  const handleClose = () => {
    shareModal.closeModal();
    setCopied(false);
    setEmbedCopied(false);
  };

  const copyToClipboard = (text: string, isEmbed: boolean = false) => {
    navigator.clipboard.writeText(text).then(() => {
      if (isEmbed) {
        setEmbedCopied(true);
        setTimeout(() => setEmbedCopied(false), 2000);
      } else {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
      
      toast({
        title: "Copied to clipboard",
        description: "Link has been copied to clipboard",
      });
    }).catch(() => {
      toast({
        title: "Copy failed",
        description: "Could not copy to clipboard",
        variant: "destructive",
      });
    });
  };

  // Generate share URL and embed code
  const shareUrl = `${window.location.origin}/videos/${shareModal.videoId}`;
  const embedCode = `<iframe width="560" height="315" src="${window.location.origin}/embed/${shareModal.videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;

  return (
    <Dialog open={shareModal.isOpen} onOpenChange={(isOpen) => {
      if (!isOpen) handleClose();
    }}>
      <DialogContent className="bg-[#141414] text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center justify-between">
            Share Video
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleClose}
              className="text-gray-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </Button>
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex space-x-4 mb-6">
          <Button 
            variant="outline" 
            className="flex flex-col items-center justify-center w-16 h-20 bg-transparent hover:bg-[#333333]"
            onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, '_blank')}
          >
            <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center mb-2">
              <Facebook className="h-5 w-5 text-white" />
            </div>
            <span className="text-xs text-gray-400">Facebook</span>
          </Button>
          
          <Button 
            variant="outline" 
            className="flex flex-col items-center justify-center w-16 h-20 bg-transparent hover:bg-[#333333]"
            onClick={() => window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(video?.title || 'Check out this video')}`, '_blank')}
          >
            <div className="w-12 h-12 rounded-full bg-blue-400 flex items-center justify-center mb-2">
              <Twitter className="h-5 w-5 text-white" />
            </div>
            <span className="text-xs text-gray-400">Twitter</span>
          </Button>
          
          <Button 
            variant="outline" 
            className="flex flex-col items-center justify-center w-16 h-20 bg-transparent hover:bg-[#333333]"
            onClick={() => window.open(`https://pinterest.com/pin/create/button/?url=${encodeURIComponent(shareUrl)}&description=${encodeURIComponent(video?.title || 'Check out this video')}`, '_blank')}
          >
            <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center mb-2">
              <FaPinterest className="h-5 w-5 text-white" />
            </div>
            <span className="text-xs text-gray-400">Pinterest</span>
          </Button>
          
          <Button 
            variant="outline" 
            className="flex flex-col items-center justify-center w-16 h-20 bg-transparent hover:bg-[#333333]"
            onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`${video?.title || 'Check out this video'}: ${shareUrl}`)}`, '_blank')}
          >
            <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center mb-2">
              <FaWhatsapp className="h-5 w-5 text-white" />
            </div>
            <span className="text-xs text-gray-400">WhatsApp</span>
          </Button>
          
          <Button 
            variant="outline" 
            className="flex flex-col items-center justify-center w-16 h-20 bg-transparent hover:bg-[#333333]"
            onClick={() => window.open(`mailto:?subject=${encodeURIComponent(video?.title || 'Check out this video')}&body=${encodeURIComponent(`I thought you might enjoy this video: ${shareUrl}`)}`, '_blank')}
          >
            <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center mb-2">
              <Mail className="h-5 w-5 text-white" />
            </div>
            <span className="text-xs text-gray-400">Email</span>
          </Button>
        </div>
        
        <div>
          <label className="block text-gray-400 text-sm mb-1">Video Link</label>
          <div className="flex">
            <Input 
              type="text" 
              value={shareUrl} 
              readOnly 
              className="flex-1 bg-[#333333] text-white rounded-r-none"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <Button 
              className={`bg-[#E50914] text-white rounded-l-none ${copied ? 'bg-green-500' : ''}`} 
              onClick={() => copyToClipboard(shareUrl)}
            >
              {copied ? <ExternalLink className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        
        <div className="mt-4">
          <label className="block text-gray-400 text-sm mb-1">Embed Code</label>
          <div className="flex">
            <Textarea 
              className="flex-1 bg-[#333333] text-white rounded-r-none text-xs h-20 resize-none" 
              readOnly 
              value={embedCode}
              onClick={(e) => (e.target as HTMLTextAreaElement).select()}
            />
            <Button 
              className={`bg-[#E50914] text-white self-stretch rounded-l-none ${embedCopied ? 'bg-green-500' : ''}`}
              onClick={() => copyToClipboard(embedCode, true)}
            >
              {embedCopied ? <ExternalLink className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
