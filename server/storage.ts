import { videos, type Video, type InsertVideo, users, type User, type InsertUser, comments, type Comment, type InsertComment } from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, asc } from "drizzle-orm";
import fs from "fs";

// The storage interface that defines all data operations
export interface IStorage {
  // Video methods
  getVideo(id: number): Promise<Video | undefined>;
  getVideos(): Promise<Video[]>;
  getRecentVideos(limit?: number): Promise<Video[]>;
  getFeaturedVideos(limit?: number): Promise<Video[]>;
  getContestVideos(limit?: number): Promise<Video[]>;
  getAIVideos(limit?: number): Promise<Video[]>;
  createVideo(video: InsertVideo): Promise<Video>;
  updateVideo(id: number, video: Partial<Video>): Promise<Video | undefined>;
  deleteVideo(id: number): Promise<boolean>;
  incrementViews(id: number): Promise<boolean>;
  
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Comment methods
  getComments(videoId: number): Promise<Comment[]>;
  createComment(comment: InsertComment): Promise<Comment>;
  deleteComment(id: number): Promise<boolean>;
}

// Database storage implementation
export class DatabaseStorage implements IStorage {
  // Video methods
  async getVideo(id: number): Promise<Video | undefined> {
    const [video] = await db.select().from(videos).where(eq(videos.id, id));
    return video;
  }

  async getVideos(): Promise<Video[]> {
    return await db.select().from(videos).orderBy(desc(videos.createdAt));
  }

  async getRecentVideos(limit: number = 5): Promise<Video[]> {
    return await db
      .select()
      .from(videos)
      .orderBy(desc(videos.createdAt))
      .limit(limit);
  }

  async getFeaturedVideos(limit: number = 5): Promise<Video[]> {
    return await db
      .select()
      .from(videos)
      .where(eq(videos.isFeatured, true))
      .orderBy(desc(videos.createdAt))
      .limit(limit);
  }

  async getContestVideos(limit: number = 5): Promise<Video[]> {
    return await db
      .select()
      .from(videos)
      .where(eq(videos.isContest, true))
      .orderBy(desc(videos.createdAt))
      .limit(limit);
  }
  
  async getAIVideos(limit: number = 5): Promise<Video[]> {
    return await db
      .select()
      .from(videos)
      .where(eq(videos.isAI, true))
      .orderBy(desc(videos.createdAt))
      .limit(limit);
  }

  async createVideo(insertVideo: InsertVideo): Promise<Video> {
    try {
      const [video] = await db
        .insert(videos)
        .values(insertVideo)
        .returning();
      
      return video;
    } catch (error) {
      console.error("Error creating video in database:", error);
      throw error;
    }
  }

  async updateVideo(id: number, updates: Partial<Video>): Promise<Video | undefined> {
    const [updatedVideo] = await db
      .update(videos)
      .set(updates)
      .where(eq(videos.id, id))
      .returning();
    
    return updatedVideo;
  }

  async deleteVideo(id: number): Promise<boolean> {
    try {
      const [deleted] = await db
        .delete(videos)
        .where(eq(videos.id, id))
        .returning({ id: videos.id });
      
      return !!deleted;
    } catch (error) {
      console.error("Error deleting video:", error);
      return false;
    }
  }

  async incrementViews(id: number): Promise<boolean> {
    try {
      const [updated] = await db
        .update(videos)
        .set({
          views: sql`${videos.views} + 1`,
        })
        .where(eq(videos.id, id))
        .returning({ id: videos.id });
      
      return !!updated;
    } catch (error) {
      console.error("Error incrementing views:", error);
      return false;
    }
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  // Comment methods
  async getComments(videoId: number): Promise<Comment[]> {
    return await db
      .select()
      .from(comments)
      .where(eq(comments.videoId, videoId))
      .orderBy(desc(comments.createdAt));
  }

  async createComment(insertComment: InsertComment): Promise<Comment> {
    const [comment] = await db
      .insert(comments)
      .values(insertComment)
      .returning();
    
    return comment;
  }

  async deleteComment(id: number): Promise<boolean> {
    try {
      const [deleted] = await db
        .delete(comments)
        .where(eq(comments.id, id))
        .returning({ id: comments.id });
      
      return !!deleted;
    } catch (error) {
      console.error("Error deleting comment:", error);
      return false;
    }
  }
}

// Memory storage implementation for fallback when database is not available
export class MemStorage implements IStorage {
  private videos: Video[] = [];
  private users: User[] = [];
  private comments: Comment[] = [];
  private nextVideoId = 1;
  private nextUserId = 1;
  private nextCommentId = 1;
  private persistenceFile = 'data-store.json';

