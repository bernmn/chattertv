import React from "react";
import { useModal } from "@/contexts/modal-context";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle } from "lucide-react";

export const DeleteConfirmModal: React.FC = () => {
  const { deleteConfirmModal } = useModal();
  const { toast } = useToast();
  
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!deleteConfirmModal.videoId) return;
      
      const response = await fetch(`/api/videos/${deleteConfirmModal.videoId}`, {
        method: "DELETE",
        credentials: "include",
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || response.statusText);
      }
      
      return true;
    },
    onSuccess: () => {
      toast({
        title: "Video deleted",
        description: "The video has been deleted successfully.",
      });
      
      // Invalidate queries to refresh the video lists
      queryClient.invalidateQueries({ queryKey: ["/api/videos/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/videos/featured"] });
      queryClient.invalidateQueries({ queryKey: ["/api/videos/contest"] });
      
      deleteConfirmModal.closeModal();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to delete video: ${error instanceof Error ? error.message : "Unknown error"}`,
        variant: "destructive",
      });
    }
  });

  const handleCancel = () => {
    deleteConfirmModal.closeModal();
  };

  const handleDelete = () => {
    deleteMutation.mutate();
  };

  return (
    <Dialog open={deleteConfirmModal.isOpen} onOpenChange={(isOpen) => {
      if (!isOpen) deleteConfirmModal.closeModal();
    }}>
      <DialogContent className="bg-[#141414] text-white max-w-md p-6">
        <div className="flex flex-col items-center justify-center text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-[#F44336] bg-opacity-20 flex items-center justify-center mb-4">
            <AlertTriangle className="h-8 w-8 text-[#F44336]" />
          </div>
          <h2 className="text-xl font-bold mb-2">Delete Video?</h2>
          <p className="text-gray-400">Are you sure you want to delete this video? This action cannot be undone.</p>
        </div>
        
        <div className="flex justify-center space-x-4">
          <Button 
            variant="secondary"
            className="bg-gray-700 text-white hover:bg-gray-600"
            onClick={handleCancel}
            disabled={deleteMutation.isPending}
          >
            Cancel
          </Button>
          <Button 
            variant="destructive"
            className="bg-[#F44336] text-white hover:bg-opacity-90"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? (
              <>
                <div className="animate-spin h-4 w-4 mr-2 border-t-2 border-b-2 border-white rounded-full"></div>
                Deleting...
              </>
            ) : (
              "Delete"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
