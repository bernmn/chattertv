import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();

// Get file size limit from environment variable or default to 500MB
// Note that the limit here is higher than routes.ts to allow for overhead
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '524288000'); // Exactly 500MB in bytes (500 * 1024 * 1024)
const maxRequestSizeMB = Math.ceil(MAX_FILE_SIZE / (1024 * 1024));
const maxRequestSize = `${maxRequestSizeMB}mb`;

// Calculate a buffer for middleware limits - add extra 25% for metadata
const MIDDLEWARE_LIMIT = Math.ceil(MAX_FILE_SIZE * 1.25);
const middlewareLimitMB = Math.ceil(MIDDLEWARE_LIMIT / (1024 * 1024));
const middlewareSize = `${middlewareLimitMB}mb`;

console.log(`=== File Upload Configuration ===`);
console.log(`Maximum file size: ${maxRequestSizeMB} MB (${MAX_FILE_SIZE} bytes)`);
console.log(`Middleware limit: ${middlewareLimitMB} MB (${MIDDLEWARE_LIMIT} bytes)`);
console.log(`Environment MAX_FILE_SIZE: ${process.env.MAX_FILE_SIZE || 'not set (using default)'}`);
console.log(`===============================`);

// Apply increased limits to all body parsers to handle larger files
app.use(express.json({ limit: middlewareSize }));
app.use(express.urlencoded({ extended: false, limit: middlewareSize }));
app.use(express.raw({ limit: middlewareSize }));
app.use(express.text({ limit: middlewareSize }));

// Custom middleware to increase request size limits and handle large uploads
app.use((req, res, next) => {
  // Set higher limits for request body size
  if (req.headers['content-length']) {
    const contentLength = parseInt(req.headers['content-length']);
    
    if (contentLength > MAX_FILE_SIZE) {
      console.log(`⚠️ WARNING: Request exceeds configured limit: ${contentLength} bytes (${Math.round(contentLength / (1024 * 1024))} MB)`);
      return res.status(413).json({ 
        error: 'Request entity too large',
        message: `The file size exceeds the limit of ${maxRequestSizeMB} MB`,
        limit: MAX_FILE_SIZE,
        received: contentLength 
      });
    }
    
    if (contentLength > (100 * 1024 * 1024)) { // Log files over 100MB
      console.log(`📦 Large request received: ${contentLength} bytes (${Math.round(contentLength / (1024 * 1024))} MB)`);
    }
  }
  
  // Explicitly set max content length for all requests
  req.socket.setMaxListeners(0);  // Remove listener limit
  req.socket.setTimeout(60 * 60 * 1000); // 60 minute timeout for very large uploads
  
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    
    // Log the full error details for debugging
    console.error(`
==============================
API ERROR (${status})
==============================
Route: ${req.method} ${req.path}
Request Headers: ${JSON.stringify(req.headers)}
Error: ${err.stack || err.message || "Unknown error"}
==============================
    `);

    // Send a clear error message to the client
    res.status(status).json({ 
      message, 
      status,
      path: req.path,
      timestamp: new Date().toISOString()
    });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