  constructor() {
    console.log("Using in-memory storage for data persistence");
    // Load any previously saved data
    this.loadFromDisk();
    // Create a default user on initialization
    this.createUser({
      username: "demo",
      password: "password",
      displayName: "Demo User",
      profilePic: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
    });
  }

  // Video methods
  async getVideo(id: number): Promise<Video | undefined> {
    return this.videos.find(video => video.id === id);
  }

  async getVideos(): Promise<Video[]> {
    return [...this.videos].sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  }

  async getRecentVideos(limit: number = 5): Promise<Video[]> {
    return [...this.videos]
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
      .slice(0, limit);
  }

  async getFeaturedVideos(limit: number = 5): Promise<Video[]> {
    return this.videos
      .filter(video => video.isFeatured)
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
      .slice(0, limit);
  }

  async getContestVideos(limit: number = 5): Promise<Video[]> {
    return this.videos
      .filter(video => video.isContest)
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
      .slice(0, limit);
  }

  async getAIVideos(limit: number = 5): Promise<Video[]> {
    return this.videos
      .filter(video => video.isAI)
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
      .slice(0, limit);
  }

  // Save data to disk
  private saveToDisk(): void {
    try {
      const data = {
        videos: this.videos,
        users: this.users,
        comments: this.comments,
        nextVideoId: this.nextVideoId,
        nextUserId: this.nextUserId,
        nextCommentId: this.nextCommentId
      };
      
      fs.writeFileSync(this.persistenceFile, JSON.stringify(data, null, 2));
      console.log(`Data persisted to ${this.persistenceFile}`);
    } catch (error) {
      console.error('Error persisting data to disk:', error);
    }
  }
  
