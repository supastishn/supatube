import { useParams, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import VideoCard from '../components/VideoCard'; // Assuming VideoCard component
import { formatDistanceToNowStrict, parseISO } from 'date-fns'; // For time ago formatting
import { Fragment } from 'react'; // Import Fragment if needed for structure

// Appwrite Imports
import { databases, storage, avatars as appwriteAvatars, account } from '../lib/appwriteConfig';
import { appwriteConfig } from '../lib/appwriteConfig';

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
    if (!dateString) return "some time ago"; // Handle null/undefined dates
    try {
        // Use parseISO to convert Appwrite's ISO string to a Date object
        return formatDistanceToNowStrict(parseISO(dateString), { addSuffix: true });
    } catch (e) {
        console.error("Error formatting date:", e, "Input:", dateString); // Log input on error
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
    const fetchVideoData = async () => {
      setLoading(true);
      setError(null);
      setVideo(null); // Reset video state
      setRelatedVideos([]); // Reset related videos

      try {
        // --- Fetch Video Document from Appwrite ---
        const doc = await databases.getDocument(
          appwriteConfig.databaseId,
          appwriteConfig.videosCollectionId,
          videoId
        );
        
        console.log("Document Permissions:", doc.$permissions);

        // --- Get Creator/Channel Info ---
        // NOTE: Assumes relevant channel info (name, subscriber count, profile image URL, creator ID)
        // is denormalized and stored *within* the video document itself.
        // Client-side fetching of arbitrary user details by ID is generally restricted.
        // --> We rely on the 'creatorId' attribute being correctly set on the document during upload. <--

        // --- Generate Video URL from Storage (using 'video_id') ---
        let videoStreamUrl = '';
        if (doc.video_id) { // Use video_id attribute name
          try {
            // Use getFileView for direct streaming URL
            videoStreamUrl = storage.getFileView(
              appwriteConfig.storageVideosBucketId,
              doc.video_id // Use the video file ID
            ); // Get the URL string
          } catch (fileError) {
            setError("Could not load video file.");
            // Optionally stop loading here if video is critical
          }
        } else {
          setError("Video file information missing.");
          // Optionally stop loading
        }

        // --- Generate Thumbnail URL (using 'thumbnail_id') ---
        let thumbnailUrl = 'https://via.placeholder.com/640x360?text=No+Thumb'; // Default fallback
        if (doc.thumbnail_id) { // Use thumbnail_id attribute name
          try {
            // Use getFilePreview for thumbnail image
            thumbnailUrl = storage.getFilePreview(
              appwriteConfig.storageVideosBucketId,
              doc.thumbnail_id // Use the thumbnail file ID
            ).href; // Get the URL string
          } catch (thumbError) {
            // Keep the default fallback if preview generation fails
          }
        }

        // --- Determine Channel Avatar & Creator ID ---
        let creatorId = null;
        let creatorName = doc.channelName || 'Unknown Channel'; // Default to denormalized name
        let channelAvatarUrl = doc.channelProfileImageUrl || null; // Default to denormalized URL

        // Find the user ID with delete permission (usually the creator) from permissions
        const permissions = doc.$permissions || [];
        const deletePermissionRegex = /^delete\("user:(.+)"\)$/; // Regex to extract user ID

        for (const perm of permissions) {
            const match = perm.match(deletePermissionRegex);
            if (match && match[1]) {
                creatorId = match[1];
                console.log("Found Creator ID from permissions:", creatorId);
                break;
            }
        }

        // If creatorId wasn't found via permissions, try the denormalized attribute as a fallback
        if (!creatorId && doc.creatorId) {
             creatorId = doc.creatorId;
             console.log("Using fallback creatorId from document attribute:", creatorId);
        }

        // If a creatorId was determined, attempt to fetch the user's real name and avatar pref
        if (creatorId) {
            try {
                // Attempt to get the user account associated with the creatorId
                // NOTE: This requires read permission for 'users' or specific user for the client
                const creatorAccount = await account.get(creatorId);
                creatorName = creatorAccount.name || creatorName; // Use fetched name if available
                console.log("Fetched creator account:", creatorAccount.name);

                // Check if a custom profile image URL is stored in user preferences
                // Assuming prefs structure like { profileImageUrl: '...' }
                const prefs = creatorAccount.prefs || {};
                if (prefs.profileImageUrl && !channelAvatarUrl) { // Prioritize denormalized URL if it exists
                   channelAvatarUrl = prefs.profileImageUrl;
                   console.log("Using avatar from user preferences.");
                }

            } catch (userFetchError) {
                // Log error only if it's not a standard permission error (optional)
                if (userFetchError.code !== 401 && userFetchError.code !== 403) {
                   console.error("Failed to fetch creator details:", userFetchError);
                } else {
                   console.warn(`Could not fetch details for user ${creatorId} (permissions?). Falling back to stored data.`);
                }
                // Fallback to denormalized data (already set as defaults)
            }
        } else {
            console.log("Could not determine Creator ID from permissions or attribute.");
        }

        // Final Avatar Fallback: Generate initials if no URL was found
        if (!channelAvatarUrl) {
            let initialBase;
            if (creatorName !== 'Unknown Channel') {
                initialBase = creatorName; // Use name if available
            } else if (creatorId) {
                initialBase = creatorId; // Fallback to creatorId if name is unknown but ID exists
            } else {
                initialBase = '?'; // Last resort if both name and ID are unknown
            }
            channelAvatarUrl = appwriteAvatars.getInitials(initialBase).href;
            console.log("Generating avatar from initials using base:", initialBase);
        }

        // --- Map Appwrite data to video state object ---
        const fetchedVideo = {
          id: doc.$id,
          title: doc.title || 'Untitled Video',
          description: doc.description || 'No description available.',
          videoStreamUrl: videoStreamUrl, // The actual video stream URL
          thumbnailUrl: thumbnailUrl,     // The thumbnail URL (for poster/related)
          viewCount: doc.viewCount || 0,
          likeCount: doc.likeCount || 0, // Assuming 'likeCount' attribute exists
          uploadedAt: doc.$createdAt,    // Use Appwrite's creation timestamp
          channel: {
            // Adjust attribute names based on your Appwrite collection schema
            id: doc.channelId || (creatorId ? `user-${creatorId}` : `channel-${doc.$id}`), // Prioritize creatorId for fallback ID
            name: creatorName, // Use extracted name
            subscriberCount: doc.subscriberCount || 0, // Use denormalized count
            profileImageUrl: channelAvatarUrl, // Use determined avatar URL
            creatorUserId: creatorId // Explicitly store the creator's User ID
          },
          // Add other fields from 'doc' as needed
        };

        setVideo(fetchedVideo);

        // --- Fetch Related Videos (Keep simulation for now or implement later) ---
        // TODO: Replace with actual related videos fetch logic (e.g., based on tags, channel)
        const simulatedRelated = Array.from({ length: 5 }, (_, i) => ({
           id: `sim-rel-${i}`, title: `Related Video ${i+1}`, thumbnailUrl: `https://picsum.photos/seed/related${i}/168/94`,
           durationSeconds: 300+i*30, viewCount: 1000+i*500, uploadedAt: new Date().toISOString(), channel: { name: 'Related Channel', profileImageUrl: `https://i.pravatar.cc/48?u=rel${i}` }
        }));
        setRelatedVideos(simulatedRelated);

      } catch (err) {
        // Handle specific errors like Not Found (404)
        if (err.code === 404) {
          setError("Video not found.");
        } else {
          setError(err.message || "Could not load video details.");
        }
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
      </div>
    );
  }

  if (error) {
     return ( /* Use same error style as Home */
      <div className="error-container">
        <h2>Error Loading Video</h2>
        <p>{error}</p>
        <Link to="/" className="btn-primary">Go Home</Link>
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
          {video.videoStreamUrl ? (
            <video
              key={video.id} // Add key to help React re-render if src changes
              src={video.videoStreamUrl} // Use the fetched Appwrite video URL
              controls // Show native player controls
              poster={video.thumbnailUrl} // Use the fetched Appwrite thumbnail URL
              preload="metadata" // Hint browser to load dimensions, duration etc.
              className="video-player" // Apply existing styling
              width="100%" // Ensure responsiveness
              height="auto"
              // Consider adding playsInline for mobile browsers
            >
              Your browser does not support the video tag.
            </video>
          ) : (
            // Display a placeholder or error if the video URL couldn't be generated
            <div className="video-player-error">
              Video playback is unavailable.
            </div>
          )}
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
                <a href="#" className="channel-avatar-link">
                    <img
                      src={video.channel.profileImageUrl}
                      alt={`${video.channel.name} avatar`}
                      className="channel-avatar"
                    />
                </a>
                <div className="channel-details">
                    <a href="#" className="channel-name-link">
                        {video.channel.name}
                    </a>
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

    </div>
  );
};

export default VideoDetail;
