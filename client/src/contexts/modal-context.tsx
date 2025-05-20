import React, { createContext, useState, useContext, ReactNode } from "react";
import { Video } from "@shared/schema";

interface ModalContextType {
  videoPlayerModal: {
    isOpen: boolean;
    videoId: number | null;
    openModal: (videoId: number) => void;
    closeModal: () => void;
  };
  uploadModal: {
    isOpen: boolean;
    openModal: () => void;
    closeModal: () => void;
  };
  shareModal: {
    isOpen: boolean;
    videoId: number | null;
    openModal: (videoId: number) => void;
    closeModal: () => void;
  };
  deleteConfirmModal: {
    isOpen: boolean;
    videoId: number | null;
    openModal: (videoId: number) => void;
    closeModal: () => void;
  };
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const ModalProvider = ({ children }: { children: ReactNode }) => {
  // Video Player Modal
  const [isVideoPlayerOpen, setIsVideoPlayerOpen] = useState<boolean>(false);
  const [videoPlayerId, setVideoPlayerId] = useState<number | null>(null);

  // Upload Modal
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);

  // Share Modal
  const [isShareOpen, setIsShareOpen] = useState<boolean>(false);
  const [shareVideoId, setShareVideoId] = useState<number | null>(null);

  // Delete Confirm Modal
  const [isDeleteOpen, setIsDeleteOpen] = useState<boolean>(false);
  const [deleteVideoId, setDeleteVideoId] = useState<number | null>(null);

  const value = {
    videoPlayerModal: {
      isOpen: isVideoPlayerOpen,
      videoId: videoPlayerId,
      openModal: (videoId: number) => {
        setVideoPlayerId(videoId);
        setIsVideoPlayerOpen(true);
      },
      closeModal: () => {
        setIsVideoPlayerOpen(false);
        setVideoPlayerId(null);
      }
    },
    uploadModal: {
      isOpen: isUploadOpen,
      openModal: () => setIsUploadOpen(true),
      closeModal: () => setIsUploadOpen(false)
    },
    shareModal: {
      isOpen: isShareOpen,
      videoId: shareVideoId,
      openModal: (videoId: number) => {
        setShareVideoId(videoId);
        setIsShareOpen(true);
      },
      closeModal: () => {
        setIsShareOpen(false);
        setShareVideoId(null);
      }
    },
    deleteConfirmModal: {
      isOpen: isDeleteOpen,
      videoId: deleteVideoId,
      openModal: (videoId: number) => {
        setDeleteVideoId(videoId);
        setIsDeleteOpen(true);
      },
      closeModal: () => {
        setIsDeleteOpen(false);
        setDeleteVideoId(null);
      }
    }
  };

  return (
    <ModalContext.Provider value={value}>
      {children}
    </ModalContext.Provider>
  );
};

export const useModal = () => {
  const context = useContext(ModalContext);
  if (context === undefined) {
    throw new Error("useModal must be used within a ModalProvider");
  }
  return context;
};
