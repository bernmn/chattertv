import React, { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

export default function Debug() {
  const [apiStatus, setApiStatus] = useState<string>('Unknown');
  const [recentVideos, setRecentVideos] = useState<any[]>([]);
  const [featuredVideos, setFeaturedVideos] = useState<any[]>([]);
  const [contestVideos, setContestVideos] = useState<any[]>([]);
  const [aiVideos, setAiVideos] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    // Check API health
    fetch('/api/health')
      .then(res => res.json())
      .then(data => {
        setApiStatus(data.status === 'ok' ? 'Healthy' : 'Unhealthy');
      })
      .catch(err => {
        setApiStatus('Error');
        setError(`API Health Error: ${err.message}`);
      });
    
    // Get recent videos
    fetch('/api/videos/recent')
      .then(res => res.json())
      .then(data => {
        setRecentVideos(data);
      })
      .catch(err => {
        setError(`Recent Videos Error: ${err.message}`);
      });
    
    // Get featured videos
    fetch('/api/videos/featured')
      .then(res => res.json())
      .then(data => {
        setFeaturedVideos(data);
      })
      .catch(err => {
        setError(`Featured Videos Error: ${err.message}`);
      });
    
    // Get contest videos
    fetch('/api/videos/contest')
      .then(res => res.json())
      .then(data => {
        setContestVideos(data);
      })
      .catch(err => {
        setError(`Contest Videos Error: ${err.message}`);
      });
    
    // Get AI videos
    fetch('/api/videos/ai')
      .then(res => res.json())
      .then(data => {
        setAiVideos(data);
      })
      .catch(err => {
        setError(`AI Videos Error: ${err.message}`);
      });
  }, []);
  
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">ChatterTV Debug Page</h1>
      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>API Status</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Status: <span className={apiStatus === 'Healthy' ? 'text-green-500' : 'text-red-500'}>{apiStatus}</span></p>
          {error && (
            <div className="mt-4 p-4 bg-red-100 text-red-800 rounded">
              <h3 className="font-bold">Error:</h3>
              <p>{error}</p>
            </div>
          )}
        </CardContent>
        <CardFooter>
          <Button asChild>
            <Link href="/">Go to Home Page</Link>
          </Button>
        </CardFooter>
      </Card>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent Videos ({recentVideos.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {recentVideos.length === 0 ? (
              <p>No recent videos found.</p>
            ) : (
              <ul>
                {recentVideos.map(video => (
                  <li key={video.id} className="mb-2">
                    {video.title} - {video.createdAt}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Featured Videos ({featuredVideos.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {featuredVideos.length === 0 ? (
              <p>No featured videos found.</p>
            ) : (
              <ul>
                {featuredVideos.map(video => (
                  <li key={video.id} className="mb-2">
                    {video.title} - {video.createdAt}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Contest Videos ({contestVideos.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {contestVideos.length === 0 ? (
              <p>No contest videos found.</p>
            ) : (
              <ul>
                {contestVideos.map(video => (
                  <li key={video.id} className="mb-2">
                    {video.title} - {video.createdAt}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>AI Videos ({aiVideos.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {aiVideos.length === 0 ? (
              <p>No AI videos found.</p>
            ) : (
              <ul>
                {aiVideos.map(video => (
                  <li key={video.id} className="mb-2">
                    {video.title} - {video.createdAt}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}