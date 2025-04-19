import { useParams, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import VideoCard from '../components/VideoCard'; // Assuming VideoCard component
import { formatDistanceToNowStrict } from 'date-fns'; // For time ago formatting
import { format } from 'date-fns'; // For exact date formatting

// Helper function to format view counts (e.g., 1.2M, 10K)
const formatViews = (views) => {
  if (isNaN(views) || views < 0) return '0';
  if (views >= 1000000) {
    return (views / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (views >= 1000) {
    return (views / 1000).toFixed(views >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K';
  }
  return views.toString();
};

// Helper function to format date (e.g., 2 weeks ago)
const formatTimeAgo = (dateString) => {
    try {
        return formatDistanceToNowStrict(new Date(dateString), { addSuffix: true });
    } catch (e) {
        console.error("Error formatting date:", e);
        return "some time ago"; // Fallback
    }
}

const VideoDetail = () => {
  const { id: videoId } = useParams(); // Get video ID from URL parameter
  const [video, setVideo] = useState(null);
  const [relatedVideos, setRelatedVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showFullDescription, setShowFullDescription] = useState(false);

  useEffect(() => {
    // Simulate API call to fetch video details and related videos
    const fetchVideoData = async () => {
      setLoading(true);
      setError(null);
      try {
        // --- Replace with actual API calls ---
        await new Promise(resolve => setTimeout(resolve, 800)); // Simulate delay

        // Simulate fetching main video data
        const simulatedVideo = {
          id: videoId,
          title: `React Router v6 Tutorial - useParams Hook Explained (${videoId})`,
          description: `Learn all about the useParams hook in React Router v6!\n\nIn this video, we cover:\n- How to access dynamic URL parameters.\n- Practical examples and use cases.\n- Common pitfalls and best practices.\n\nPerfect for beginners and intermediate React developers looking to master routing.\n\n#React #ReactRouter #WebDevelopment #Tutorial`,
          // Use a real embeddable video for testing if possible
          videoUrl: `https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1`, // Example (Rick Astley :))
          viewCount: Math.floor(Math.random() * 5000000) + 10000,
          likeCount: Math.floor(Math.random() * 100000) + 500,
          uploadedAt: new Date(Date.now() - Math.floor(Math.random() * 90) * 24 * 60 * 60 * 1000).toISOString(),
          channel: {
            id: `sim-channel-${Math.floor(Math.random() * 5) + 1}`,
            name: `Coding Tutorials ${Math.floor(Math.random() * 5) + 1}`,
            profileImageUrl: `https://i.pravatar.cc/100?u=channel${Math.floor(Math.random() * 5) + 1}`,
            subscriberCount: Math.floor(Math.random() * 1000000) + 10000
          }
        };
        setVideo(simulatedVideo);

        // Simulate fetching related videos
        const simulatedRelated = Array.from({ length: 10 }, (_, index) => ({
          id: `related-${videoId}-${index + 1}`,
          title: `Related React Concept ${index + 1}: State Management`,
          thumbnailUrl: `https://picsum.photos/seed/${videoId}${300 + index}/168/94`,
          durationSeconds: Math.floor(Math.random() * 900) + 60,
          viewCount: Math.floor(Math.random() * 500000) + 500,
          uploadedAt: new Date(Date.now() - Math.floor(Math.random() * 60) * 24 * 60 * 60 * 1000).toISOString(),
          channel: {
            id: `sim-channel-${Math.floor(Math.random() * 5) + 1}`,
            name: `Another Dev Channel ${Math.floor(Math.random() * 5) + 1}`,
            profileImageUrl: `https://i.pravatar.cc/48?u=channelRel${Math.floor(Math.random() * 5) + 1}`
          }
        }));
        setRelatedVideos(simulatedRelated);
        // --- End of simulation ---

      } catch (err) {
        console.error("Error fetching video data:", err);
        setError(err.message || "Failed to load video details.");
      } finally {
        setLoading(false);
      }
    };

    fetchVideoData();
    // Reset description visibility when video ID changes
    setShowFullDescription(false);
  }, [videoId]); // Re-run effect when videoId changes

  // --- Render States ---

  if (loading) {
    return (
      <div className="loading-container"> {/* Use same loading style as Home */}
        <div className="loading-spinner"></div>
        <p>Loading video...</p>
         <style jsx>{`
          /* Simplified inline style for loader */
          .loading-container { display: flex; flex-direction: column; justify-content: center; align-items: center; min-height: 60vh; color: var(--text-secondary); }
          .loading-spinner { width: 40px; height: 40px; border: 4px solid var(--light-gray); border-top: 4px solid var(--primary); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 16px; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (error) {
     return ( /* Use same error style as Home */
      <div className="error-container">
        <h2>Error Loading Video</h2>
        <p>{error}</p>
        <Link to="/" className="btn-primary">Go Home</Link>
         <style jsx>{`
          .error-container { padding: 40px 20px; text-align: center; color: var(--primary); background-color: #fff0f0; border: 1px solid var(--primary-light); border-radius: 8px; margin: 20px; }
          .error-container h2 { margin-bottom: 10px; }
          .error-container p { color: var(--text-secondary); margin-bottom: 20px; }
          .btn-primary { display: inline-block; text-decoration: none; } /* Style for link button */
        `}</style>
      </div>
    );
  }

  if (!video) {
      return <div>Video not found.</div>; // Should ideally be handled by error state
  }

  // --- Successful Render ---

  // Prepare description display
  const descriptionLines = video.description.split('\n');
  const showToggleButton = descriptionLines.length > 3; // Show toggle if more than 3 lines
  const displayedDescription = showFullDescription ? video.description : descriptionLines.slice(0, 3).join('\n');

  return (
    <div className="video-detail-container">
      {/* Main Content Column */}
      <div className="video-content-column">
        {/* Video Player */}
        <div className="video-player-container">
          <iframe
            src={video.videoUrl}
            title={video.title}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="video-player"
          ></iframe>
        </div>

        {/* Video Info */}
        <div className="video-info">
          <h1 className="video-title">{video.title}</h1>
          <div className="video-stats-actions">
            {/* Views and Date */}
            <div className="video-views">
              {formatViews(video.viewCount)} views • {formatTimeAgo(video.uploadedAt)}
            </div>
            {/* Action Buttons */}
            <div className="video-actions">
              <button className="video-action-btn">
                <svg viewBox="0 0 24 24" height="20" width="20" fill="currentColor">
                  <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-1.91l-.01-.01L23 10z"></path>
                </svg>
                {formatViews(video.likeCount)}
              </button>
              {/* Dislike Button (Placeholder) */}
              <button className="video-action-btn">
                 <svg viewBox="0 0 24 24" height="20" width="20" fill="currentColor">
                   <path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v1.91l.01.01L1 14c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z"></path>
                </svg>
                {/* Dislike count often hidden */}
              </button>
              {/* Share Button (Placeholder) */}
              <button className="video-action-btn">
                 <svg viewBox="0 0 24 24" height="20" width="20" fill="currentColor">
                   <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"></path>
                </svg>
                Share
              </button>
              {/* Save Button (Placeholder) */}
              <button className="video-action-btn">
                 <svg viewBox="0 0 24 24" height="20" width="20" fill="currentColor">
                    <path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z"></path>
                 </svg>
                Save
              </button>
            </div>
          </div>
        </div>

        {/* Channel Info and Description Box */}
        <div className="channel-description-box">
            <div className="channel-header">
                <Link to={`/channel/${video.channel.id}`} className="channel-avatar-link">
                    <img
                      src={video.channel.profileImageUrl}
                      alt={`${video.channel.name} avatar`}
                      className="channel-avatar"
                    />
                </Link>
                <div className="channel-details">
                    <Link to={`/channel/${video.channel.id}`} className="channel-name-link">
                        {video.channel.name}
                    </Link>
                    <p className="channel-subscribers">{formatViews(video.channel.subscriberCount)} subscribers</p>
                </div>
                {/* TODO: Add dynamic Subscribe button state */}
                <button className="subscribe-btn">Subscribe</button>
            </div>

            {/* Video Description */}
            <div className="video-description">
                <p style={{ whiteSpace: 'pre-wrap' }}>{displayedDescription}</p>
                {showToggleButton && (
                    <button
                        className="description-toggle-btn"
                        onClick={() => setShowFullDescription(!showFullDescription)}
                    >
                        {showFullDescription ? 'Show less' : 'Show more'}
                    </button>
                )}
            </div>
        </div>

        {/* TODO: Add Comments Section */}
        {/* <div className="comments-section"> ... </div> */}

      </div>

      {/* Related Videos Column */}
      <div className="related-videos-column">
        <h3 className="related-title">Up next</h3>
        <div className="related-list">
          {relatedVideos.map((relatedVideo) => (
            <VideoCard key={relatedVideo.id} video={relatedVideo} isRelated={true} />
          ))}
        </div>
      </div>

       {/* Inline styles specific to VideoDetail layout */}
       <style jsx>{`
          .video-content-column {
              /* Takes up the main space */
              min-width: 0; /* Prevent overflow */
          }
          .related-videos-column {
              /* Takes up the sidebar space */
              min-width: 0; /* Prevent overflow */
          }
          .video-player {
              position: absolute;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
          }
           .channel-description-box {
              background-color: var(--light-gray);
              border-radius: 12px;
              padding: 16px;
              margin-top: 16px;
           }
           .channel-name-link {
              text-decoration: none;
              color: var(--text);
              font-weight: 500;
              display: inline-block; /* Ensure hover works */
           }
           .channel-name-link:hover {
               /* Optional: add hover effect */
           }
           .video-description {
              margin-top: 12px; /* Space above description */
              font-size: 14px;
              line-height: 1.6;
           }
           .description-toggle-btn {
               background: none;
               border: none;
               color: var(--text-secondary);
               font-weight: 500;
               cursor: pointer;
               padding: 4px 0; /* Clickable area */
               margin-top: 8px;
               display: block; /* Full width */
           }
           .description-toggle-btn:hover {
               color: var(--text);
           }

           /* Responsive adjustments directly in component for simplicity */
           @media (max-width: 1024px) { /* Adjust breakpoint as needed */
               .video-detail-container {
                   grid-template-columns: 1fr; /* Stack columns */
               }
               .related-videos-column {
                   margin-top: 24px; /* Add space when stacked */
               }
               .related-list { /* Change related list to grid on stack */
                   display: grid;
                   grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                   gap: 16px;
               }
           }
       `}</style>
    </div>
  );
};

export default VideoDetail;
