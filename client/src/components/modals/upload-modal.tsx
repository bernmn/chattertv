import React, { useState, useRef, useEffect } from "react";
import { useModal } from "@/contexts/modal-context";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { X, Upload, CloudUpload, FileVideo, AlertCircle, Info, AlertTriangle } from "lucide-react";
import { Link } from "wouter";
import { DEPLOYMENT_CONFIG, isProduction } from "@/lib/deployment-config";

export const UploadModal: React.FC<{}> = () => {
  const { uploadModal } = useModal();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [isContest, setIsContest] = useState(false);
  const [isAI, setIsAI] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [envConfig, setEnvConfig] = useState<{maxFileSize: number}>({
    maxFileSize: 524288000, // 500MB (500 * 1024 * 1024)
  });

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setCategory("");
    setTags("");
    setIsContest(false);
    setIsAI(false);
    setSelectedFile(null);
  };

  const handleClose = () => {
    resetForm();
    uploadModal.closeModal();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      // Check file type - be more flexible with MIME types
      const fileName = file.name.toLowerCase();
      const isVideo = file.type.startsWith('video/') || 
                      fileName.endsWith('.mp4') || 
                      fileName.endsWith('.mov') || 
                      fileName.endsWith('.webm') || 
                      fileName.endsWith('.ogg') || 
                      fileName.endsWith('.avi') ||
                      fileName.endsWith('.mkv') ||
                      fileName.endsWith('.flv');
                      
      if (!isVideo) {
        toast({
          title: "Invalid file type",
          description: "Please upload a valid video file (MP4, WebM, MOV, etc.)",
          variant: "destructive",
        });
        return;
      }
      
      // Get the max file size based on environment (deployment vs development)
      const maxFileSize = isProduction() 
          ? DEPLOYMENT_CONFIG.maxFileSize 
          : DEPLOYMENT_CONFIG.devMaxFileSize;
      
      // Check file size limit
      if (file.size > maxFileSize) {
        const maxSizeMB = Math.round(maxFileSize / (1024 * 1024));
        toast({
          title: "File too large",
          description: isProduction()
            ? `The deployed application only supports videos up to ${maxSizeMB}MB. For larger files (up to 500MB), please use the development environment.`
            : `Please upload a video file smaller than ${maxSizeMB}MB`,
          variant: "destructive",
          duration: 10000,
        });
        return;
      }
      
      // Provide warning for large files that will use multipart upload
      if (file.size > 100 * 1024 * 1024) { // 100MB - multipart upload threshold
        const fileSizeMB = Math.round(file.size / (1024 * 1024));
        toast({
          title: "Large file detected",
          description: (
            <div>
              Your file is {fileSizeMB}MB. For files larger than 100MB, we'll use multipart uploads to AWS S3 for better reliability.
            </div>
          ),
          variant: "default",
          duration: 10000, // Show for 10 seconds
        });
      } 
      // Provide warning for medium sized files
      else if (file.size > 50 * 1024 * 1024) { // 50MB
        const fileSizeMB = Math.round(file.size / (1024 * 1024));
        toast({
          title: "Medium file detected",
          description: (
            <div>
              Your file is {fileSizeMB}MB. We'll use direct S3 upload for better reliability.
            </div>
          ),
          variant: "default", 
          duration: 8000, // Show for 8 seconds
        });
      }
      
      setSelectedFile(file);
    }
  };

  // Load max file size and other configuration data
  useEffect(() => {
    async function loadConfig() {
      try {
        // Set max file size based on environment
        setEnvConfig({
          maxFileSize: isProduction() ? 
            DEPLOYMENT_CONFIG.maxFileSize : // 50MB in production
            DEPLOYMENT_CONFIG.devMaxFileSize, // 500MB in development
        });
        
        console.log(`Environment: ${isProduction() ? 'PRODUCTION' : 'DEVELOPMENT'}`);
        console.log(`Max file size: ${isProduction() ? '50MB' : '500MB'}`);
      } catch (error) {
        console.error("Failed to load config:", error);
      }
    }
    
    loadConfig();
  }, []);

  // S3 direct upload for larger files with support for multipart uploads
  async function uploadDirectlyToS3(file: File, metadata: {
    title: string;
    description: string;
    duration: number;
    isContest: boolean;
    isAI: boolean;
    category?: string;
    tags?: string;
  }): Promise<{ videoId: number; s3Key: string }> {
    console.log("Starting direct S3 upload process for large file");
    
    // For very large files (100MB+), use multipart upload
    const MULTIPART_THRESHOLD = 100 * 1024 * 1024; // 100MB
    const isMultipartUpload = file.size > MULTIPART_THRESHOLD;
    
    // For single part direct uploads
    if (!isMultipartUpload) {
      console.log("Using standard direct-to-S3 upload (file < 100MB)");
      try {
        // First, get a presigned upload URL
        const presignedRes = await fetch(`/api/upload-url?fileType=${encodeURIComponent(file.type)}&fileName=${encodeURIComponent(file.name)}`);
        
        if (!presignedRes.ok) {
          // Check if we got a fallback message indicating S3 is disabled
          const errorData = await presignedRes.json();
          
          if (errorData.fallbackAvailable) {
            console.log("S3 upload not available, will use standard upload endpoint");
            throw new Error("S3 not available");
          }
          
          throw new Error(errorData.message || "Failed to get upload URL");
        }
        
        const { uploadUrl, key } = await presignedRes.json();
        console.log(`Got presigned URL for S3 upload: ${key}`);
        
        // Upload directly to S3
        const uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': file.type
          }
        });
        
        if (!uploadResponse.ok) {
          throw new Error(`Failed to upload to S3: ${uploadResponse.status} ${uploadResponse.statusText}`);
        }
        
        console.log("File successfully uploaded to S3");
        
        // Now register the uploaded file with our backend
        const registerResponse = await fetch('/api/videos/s3', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key,
            title: metadata.title,
            description: metadata.description,
            duration: metadata.duration,
            category: metadata.category || "",
            tags: metadata.tags || "",
            isContest: metadata.isContest,
            isAI: metadata.isAI
          })
        });
        
        if (!registerResponse.ok) {
          const errorData = await registerResponse.json();
          throw new Error(errorData.message || "Failed to register video");
        }
        
        const video = await registerResponse.json();
        return { videoId: video.id, s3Key: key };
      } catch (error) {
        console.error("S3 upload error:", error);
        throw error;
      }
    } 
    // For large files, use multipart upload
    else {
      console.log(`Using multipart upload for large file (${Math.round(file.size / 1024 / 1024)}MB)`);
      try {
        // Step 1: Initialize the multipart upload
        const initResponse = await fetch('/api/multipart-upload/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size
          })
        });
        
        if (!initResponse.ok) {
          // Check if we got a fallback message indicating S3 is disabled
          const errorData = await initResponse.json();
          
          if (errorData.message && errorData.message.includes("S3 integration is disabled")) {
            console.log("S3 multipart upload not available, will use standard upload endpoint");
            throw new Error("S3 not available");
          }
          
          throw new Error(`Failed to initialize multipart upload: ${await initResponse.text()}`);
        }
        
        const { uploadId, key } = await initResponse.json();
        console.log(`Initialized multipart upload: uploadId=${uploadId}, key=${key}`);
        
        // Step 2: Define the part size - optimized for different file sizes
        // S3 requires minimum 5MB parts, maximum 10,000 parts
        // For better reliability with different file sizes:
        // - Small large files (50-100MB): use 5MB parts 
        // - Medium large files (100-500MB): use 10MB parts
        // - Very large files (>500MB): use 25MB parts to reduce request count
        const basePartSize = 5 * 1024 * 1024; // 5MB minimum
        let partSize = basePartSize;
        
        // Determine optimal part size based on file size
        if (file.size > 500 * 1024 * 1024) {
          // For very large files (>500MB), use 25MB parts
          partSize = 25 * 1024 * 1024;
          console.log("Very large file detected. Using 25MB part size for optimal performance.");
        } else if (file.size > 100 * 1024 * 1024) {
          // For medium large files (100-500MB), use 10MB parts
          partSize = 10 * 1024 * 1024;
          console.log("Medium large file detected. Using 10MB part size.");
        } else {
          console.log("Using standard 5MB part size.");
        }
        const numParts = Math.ceil(file.size / partSize);
        
        // Validate part count is within S3 limits
        if (numParts > 10000) {
          throw new Error(`File too large for multipart upload: would require ${numParts} parts (maximum is 10,000)`);
        }
        
        console.log(`Splitting ${file.name} (${Math.round(file.size/1024/1024)}MB) into ${numParts} parts of ${partSize/1024/1024}MB each`);
        
        // Step 3: Upload each part with improved error handling and retries
        const parts: { PartNumber: number; ETag: string }[] = [];
        let failedParts = 0;
        const MAX_RETRIES = 3;
        
        // Helper function to handle upload of a single part with retries
        const uploadSinglePart = async (partNumber: number): Promise<void> => {
          let retryCount = 0;
          let uploaded = false;
          
          while (!uploaded && retryCount <= MAX_RETRIES) {
            try {
              const start = (partNumber - 1) * partSize;
              const end = Math.min(start + partSize, file.size);
              const filePart = file.slice(start, end);
              
              // Get a presigned URL for this part
              const partUrlRes = await fetch(`/api/multipart-upload/part-url?key=${encodeURIComponent(key)}&uploadId=${uploadId}&partNumber=${partNumber}`);
              
              if (!partUrlRes.ok) {
                const errorText = await partUrlRes.text();
                console.error(`Failed to get part upload URL for part ${partNumber}: ${errorText}`);
                throw new Error(`Failed to get part upload URL: ${errorText}`);
              }
              
              const { partUrl } = await partUrlRes.json();
              
              // Upload the part to S3 with improved fetch options
              console.log(`Uploading part ${partNumber}/${numParts} (${Math.round((end-start)/1024/1024)}MB)`);
              setUploadProgress(Math.round((partNumber - 0.5) / numParts * 90)); // Max 90% for upload
              
              // Use a custom AbortController with longer timeout for large uploads
              const controller = new AbortController();
              const signal = controller.signal;
              
              // Set a generous timeout for large file part uploads (5 minutes per part)
              const timeoutId = setTimeout(() => {
                console.warn(`Upload timeout for part ${partNumber} - aborting`);
                controller.abort();
              }, 5 * 60 * 1000);
              
              // Upload with improved fetch configuration
              let response: Response; 
              
              try {
                response = await fetch(partUrl, {
                  method: 'PUT',
                  body: filePart,
                  signal,
                  // Important headers to help with large uploads
                  headers: {
                    'Content-Type': 'application/octet-stream',
                    'Cache-Control': 'no-cache',
                  },
                  // Critical for reliability: don't retry automatically, we handle retries ourselves
                  // Add these options to help with large uploads
                  keepalive: true,
                  mode: 'cors',
                });
                
                // Clear the timeout since the request completed
                clearTimeout(timeoutId);
              } catch (error) {
                // Clear the timeout to prevent potential memory leaks
                clearTimeout(timeoutId);
                throw error;
              }
              
              if (!response.ok) {
                throw new Error(`Failed to upload part ${partNumber}: ${response.status} ${response.statusText}`);
              }
              
              // Get the ETag from the response headers
              const etag = response.headers.get('ETag');
              if (!etag) {
                throw new Error(`No ETag received for part ${partNumber}`);
              }
              
              // Store the part information
              parts.push({
                PartNumber: partNumber,
                ETag: etag.replace(/"/g, '') // Remove quotes if present
              });
              
              console.log(`Part ${partNumber}/${numParts} uploaded successfully`);
              uploaded = true;
            } catch (error) {
              retryCount++;
              
              if (retryCount <= MAX_RETRIES) {
                console.warn(`Error uploading part ${partNumber}, retrying (${retryCount}/${MAX_RETRIES}):`, error);
                // Exponential backoff
                const delay = Math.pow(2, retryCount - 1) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
              } else {
                failedParts++;
                console.error(`Failed to upload part ${partNumber} after ${MAX_RETRIES} retries`);
                throw error;
              }
            }
          }
        };
        
        // Process parts in batches to avoid overloading the network
        // Determine optimal batch size based on part size
        // - Smaller parts: can use larger batch size
        // - Larger parts: use smaller batch size to avoid memory issues
        let BATCH_SIZE = 3; // Default - process 3 parts concurrently
        
        if (partSize >= 25 * 1024 * 1024) {
          // For 25MB parts, only process 2 at a time
          BATCH_SIZE = 2;
          console.log("Using reduced batch size (2) for large parts to avoid memory issues");
        } else if (partSize <= 5 * 1024 * 1024 && file.size < 200 * 1024 * 1024) {
          // For smaller files with small parts, we can do more concurrent uploads
          BATCH_SIZE = 4;
          console.log("Using increased batch size (4) for smaller parts");
        }
        
        console.log(`Will process ${BATCH_SIZE} parts concurrently`);
        let currentPart = 1;
        
        while (currentPart <= numParts) {
          const batch = [];
          for (let i = 0; i < BATCH_SIZE && currentPart + i <= numParts; i++) {
            batch.push(uploadSinglePart(currentPart + i));
          }
          
          // Wait for the batch to complete
          await Promise.all(batch);
          currentPart += BATCH_SIZE;
          
          // Update the progress based on completed parts
          const completedPercentage = Math.min(Math.round((parts.length / numParts) * 90), 90);
          setUploadProgress(completedPercentage);
        }
        
        // Check if any parts failed
        if (failedParts > 0) {
          throw new Error(`Failed to upload ${failedParts} parts out of ${numParts}`);
        }
        
        // Step 4: Complete the multipart upload
        console.log("All parts uploaded. Completing multipart upload...");
        console.log(`Uploaded ${parts.length} parts out of ${numParts} expected`);
        setUploadProgress(95); // 95% - almost done
        
        // Verify that all parts were uploaded
        if (parts.length !== numParts) {
          // Sort the parts by part number to identify which ones are missing
          const partNumbers = parts.map(p => p.PartNumber).sort((a, b) => a - b);
          const missingParts = [];
          
          for (let i = 1; i <= numParts; i++) {
            if (!partNumbers.includes(i)) {
              missingParts.push(i);
            }
          }
          
          console.error(`Missing parts: ${missingParts.join(', ')}`);
          throw new Error(`Upload incomplete: Missing ${numParts - parts.length} parts out of ${numParts}`);
        }
        
        let fileUrl: string;
        try {
          const completeResponse = await fetch('/api/multipart-upload/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              key,
              uploadId,
              parts
            })
          });
          
          if (!completeResponse.ok) {
            const errorText = await completeResponse.text();
            console.error(`Failed to complete multipart upload: ${errorText}`);
            
            // Try to parse JSON error response
            try {
              const errorJson = JSON.parse(errorText);
              throw new Error(errorJson.message || `Failed to complete multipart upload: Status ${completeResponse.status}`);
            } catch (e) {
              // If parsing fails, just use the text
              throw new Error(`Failed to complete multipart upload: ${errorText}`);
            }
          }
          
          // Extract file URL from response
          const responseData = await completeResponse.json();
          fileUrl = responseData.fileUrl;
        } catch (error) {
          console.error("Error completing multipart upload:", error);
          toast({
            title: "Upload Error",
            description: error instanceof Error ? error.message : "Failed to complete multipart upload",
            variant: "destructive",
            duration: 10000,
          });
          throw error;
        }
        console.log(`Multipart upload completed successfully: ${fileUrl}`);
        
        // Step 5: Register the completed upload with our backend
        setUploadProgress(97); // 97% - registering with backend
        
        const registerResponse = await fetch('/api/videos/s3', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key,
            title: metadata.title,
            description: metadata.description,
            duration: metadata.duration,
            category: metadata.category || "",
            tags: metadata.tags || "",
            isContest: metadata.isContest,
            isAI: metadata.isAI
          })
        });
        
        if (!registerResponse.ok) {
          const errorData = await registerResponse.json();
          throw new Error(errorData.message || "Failed to register video");
        }
        
        const video = await registerResponse.json();
        setUploadProgress(100); // 100% - all done!
        return { videoId: video.id, s3Key: key };
      } catch (error) {
        console.error("Multipart S3 upload error:", error);
        throw error;
      }
    }
  }
  
  // Function to log upload progress messages
  function logUploadProgress(message: string) {
    console.log(`Upload progress: ${message}`);
    // We could also store these messages in state if we wanted to display them in the UI
  }
  
  // True direct browser-to-S3 upload function (completely bypasses server for file transfer)
  async function trueBrowserDirectUpload(file: File, metadata: {
    title: string;
    description: string;
    duration: number;
    isContest: boolean;
    isAI: boolean;
    category?: string;
    tags?: string;
  }): Promise<{ videoId: number; s3Key: string }> {
    console.log("Starting TRUE direct browser-to-S3 upload (completely bypassing server for file transfer)");
    
    try {
      // Step 1: Get direct upload configuration from server
      const configRes = await fetch('/api/direct-upload/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
        })
      });
      
      if (!configRes.ok) {
        const errorData = await configRes.json();
        console.error("Failed to get direct upload configuration:", errorData);
        throw new Error(errorData.message || "Could not get upload configuration");
      }
      
      // Get the direct upload configuration
      const config = await configRes.json();
      console.log("Got direct upload configuration:", config);
      
      // Check if we received a presigned POST policy (for true direct browser-to-S3 uploads)
      const isPresignedPost = config.config.usePresignedPost && config.url && config.fields;
      
      // Step 2: Prepare the form data for direct S3 upload
      const formData = new FormData();
      
      if (isPresignedPost) {
        // For presigned POST policy (direct browser-to-S3)
        console.log("Using presigned POST policy for direct browser-to-S3 upload");
        
        // Add all the required fields from the pre-signed POST policy
        Object.entries(config.fields).forEach(([key, value]) => {
          formData.append(key, value as string);
        });
        
        // The file must be the last field in the form
        formData.append('file', file);
      } else {
        console.warn("Did not receive presigned POST policy - this upload may not work properly");
        throw new Error("Missing presigned POST configuration for direct browser upload");
      }
      
      // Show progress animation (S3 POST uploads don't support progress tracking)
      const uploadTracker = setInterval(() => {
        setUploadProgress((prev) => {
          // Gradually increase progress up to 90%
          if (prev < 90) return prev + 1;
          return prev;
        });
      }, 1000);
      
      try {
        // Step 3: Upload directly to S3 using the pre-signed POST URL
        const s3Response = await fetch(config.url, {
          method: 'POST',
          body: formData,
          // Don't set Content-Type header - browser will set it correctly with boundary
        });
        
        // Clear the progress tracker
        clearInterval(uploadTracker);
        
        if (!s3Response.ok) {
          let errorMessage = `S3 upload failed: ${s3Response.status} ${s3Response.statusText}`;
          
          // Try to parse XML error response from S3
          const responseText = await s3Response.text();
          console.error("S3 error response:", responseText);
          
          // Extract error message from XML if possible
          const errorMatch = responseText.match(/<Message>(.*?)<\/Message>/);
          if (errorMatch && errorMatch[1]) {
            errorMessage = `S3 upload failed: ${errorMatch[1]}`;
          }
          
          throw new Error(errorMessage);
        }
        
        console.log("File successfully uploaded directly to S3 using browser-only upload");
        setUploadProgress(95); // 95% - registering with backend
        
        // Step 4: Register the uploaded file with our backend
        const registerResponse = await fetch('/api/direct-upload/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: config.fields.key,
            title: metadata.title,
            description: metadata.description,
            duration: metadata.duration,
            category: metadata.category || "",
            tags: metadata.tags || "",
            isContest: metadata.isContest,
            isAI: metadata.isAI
          })
        });
        
        if (!registerResponse.ok) {
          const errorData = await registerResponse.json();
          throw new Error(errorData.message || "Failed to register uploaded video");
        }
        
        const video = await registerResponse.json();
        setUploadProgress(100); // 100% - complete
        
        return { videoId: video.id, s3Key: config.fields.key };
      } catch (error) {
        // Clear the progress tracker if there was an error
        clearInterval(uploadTracker);
        throw error;
      }
    } catch (error) {
      console.error("True direct browser upload error:", error);
      throw error;
    }
  }
  
  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile || !title) {
        throw new Error("Please provide a title and select a video file");
      }
      
      setIsUploading(true);
      setUploadProgress(0);
      setErrorMessage(null);
      
      // Add this log to verify the upload is starting
      console.log(`Starting upload for ${selectedFile.name} (${Math.round(selectedFile.size / 1024 / 1024)}MB)`);
      
      
      try {
        // Define thresholds for different upload strategies
        const MEDIUM_FILE_THRESHOLD = 50 * 1024 * 1024; // 50MB - use server-assisted S3 upload
        const LARGE_FILE_THRESHOLD = 150 * 1024 * 1024; // 150MB - use true direct browser upload
        const VERY_LARGE_FILE_THRESHOLD = 400 * 1024 * 1024; // 400MB - super large files
        
        // Enhanced upload strategy:
        // - Small files (0-50MB): Standard server upload
        // - Medium files (50-150MB): Server-assisted S3 direct upload
        // - Large files (150-400MB): True browser-to-S3 direct upload
        // - Very large files (400MB+): True browser-to-S3 upload with larger chunks
        
        // Check if file size exceeds the maximum allowed (same limit for both production and development)
        if (selectedFile.size > DEPLOYMENT_CONFIG.maxFileSize) {
          const maxSizeMB = Math.round(DEPLOYMENT_CONFIG.maxFileSize / (1024 * 1024));
          throw new Error(`Files larger than ${maxSizeMB}MB are not supported. Please select a smaller file.`);
        }
        
        // For very large files (150MB+), use true direct browser-to-S3 upload
        if (selectedFile.size > LARGE_FILE_THRESHOLD) {
          logUploadProgress(`Very large file detected (${Math.round(selectedFile.size / 1024 / 1024)}MB). Using true direct browser-to-S3 upload.`);
          
          // Extract duration if the video has loaded
          let videoDuration = 0;
          try {
            const videoElement = document.createElement('video');
            videoElement.preload = 'metadata';
            videoElement.src = URL.createObjectURL(selectedFile);
            
            await new Promise((resolve) => {
              videoElement.onloadedmetadata = () => {
                videoDuration = videoElement.duration;
                resolve(null);
              };
              setTimeout(resolve, 2000); // Timeout if metadata loading takes too long
            });
            
            URL.revokeObjectURL(videoElement.src);
          } catch (e) {
            console.warn("Could not extract video duration:", e);
          }
          
          try {
            // Use true direct browser-to-S3 upload (completely bypasses server for file transfer)
            const result = await trueBrowserDirectUpload(selectedFile, {
              title,
              description,
              duration: videoDuration,
              category,
              tags,
              isContest,
              isAI
            });
            
            console.log("True direct browser-to-S3 upload completed successfully:", result);
            return result;
          } catch (error) {
            console.error("True direct browser upload failed, falling back to server-assisted upload:", error);
            
            // Fall back to server-assisted upload
            logUploadProgress("Falling back to server-assisted S3 upload.");
            // Continue to server-assisted upload below
          }
        } 
        
        // For medium-sized files (50-150MB), use server-assisted direct S3 upload
        if (selectedFile.size > MEDIUM_FILE_THRESHOLD) {
          logUploadProgress("Medium-sized file detected. Using server-assisted S3 upload.");
          
          // Extract duration if the video has loaded
          let videoDuration = 0;
          try {
            const videoElement = document.createElement('video');
            videoElement.preload = 'metadata';
            videoElement.src = URL.createObjectURL(selectedFile);
            
            await new Promise((resolve) => {
              videoElement.onloadedmetadata = () => {
                videoDuration = videoElement.duration;
                resolve(null);
              };
              setTimeout(resolve, 2000); // Timeout if metadata loading takes too long
            });
            
            URL.revokeObjectURL(videoElement.src);
          } catch (e) {
            console.warn("Could not extract video duration:", e);
          }
          
          // Create a tracker for the S3 upload
          const uploadTracker = setInterval(() => {
            // Increment progress while waiting for S3 upload (indirect feedback)
            setUploadProgress((prev) => {
              if (prev < 95) return prev + 1;
              return prev;
            });
          }, 1000);
          
          try {
            // Upload directly to S3
            const s3Result = await uploadDirectlyToS3(selectedFile, {
              title,
              description,
              duration: videoDuration,
              category,
              tags,
              isContest,
              isAI
            });
            
            // Clear the interval and set to 100%
            clearInterval(uploadTracker);
            setUploadProgress(100);
            
            console.log("S3 upload completed successfully:", s3Result);
            return s3Result;
          } catch (s3Error: any) {
            // Clear the interval if there was an error
            clearInterval(uploadTracker);
            console.error("S3 upload failed, falling back to standard upload:", s3Error);
            
            // Add more detailed error information to logs
            if (s3Error instanceof Error) {
              console.error(`S3 upload error details: ${s3Error.message}`);
              setErrorMessage(`S3 upload error: ${s3Error.message}`);
            }
            
            // Add toast notification about fallback to standard upload
            toast({
              title: "S3 Upload Failed",
              description: "Falling back to standard upload through server. Large files may time out.",
              variant: "destructive",
              duration: 5000,
            });
            
            logUploadProgress("S3 upload failed. Falling back to standard upload.");
          }
        } else if (selectedFile.size > VERY_LARGE_FILE_THRESHOLD) {
          // Very large files (over 150MB) - skip S3 direct upload completely
          logUploadProgress("Very large file detected. Using server-side upload for maximum reliability.");
          // Continue to standard server upload below
        } else {
          // Regular upload for small files (under 50MB)
          logUploadProgress("Small file detected. Using standard upload through server.");
        }
        
        // Standard upload through the server for smaller files or as fallback
        logUploadProgress("Using standard upload through server.");
        
        const formData = new FormData();
        formData.append("video", selectedFile);
        formData.append("title", title);
        formData.append("description", description || "");
        formData.append("category", category || "");
        formData.append("tags", tags || "");
        // Explicitly convert boolean to string "true" or "false"
        formData.append("isContest", isContest ? "true" : "false");
        formData.append("isAI", isAI ? "true" : "false");
        
        console.log("Debug formData info:", {
          fileSize: selectedFile.size,
          fileType: selectedFile.type,
          fileName: selectedFile.name,
          title,
          isContest,
          isAI,
        });
        
        console.log("Submitting form with isContest:", isContest, "isAI:", isAI);
        
        // Use XMLHttpRequest for progress tracking
        return new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          
          xhr.upload.addEventListener("progress", (event) => {
            if (event.lengthComputable) {
              const percentComplete = (event.loaded / event.total) * 100;
              setUploadProgress(Math.round(percentComplete));
              
              if (percentComplete % 10 < 1) { // Log approximately every 10%
                logUploadProgress(`Uploading: ${Math.round(percentComplete)}% complete`);
              }
            }
          });
          
          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const response = JSON.parse(xhr.responseText);
                resolve(response);
              } catch (e) {
                reject(new Error("Invalid response from server"));
              }
            } else {
              let errorMessage = "Upload failed";
              
              try {
                // Try to parse error message from JSON response
                const errorResponse = JSON.parse(xhr.responseText);
                if (errorResponse.message) {
                  errorMessage = errorResponse.message;
                } else if (errorResponse.error) {
                  errorMessage = errorResponse.error;
                }
                console.error("Server error response:", errorResponse);
              } catch (e) {
                // If we can't parse the response, use status text
                errorMessage = xhr.statusText || "Upload failed with status " + xhr.status;
                console.error("Non-JSON error response:", xhr.responseText);
              }
              
              // Show more detailed error in toast
              toast({
                title: "Upload Error",
                description: errorMessage,
                variant: "destructive",
                duration: 10000,
              });
              
              reject(new Error(errorMessage));
            }
          });
          
          xhr.addEventListener("error", () => {
            reject(new Error("Network error during upload"));
          });
          
          xhr.addEventListener("abort", () => {
            reject(new Error("Upload aborted"));
          });
          
          // Track upload progress for large files
          xhr.upload.addEventListener("progress", (event) => {
            if (event.lengthComputable) {
              const percentComplete = Math.round((event.loaded / event.total) * 100);
              setUploadProgress(percentComplete);
              
              // Log progress for larger files at specific increments
              if (percentComplete % 10 === 0 || percentComplete === 99) {
                console.log(`Upload progress: ${percentComplete}% (${Math.round(event.loaded / 1024 / 1024)}MB of ${Math.round(event.total / 1024 / 1024)}MB)`);
              }
            }
          });
          
          // Open and send the request
          try {
            xhr.open("POST", "/api/videos");
            
            // Disable any caching that might interfere with upload
            xhr.setRequestHeader("Cache-Control", "no-cache");
            
            // Add a very generous timeout to accommodate large file uploads
            xhr.timeout = 3600000; // 60 minutes timeout for larger files
            
            // Add special optimizations for large file uploads
            if (selectedFile.size > 100 * 1024 * 1024) {
              console.log("Adding special optimizations for large file size.");
              // Add optimized headers for better large file upload performance
              xhr.setRequestHeader("Connection", "keep-alive");
              xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
              // Disable any browser or network caching
              xhr.setRequestHeader("Cache-Control", "no-cache, no-store, max-age=0");
              xhr.setRequestHeader("Pragma", "no-cache");
              xhr.setRequestHeader("Expires", "0");
            }
            
            xhr.ontimeout = () => {
              reject(new Error("Upload timed out - connection took too long"));
            };
            
            // Add better error details logging
            xhr.onerror = (e) => {
              console.error("XHR error during upload:", e);
              reject(new Error("Network error during upload - connection failed"));
            };
            
            // Send the form data with the file
            xhr.send(formData);
            console.log("Upload request sent successfully");
          } catch (sendError) {
            console.error("Error sending upload request:", sendError);
            reject(new Error(`Failed to initiate upload: ${sendError instanceof Error ? sendError.message : "Unknown error"}`));
          }
        });
      } catch (error) {
        console.error("Upload error:", error);
        setErrorMessage(error instanceof Error ? error.message : "Unknown upload error");
        throw error;
      }
    },
    onSuccess: () => {
      toast({
        title: "Upload successful",
        description: (
          <div>
            Your video has been uploaded successfully.{" "}
            <Link href="/" className="text-[#E50914] underline font-medium">
              Go to Home
            </Link>
          </div>
        ),
      });
      
      // Invalidate queries to refresh the video lists
      // Always invalidate all video lists regardless of the video type
      queryClient.invalidateQueries({ queryKey: ["/api/videos/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/videos/featured"] });
      queryClient.invalidateQueries({ queryKey: ["/api/videos/contest"] });
      queryClient.invalidateQueries({ queryKey: ["/api/videos/ai"] });
      
      resetForm();
      uploadModal.closeModal();
    },
    onError: (error) => {
      toast({
        title: "Upload failed",
        description: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsUploading(false);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    uploadMutation.mutate();
  };

  return (
    <Dialog open={uploadModal.isOpen} onOpenChange={(isOpen) => {
      if (!isOpen) handleClose();
    }}>
      <DialogContent className="bg-[#141414] text-white max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center justify-between">
            Upload Video
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
        
        <form onSubmit={handleSubmit}>
          {!selectedFile ? (
            <div 
              className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center mb-6"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.classList.add('border-[#E50914]');
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.classList.remove('border-[#E50914]');
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.classList.remove('border-[#E50914]');
                
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  const file = e.dataTransfer.files[0];
                  
                  // Check file type - be more flexible with MIME types
                  const fileName = file.name.toLowerCase();
                  const isVideo = file.type.startsWith('video/') || 
                                fileName.endsWith('.mp4') || 
                                fileName.endsWith('.mov') || 
                                fileName.endsWith('.webm') || 
                                fileName.endsWith('.ogg') || 
                                fileName.endsWith('.avi') ||
                                fileName.endsWith('.mkv') ||
                                fileName.endsWith('.flv');
                                
                  if (!isVideo) {
                    toast({
                      title: "Invalid file type",
                      description: "Please upload a valid video file (MP4, WebM, MOV, etc.)",
                      variant: "destructive",
                    });
                    return;
                  }
                  
                  // Check file size against the configured max
                  const maxFileSize = DEPLOYMENT_CONFIG.maxFileSize;
                  const maxFileSizeMB = Math.round(maxFileSize / (1024 * 1024));
                  if (file.size > maxFileSize) {
                    toast({
                      title: "File too large",
                      description: `Please upload a video file smaller than ${maxFileSizeMB}MB`,
                      variant: "destructive",
                    });
                    return;
                  }
                  
                  // Update warning threshold to 50MB and provide more detailed messaging
                  if (file.size > 150 * 1024 * 1024) { // 150MB - true direct browser upload
                    const fileSizeMB = Math.round(file.size / (1024 * 1024));
                    toast({
                      title: "Large file detected",
                      description: (
                        <div>
                          Your file is {fileSizeMB}MB. For maximum reliability, this will use direct browser-to-S3 upload.
                          Do not close this window during the upload process.
                        </div>
                      ),
                      variant: "default",
                      duration: 10000, // Show for 10 seconds
                    });
                  } else if (file.size > 50 * 1024 * 1024) { // 50MB - server-assisted S3 upload
                    const fileSizeMB = Math.round(file.size / (1024 * 1024));
                    toast({
                      title: "Medium file detected",
                      description: (
                        <div>
                          Your file is {fileSizeMB}MB. This will use server-assisted S3 upload for better reliability.
                        </div>
                      ),
                      variant: "default",
                      duration: 10000, // Show for 10 seconds
                    });
                  }
                  
                  setSelectedFile(file);
                }
              }}
            >
              <div className="flex flex-col items-center">
                <CloudUpload className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium mb-2">Drag and drop your video file</h3>
                <p className="text-gray-400 text-sm mb-4">or</p>
                <Button type="button" className="bg-[#6A5ACD] hover:bg-opacity-90 text-white">
                  Browse Files
                </Button>
                <p className="text-gray-500 text-xs mt-4">
                  MP4, MOV, or AVI. Maximum file size {Math.round(DEPLOYMENT_CONFIG.maxFileSize / (1024 * 1024))}MB.
                  {' '}Files over 150MB will use direct browser-to-S3 upload for maximum reliability.
                </p>
                <input 
                  ref={fileInputRef}
                  type="file" 
                  accept="video/*" 
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </div>
          ) : (
            <div className="border-2 border-gray-700 rounded-lg p-4 text-center mb-6 bg-gray-800">
              <div className="flex flex-col space-y-2">
                <div className="flex items-center">
                  <FileVideo className="h-10 w-10 text-[#6A5ACD] mr-3" />
                  <div className="text-left flex-1 overflow-hidden">
                    <p className="text-white font-medium truncate">{selectedFile.name}</p>
                    <p className="text-gray-400 text-sm">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)}MB
                    </p>
                  </div>
                  {!isUploading && (
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="icon" 
                      className="text-gray-400 hover:text-white"
                      onClick={() => setSelectedFile(null)}
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  )}
                </div>
                
                {isUploading && uploadProgress > 0 && (
                  <div className="w-full mt-2">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Upload progress</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <Progress value={uploadProgress} className="h-2" />
                    <p className="text-xs text-gray-500 mt-1">
                      {uploadProgress < 100 ? 'Uploading... Please wait and do not close this window.' : 'Processing...'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="title" className="block text-gray-400 text-sm mb-1">Title</Label>
              <Input 
                id="title"
                type="text" 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full bg-[#333333] text-white focus:ring-[#E50914]"
              />
            </div>
            
            <div>
              <Label htmlFor="description" className="block text-gray-400 text-sm mb-1">Description</Label>
              <Textarea 
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-[#333333] text-white focus:ring-[#E50914]"
                rows={3}
              />
            </div>
            
            <div>
              <Label htmlFor="category" className="block text-gray-400 text-sm mb-1">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full bg-[#333333] text-white focus:ring-[#E50914]">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entertainment">Entertainment</SelectItem>
                  <SelectItem value="music">Music</SelectItem>
                  <SelectItem value="sports">Sports</SelectItem>
                  <SelectItem value="travel">Travel</SelectItem>
                  <SelectItem value="gaming">Gaming</SelectItem>
                  <SelectItem value="education">Education</SelectItem>
                  <SelectItem value="technology">Technology</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="tags" className="block text-gray-400 text-sm mb-1">Tags (separate with commas)</Label>
              <Input 
                id="tags"
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="w-full bg-[#333333] text-white focus:ring-[#E50914]"
              />
            </div>
            
            <div className="flex items-center">
              <Checkbox 
                id="contest-entry" 
                checked={isContest}
                onCheckedChange={(checked) => {
                  const newValue = checked === true;
                  console.log("Contest checkbox changed to:", newValue);
                  setIsContest(newValue);
                }}
                className="text-[#E50914] focus:ring-0"
              />
              <Label htmlFor="contest-entry" className="ml-2 text-gray-300 text-sm font-medium">
                Submit as contest entry
              </Label>
            </div>
            
            <div className="flex items-center mt-3">
              <Checkbox 
                id="ai-video" 
                checked={isAI}
                onCheckedChange={(checked) => {
                  const newValue = checked === true;
                  console.log("AI checkbox changed to:", newValue);
                  setIsAI(newValue);
                }}
                className="text-[#6A40BF] focus:ring-0"
              />
              <Label htmlFor="ai-video" className="ml-2 text-gray-300 text-sm font-medium">
                Mark as A.I. generated video
              </Label>
            </div>
          </div>
          
          <div className="mt-6 flex justify-end">
            <Button
              type="button"
              variant="secondary"
              className="bg-gray-700 text-white mr-3 hover:bg-gray-600"
              onClick={handleClose}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-[#6A5ACD] text-white hover:bg-opacity-90"
              disabled={!selectedFile || !title || isUploading}
            >
              {isUploading ? (
                <>
                  <div className="animate-spin h-4 w-4 mr-2 border-t-2 border-b-2 border-white rounded-full"></div>
                  Uploading... {uploadProgress > 0 ? `${uploadProgress}%` : ''}
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
