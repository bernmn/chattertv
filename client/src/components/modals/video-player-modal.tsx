import React, { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useModal } from "@/contexts/modal-context";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { VideoPlayer } from "@/components/ui/video-player";
import { Video, Comment, InsertComment } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { formatTimeAgo, getAssetPath } from "@/lib/utils";
import { X, ThumbsUp, ThumbsDown, Share2, Trash2, Home, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

export const VideoPlayerModal: React.FC = () => {
  const { videoPlayerModal, shareModal, deleteConfirmModal } = useModal();
  const [commentText, setCommentText] = useState("");
  const { toast } = useToast();

  // Reset comment text when modal closes
  useEffect(() => {
    if (!videoPlayerModal.isOpen) {
      setCommentText("");
    }
  }, [videoPlayerModal.isOpen]);

  // Fetch video details
  const { data: video, isLoading: isLoadingVideo } = useQuery<Video>({
    queryKey: [`/api/videos/${videoPlayerModal.videoId}`],
    enabled: videoPlayerModal.isOpen && !!videoPlayerModal.videoId,
  });

  // Fetch video comments
  const { data: comments = [], isLoading: isLoadingComments } = useQuery<Comment[]>({
    queryKey: [`/api/videos/${videoPlayerModal.videoId}/comments`],
    enabled: videoPlayerModal.isOpen && !!videoPlayerModal.videoId,
  });

  // Add comment mutation
  const addCommentMutation = useMutation({
    mutationFn: async (commentData: InsertComment) => {
      const response = await apiRequest(
        "POST", 
        `/api/videos/${videoPlayerModal.videoId}/comments`,
        commentData
      );
      return response.json();
    },
    onSuccess: () => {
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: [`/api/videos/${videoPlayerModal.videoId}/comments`] });
      toast({
        title: "Comment added",
        description: "Your comment was added successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to add comment: ${error}`,
        variant: "destructive",
      });
    }
  });

  const handleAddComment = () => {
    if (!commentText.trim() || !videoPlayerModal.videoId) return;
    
    addCommentMutation.mutate({
      content: commentText,
      videoId: videoPlayerModal.videoId,
      userId: 1 // Would use authenticated user ID in production
    });
  };

  const handleShare = () => {
    if (video) {
      videoPlayerModal.closeModal();
      shareModal.openModal(video.id);
    }
  };

  const handleDelete = () => {
    if (video) {
      videoPlayerModal.closeModal();
      deleteConfirmModal.openModal(video.id);
    }
  };

  // Use our utility function to get properly formatted paths for both S3 and local content
  const videoUrl = React.useMemo(() => {
    return video ? getAssetPath(video.filePath, 'video', video.title) : '';
  }, [video]);
  
  const thumbnailUrl = React.useMemo(() => {
    return video ? getAssetPath(video.thumbnailPath, 'thumbnail', video.title) : '';
  }, [video]);
  
  // Debug information to help troubleshoot playback issues
  React.useEffect(() => {
    if (video) {
      console.log('Playing video:', video.id);
      console.log('Original video path:', video.filePath);
      console.log('Processed videoUrl:', videoUrl);
      console.log('Original thumbnail path:', video.thumbnailPath);
      console.log('Processed thumbnailUrl:', thumbnailUrl);
    }
  }, [video, videoUrl, thumbnailUrl]);

  return (
    <Dialog open={videoPlayerModal.isOpen} onOpenChange={(isOpen) => {
      if (!isOpen) videoPlayerModal.closeModal();
    }}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden bg-[#141414] text-white h-auto max-h-[90vh]">
        <DialogTitle className="sr-only">Video Player</DialogTitle>
        {/* Video Player Section */}
        {!isLoadingVideo && video ? (
          <div className="relative flex justify-center">
            <VideoPlayer 
              src={videoUrl}
              poster={thumbnailUrl}
              autoPlay={true}
              showHomeButton={true}
            />
            
            {/* Close Button */}
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 text-white bg-black bg-opacity-50 rounded-full w-8 h-8 z-10 hover:bg-opacity-70"
              onClick={videoPlayerModal.closeModal}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="aspect-video bg-gray-900 flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#6A5ACD]"></div>
          </div>
        )}
        
        {/* Video Info Section */}
        {!isLoadingVideo && video ? (
          <div className="p-4">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold">{video.title}</h2>
                <div className="flex items-center mt-1 space-x-4">
                  <span className="text-gray-400 text-sm">{video.views} views</span>
                  <span className="text-gray-400 text-sm">{formatTimeAgo(video.createdAt)}</span>
                </div>
              </div>
              <div className="flex space-x-4">
                <Button 
                  variant="ghost" 
                  className="flex flex-col items-center text-gray-400 hover:text-white"
                >
                  <ThumbsUp className="h-5 w-5" />
                  <span className="text-xs mt-1">24K</span>
                </Button>
                <Button 
                  variant="ghost" 
                  className="flex flex-col items-center text-gray-400 hover:text-white"
                >
                  <ThumbsDown className="h-5 w-5" />
                  <span className="text-xs mt-1">380</span>
                </Button>
                <Button 
                  variant="ghost" 
                  className="flex flex-col items-center text-gray-400 hover:text-white"
                  onClick={handleShare}
                >
                  <Share2 className="h-5 w-5" />
                  <span className="text-xs mt-1">Share</span>
                </Button>
                <Button 
                  variant="ghost" 
                  className="flex flex-col items-center text-gray-400 hover:text-[#F44336]"
                  onClick={handleDelete}
                >
                  <Trash2 className="h-5 w-5" />
                  <span className="text-xs mt-1">Delete</span>
                </Button>
              </div>
            </div>
            
            {/* Creator Info */}
            <div className="flex items-center mt-4">
              <img 
                className="h-10 w-10 rounded-full" 
                src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80" 
                alt="Creator avatar"
              />
              <div className="ml-3">
                <h3 className="text-white font-medium">Demo User</h3>
                <span className="text-gray-400 text-sm">1.2M followers</span>
              </div>
              <Button
                className="ml-auto bg-[#6A5ACD] text-white hover:bg-opacity-90"
              >
                Follow
              </Button>
            </div>
            
            {/* Description */}
            <div className="mt-4 text-gray-300 text-sm">
              <p>{video.description || "No description provided."}</p>
              <Button variant="link" className="text-gray-400 hover:text-white mt-1 p-0">
                Show more
              </Button>
            </div>
            
            {/* Comments Section */}
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-4">
                Comments ({comments.length})
              </h3>
              
              {/* Comment Form */}
              <div className="flex mb-6">
                <img 
                  className="h-8 w-8 rounded-full" 
                  src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80" 
                  alt="User avatar"
                />
                <div className="ml-3 flex-1">
                  <Textarea
                    placeholder="Add a comment..."
                    className="w-full bg-[#333333] text-white px-3 py-2 rounded-lg text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#6A5ACD]"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                  />
                  <div className="flex justify-end mt-2">
                    <Button 
                      variant="default" 
                      size="sm" 
                      className="bg-[#6A5ACD] text-white"
                      onClick={handleAddComment}
                      disabled={addCommentMutation.isPending || !commentText.trim()}
                    >
                      {addCommentMutation.isPending ? "Posting..." : "Post"}
                    </Button>
                  </div>
                </div>
              </div>
              
              {/* Comment List */}
              <div className="space-y-4">
                {isLoadingComments ? (
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#6A5ACD]"></div>
                  </div>
                ) : comments.length > 0 ? (
                  comments.map((comment) => (
                    <div key={comment.id} className="flex">
                      <img 
                        className="h-8 w-8 rounded-full" 
                        src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80" 
                        alt="Commenter avatar"
                      />
                      <div className="ml-3">
                        <div className="flex items-center">
                          <h4 className="text-white font-medium text-sm">Demo User</h4>
                          <span className="text-gray-500 text-xs ml-2">{formatTimeAgo(comment.createdAt)}</span>
                        </div>
                        <p className="text-gray-300 text-sm mt-1">{comment.content}</p>
                        <div className="flex items-center mt-1 space-x-3">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-gray-500 text-xs hover:text-white flex items-center h-6 px-1"
                          >
                            <ThumbsUp className="h-3 w-3 mr-1" /> 0
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-gray-500 text-xs hover:text-white flex items-center h-6 px-1"
                          >
                            <ThumbsDown className="h-3 w-3 mr-1" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-gray-500 text-xs hover:text-white h-6 px-1"
                          >
                            Reply
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 text-gray-500">
                    No comments yet. Be the first to comment!
                  </div>
                )}
                
                {comments.length > 5 && (
                  <Button 
                    variant="link" 
                    className="text-[#6A5ACD] text-sm font-medium"
                  >
                    Load more comments
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4">
            <div className="animate-pulse">
              <div className="h-6 bg-gray-700 rounded w-3/4 mb-2"></div>
              <div className="h-4 bg-gray-700 rounded w-1/4 mb-6"></div>
              <div className="flex space-x-4 mb-6">
                <div className="rounded-full bg-gray-700 h-10 w-10"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-700 rounded w-1/3"></div>
                  <div className="h-3 bg-gray-700 rounded w-1/4"></div>
                </div>
              </div>
              <div className="h-4 bg-gray-700 rounded w-full mb-2"></div>
              <div className="h-4 bg-gray-700 rounded w-5/6"></div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
