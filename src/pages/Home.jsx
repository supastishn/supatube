import { useState, useEffect } from 'react';
import VideoCard from '../components/VideoCard'; // Assuming VideoCard component is in ../components
import { databases } from '../lib/appwriteConfig';
import { Query } from 'appwrite';
import { appwriteConfig } from '../lib/appwriteConfig';

const Home = () => {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Simulate API call to fetch videos
    const fetchVideos = async () => {
      setLoading(true);
      setError(null); // Reset error state
      try {
        // Fetch videos from Appwrite
        const response = await databases.listDocuments(
          appwriteConfig.databaseId,
          appwriteConfig.videosCollectionId,
          [Query.orderDesc('$createdAt')] // Example: Order by creation date, newest first
        );

        // Map Appwrite documents to the video structure expected by VideoCard
        // IMPORTANT: Adjust the attribute names (e.g., doc.thumbnailUrl, doc.channelName)
        // to match YOUR Appwrite collection schema EXACTLY.
        const fetchedVideos = response.documents.map(doc => ({
          id: doc.$id,
          title: doc.title || 'Untitled Video', // Provide fallback
          thumbnailUrl: doc.thumbnailUrl || 'https://via.placeholder.com/320x180/CCCCCC/969696?text=No+Thumbnail', // Provide fallback
          durationSeconds: doc.durationSeconds || 0, // Provide fallback
          viewCount: doc.viewCount || 0, // Provide fallback
          uploadedAt: doc.$createdAt, // Use Appwrite's built-in timestamp
          channel: {
            // Assuming channel info is stored directly on the video document for simplicity
            // If channel is a relationship, you'll need more complex fetching/mapping
            id: doc.channelId || `channel-${doc.$id}`, // Example placeholder if no specific channel ID is stored
            name: doc.channelName || 'Unknown Channel', // Adjust attribute name
            profileImageUrl: doc.channelProfileImageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(doc.channelName || 'U')}&background=random`, // Example fallback avatar
          }
        }));

        console.log('Fetched Videos:', fetchedVideos); // Log the fetched and mapped videos
        setVideos(fetchedVideos); // Set fetched data
      } catch (err) {
        console.error("Error fetching videos:", err);
        setError(err.message || "An unknown error occurred while fetching videos.");
      } finally {
        setLoading(false); // Stop loading indicator
      }
    };

    fetchVideos();
  }, []); // Empty dependency array means this effect runs once on mount

  // Display Loading State
  if (loading) {
    return (
      <div className="loading-container">
        {/* You can use a more sophisticated spinner/skeleton loader here */}
        <div className="loading-spinner"></div>
        <p>Loading videos...</p>
      </div>
    );
  }

  // Display Error State
  if (error) {
    return (
      <div className="error-container">
        <h2>Oops! Something went wrong.</h2>
        <p>{error}</p>
        {/* Optionally add a retry button */}
        {/* <button onClick={fetchVideos}>Try Again</button> */}
      </div>
    );
  }

  // Display Content (Video Grid)
  return (
    <div className="home-container">
      {/* You might add filter chips or other elements here later */}
      {/* <div className="filter-chips">...</div> */}

      <div className="videos-grid">
        {videos.map((video) => (
          <VideoCard key={video.id} video={video} isRelated={false} />
        ))}
      </div>
      {/* No specific styles needed here as they are in App.css */}
    </div>
  );
};

export default Home;