  // Load data from disk
  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.persistenceFile)) {
        const data = JSON.parse(fs.readFileSync(this.persistenceFile, 'utf8'));
        
        // Convert date strings back to Date objects for videos
        this.videos = data.videos.map((v: any) => ({
          ...v,
          createdAt: v.createdAt ? new Date(v.createdAt) : null,
          updatedAt: v.updatedAt ? new Date(v.updatedAt) : null
        }));
        
        // Convert date strings back to Date objects for comments
        this.comments = data.comments.map((c: any) => ({
          ...c,
          createdAt: c.createdAt ? new Date(c.createdAt) : null
        }));
        
        this.users = data.users;
        this.nextVideoId = data.nextVideoId;
        this.nextUserId = data.nextUserId;
        this.nextCommentId = data.nextCommentId;
        
        console.log(`Loaded ${this.videos.length} videos, ${this.users.length} users, and ${this.comments.length} comments from disk`);
      } else {
        console.log('No persistence file found, starting with empty data');
      }
    } catch (error) {
      console.error('Error loading data from disk:', error);
    }
  }
  
  async createVideo(insertVideo: InsertVideo): Promise<Video> {
    // If nextVideoId is null or undefined, start from 1
    if (this.nextVideoId === null || this.nextVideoId === undefined) {
      this.nextVideoId = 1;
      console.log("Resetting nextVideoId to 1");
    }
    
    const id = this.nextVideoId++;
    const now = new Date();
    
    console.log(`Creating video with ID: ${id}`);
    
    // Handle nulls specifically for the Video type
    const newVideo: Video = {
      id,
      title: insertVideo.title,
      description: insertVideo.description || null,
      duration: insertVideo.duration || null,
      views: 0,
      filePath: insertVideo.filePath,
      thumbnailPath: insertVideo.thumbnailPath,
      category: insertVideo.category || null,
      tags: insertVideo.tags || null,
      isFeatured: insertVideo.isFeatured || false,
      isContest: insertVideo.isContest || false,
      isAI: insertVideo.isAI || false,
      userId: insertVideo.userId,
      createdAt: now
    };
    this.videos.push(newVideo);
    this.saveToDisk(); // Save changes
    return newVideo;
  }

  async updateVideo(id: number, updates: Partial<Video>): Promise<Video | undefined> {
    const index = this.videos.findIndex(video => video.id === id);
    if (index === -1) return undefined;

    const updatedVideo = {
      ...this.videos[index],
      ...updates,
      updatedAt: new Date()
    };
    this.videos[index] = updatedVideo;
    this.saveToDisk(); // Save changes
    return updatedVideo;
  }

  async deleteVideo(id: number): Promise<boolean> {
    const initialLength = this.videos.length;
    this.videos = this.videos.filter(video => video.id !== id);
    // Also delete comments for this video
    this.comments = this.comments.filter(comment => comment.videoId !== id);
    
    const success = this.videos.length !== initialLength;
    if (success) {
      this.saveToDisk(); // Save changes
    }
    return success;
  }

  async incrementViews(id: number): Promise<boolean> {
    const video = this.videos.find(video => video.id === id);
    if (!video) return false;
    video.views = (video.views || 0) + 1;
    this.saveToDisk(); // Save changes
    return true;
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.find(user => user.id === id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return this.users.find(user => user.username.toLowerCase() === username.toLowerCase());
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.nextUserId++;
    const newUser: User = {
      id,
      username: insertUser.username,
      password: insertUser.password,
      displayName: insertUser.displayName || null,
      profilePic: insertUser.profilePic || null,
      followers: 0
    };
    this.users.push(newUser);
    this.saveToDisk(); // Save changes
    return newUser;
  }

  // Comment methods
  async getComments(videoId: number): Promise<Comment[]> {
    return this.comments
      .filter(comment => comment.videoId === videoId)
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  }

  async createComment(insertComment: InsertComment): Promise<Comment> {
    const id = this.nextCommentId++;
    const now = new Date();
    const newComment: Comment = {
      id,
      content: insertComment.content,
      videoId: insertComment.videoId,
      userId: insertComment.userId,
      createdAt: now
    };
    this.comments.push(newComment);
    this.saveToDisk(); // Save changes
    return newComment;
  }

  async deleteComment(id: number): Promise<boolean> {
    const initialLength = this.comments.length;
    this.comments = this.comments.filter(comment => comment.id !== id);
    
    const success = this.comments.length !== initialLength;
    if (success) {
      this.saveToDisk(); // Save changes
    }
    return success;
  }
}

// Create a default user at startup (works with any storage implementation)
async function createDefaultUser(storage: IStorage) {
  try {
    const existingUser = await storage.getUserByUsername("demo");
    
    if (!existingUser) {
      await storage.createUser({
        username: "demo",
        password: "password",
        displayName: "Demo User",
        profilePic: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
      });
      console.log("Created default demo user");
    } else {
      console.log("Default user already exists");
    }
  } catch (error) {
    console.error("Error creating default user:", error);
  }
}

// Use in-memory storage for now since it was working perfectly
let storage: IStorage;

// Initialize in-memory storage
console.log("Using in-memory storage as requested");
storage = new MemStorage();

// Create a default user in the in-memory storage
createDefaultUser(storage).catch(err => 
  console.error("Error creating default user:", err)
);

// Add a method to recover videos from S3 that might not be in our local storage
async function syncWithS3(storage: IStorage): Promise<void> {
  try {
    // Import utilities for S3 sync (dynamically to avoid circular dependencies)
    const { syncWithS3: runS3Sync } = await import('./storage-utils');
    
    console.log("Synchronizing videos from S3 to ensure none are lost...");
    
    // Run the actual sync operation from the storage-utils module
    await runS3Sync(storage);
    
    console.log("S3 synchronization completed successfully");
  } catch (error) {
    console.error("Error syncing with S3:", error);
  }
}

// Enable S3 sync on startup - critical for deployment persistence
setTimeout(() => {
  console.log("Starting S3 synchronization...");
  syncWithS3(storage).catch(err => {
    console.error("Error during S3 sync:", err);
  });
}, 5000);

// Enable periodic S3 sync every 15 minutes
// This ensures we don't lose videos if the server restarts
setInterval(() => {
  console.log("Running periodic S3 synchronization...");
  syncWithS3(storage).catch(err => {
    console.error("Error during periodic S3 sync:", err);
  });
}, 15 * 60 * 1000); // Run every 15 minutes

export { storage };
