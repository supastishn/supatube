import { useState, useEffect } from 'react';
import VideoCard from '../components/VideoCard'; // Assuming VideoCard component is in ../components

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
        // --- Replace this block with your actual API call ---
        await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate network delay
        
        // Example: Check for a specific condition to simulate an error
        // if (Math.random() > 0.8) {
        //   throw new Error("Failed to fetch videos. Please try again later.");
        // }

        // Simulated video data (replace with actual fetched data)
        const simulatedData = Array.from({ length: 16 }, (_, index) => ({
          id: `sim-video-${index + 1}`,
          title: `React Hooks Tutorial #${index + 1}: Mastering useState & useEffect Like a Pro`,
          thumbnailUrl: `https://picsum.photos/seed/${100 + index}/320/180`, // Using picsum for random images
          durationSeconds: Math.floor(Math.random() * 1200) + 60, // Random duration between 1 min and 21 mins
          viewCount: Math.floor(Math.random() * 2000000) + 1000, // Random views
          uploadedAt: new Date(Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000).toISOString(), // Random date within last 30 days
          channel: {
            id: `sim-channel-${Math.floor(index / 4) + 1}`,
            name: `Awesome Dev Channel ${Math.floor(index / 4) + 1}`,
            profileImageUrl: `https://i.pravatar.cc/48?u=channel${Math.floor(index / 4) + 1}`
          }
        }));
        // --- End of simulation block ---

        setVideos(simulatedData); // Set fetched data
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
        <style jsx>{`
          .loading-container {
            display: flex;
            flex-direction: column; /* Stack spinner and text */
            justify-content: center;
            align-items: center;
            min-height: calc(100vh - var(--header-height) - 48px); /* Fill available height */
            text-align: center;
            color: var(--text-secondary);
          }
          .loading-spinner {
            width: 40px;
            height: 40px;
            border: 4px solid var(--light-gray);
            border-top: 4px solid var(--primary);
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-bottom: 16px; /* Space between spinner and text */
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
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
        <style jsx>{`
          .error-container {
            padding: 40px 20px;
            text-align: center;
            color: var(--primary);
            background-color: #fff0f0; /* Light red background */
            border: 1px solid var(--primary-light);
            border-radius: 8px;
            margin: 20px;
          }
          .error-container h2 {
            margin-bottom: 10px;
          }
          .error-container p {
            color: var(--text-secondary);
            margin-bottom: 20px;
          }
        `}</style>
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
