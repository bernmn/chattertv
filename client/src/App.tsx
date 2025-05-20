import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { ModalProvider } from "@/contexts/modal-context";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Contests from "@/pages/contests";
import Featured from "@/pages/featured";
import Recent from "@/pages/recent";
import AIVideos from "@/pages/ai-videos";
import Debug from "@/pages/debug";
import { VideoPlayerModal } from "./components/modals/video-player-modal";
import { UploadModal } from "./components/modals/upload-modal";
import { ShareModal } from "./components/modals/share-modal";
import { DeleteConfirmModal } from "./components/modals/delete-confirm-modal";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/debug" component={Debug} />
      <Route path="/contests" component={Contests} />
      <Route path="/featured" component={Featured} />
      <Route path="/recent" component={Recent} />
      <Route path="/ai-videos" component={AIVideos} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ModalProvider>
        <Router />
        <Toaster />
        
        {/* Global Modals */}
        <VideoPlayerModal />
        <UploadModal />
        <ShareModal />
        <DeleteConfirmModal />
      </ModalProvider>
    </QueryClientProvider>
  );
}

export default App;
