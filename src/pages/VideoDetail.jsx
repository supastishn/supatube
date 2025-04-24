import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import VideoCard from '../components/VideoCard'; // Assuming VideoCard component
import { formatDistanceToNowStrict, parseISO } from 'date-fns'; // For time ago formatting
import { Fragment } from 'react'; // Import Fragment if needed for structure
import { useAuth } from '../context/AuthContext'; // Import useAuth
import { toggleLikeDislike } from '../lib/likesService'; // Import the new service

// Appwrite Imports
import { databases, storage, avatars as appwriteAvatars, account } from '../lib/appwriteConfig';
import { appwriteConfig } from '../lib/appwriteConfig';
import { Query } from 'appwrite'; // Import Query

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
        return "some time ago"; // Fallback
    }
}

const VideoDetail = () => {
  const { id: videoId } = useParams(); // Get video ID from URL parameter
  const { user: currentUser } = useAuth(); // Get current user
  const navigate = useNavigate(); // For redirecting to sign-in

  const [video, setVideo] = useState(null);
  const [relatedVideos, setRelatedVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showFullBio, setShowFullBio] = useState(false); // Renamed state

  // --- Add new state variables ---
  const [likeCount, setLikeCount] = useState(0);
  const [dislikeCount, setDislikeCount] = useState(0); // Track it even if not displayed
  const [userLikeStatus, setUserLikeStatus] = useState(null); // 'liked', 'disliked', or null
  const [isLiking, setIsLiking] = useState(false); // Loading state for like/dislike actions
  const [likeError, setLikeError] = useState(''); // Specific error for like/dislike actions
  const [loadingCounts, setLoadingCounts] = useState(true); // Separate loading for counts
  
  // Handle like/dislike button clicks
  // Handle like/dislike button clicks
  const handleLikeDislike = useCallback(async (action) => {
    // If not logged in, redirect to sign in
    if (!currentUser) {
      // Pass the intended return path correctly
      navigate('/sign-in', { state: { from: { pathname: `/videos/${videoId}` } } });
      return;
    }

    if (isLiking) return; // Prevent multiple clicks
    setIsLiking(true);
    setLikeError(''); // Clear previous like errors

    // --- Store previous state for rollback ---
    const previousStatus = userLikeStatus;
    const previousLikeCount = likeCount;
    const previousDislikeCount = dislikeCount;

    // --- Perform Optimistic Update ---
    let optimisticStatus = null;
    let optimisticLikeChange = 0;
    let optimisticDislikeChange = 0;

    if (action === 'like') {
      if (previousStatus === 'liked') { // Toggling like off
        optimisticStatus = null; optimisticLikeChange = -1;
      } else { // Liking (or changing from dislike)
        optimisticStatus = 'liked'; optimisticLikeChange = 1;
        if (previousStatus === 'disliked') { optimisticDislikeChange = -1; }
      }
    } else { // action === 'dislike'
      if (previousStatus === 'disliked') { // Toggling dislike off
        optimisticStatus = null; optimisticDislikeChange = -1;
      } else { // Disliking (or changing from like)
        optimisticStatus = 'disliked'; optimisticDislikeChange = 1;
        if (previousStatus === 'liked') { optimisticLikeChange = -1; }
      }
    }

    // Apply optimistic updates to UI state immediately
    setUserLikeStatus(optimisticStatus);
    setLikeCount(prev => Math.max(0, prev + optimisticLikeChange));
    setDislikeCount(prev => Math.max(0, prev + optimisticDislikeChange));

    // --- Call Backend ---
    try {
      const result = await toggleLikeDislike(videoId, action);
      // Success! Backend confirmed. Optimistic update was likely correct.
      console.log('Like/Dislike function success:', result);
      // Optionally update status definitively from result if needed
      // setUserLikeStatus(result.newStatus);

    } catch (error) {
      console.error(`Failed to ${action} video:`, error);
      // --- FAILURE: Revert UI state ---
      setUserLikeStatus(previousStatus);
      setLikeCount(previousLikeCount);
      setDislikeCount(previousDislikeCount);
      setLikeError(error.message || `Failed to update ${action} status.`);
    } finally {
      setIsLiking(false); // Re-enable buttons
    }
  }, [currentUser, videoId, isLiking, userLikeStatus, likeCount, dislikeCount, navigate, setUserLikeStatus, setLikeCount, setDislikeCount, setLikeError, setIsLiking]);

  // Debug log to verify the function exists before rendering
  console.log('Is handleLikeDislike defined before render?', typeof handleLikeDislike);

  useEffect(() => {
    const fetchVideoData = async () => {
      // Reset all states related to the video
      setLoading(true);
      setLoadingCounts(true); // Also start counts loading
      setError(null);
      setLikeError('');
      setVideo(null); // Reset video state
      setRelatedVideos([]); // Reset related videos
      setLikeCount(0);
      setDislikeCount(0);
      setUserLikeStatus(null); // Reset user status on new video load
      setShowFullBio(false);

      try {
        // --- Fetch Video Document from Appwrite ---
        const doc = await databases.getDocument(
          appwriteConfig.databaseId,
          appwriteConfig.videosCollectionId,
          videoId
        );

        // --- Generate Video URL from Storage (using 'video_id') ---
        let videoStreamUrl = '';
        if (doc.video_id) { // Use video_id attribute name
          try {
            // Use getFileView for direct streaming URL
            // Use getFileDownload if getFileView isn't working as expected or for explicit download trigger
            // For streaming, getFileView is generally preferred if permissions allow public read.
            // Let's stick with getFileView for now.
            videoStreamUrl = storage.getFileView( // Or getFileDownload
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

        // Note: like/dislike counts are now fetched separately

        // --- Generate Thumbnail URL using thumbnail_id ---
        let thumbnailUrl = 'https://via.placeholder.com/640x360?text=No+Thumb'; // Default fallback
        console.log(`[DetailThumb/${videoId}] Checking doc.thumbnail_id:`, doc.thumbnail_id); // Log the ID attribute
        if (doc.thumbnail_id) { // Use thumbnail_id attribute name
          try {
            thumbnailUrl = storage.getFilePreview(
              appwriteConfig.storageVideosBucketId,
              doc.thumbnail_id // Use the thumbnail file ID
            ).href; // Get the URL string
            console.log(`[DetailThumb/${videoId}] Using generated thumbnail URL.`);
          } catch (thumbError) {
            console.error(`[DetailThumb/${videoId}] Error generating thumbnail preview URL:`, thumbError);
          }
        } else {
            console.log(`[DetailThumb/${videoId}] Using fallback thumbnail.`);
        }

        // --- Determine Creator ID ---
        let creatorId = null;
        
        // Find the user ID with delete permission (usually the creator) from permissions
        console.log(`[Detail/${videoId}] Permissions:`, doc.$permissions);
        const permissions = doc.$permissions || [];
        const deletePermissionRegex = /^delete\("user:(.+)"\)$/; // Regex to extract user ID

        for (const perm of permissions) {
            const match = perm.match(deletePermissionRegex);
            if (match && match[1]) {
                creatorId = match[1];
                break;
            }
        }

        console.log(`[Detail/${videoId}] Creator ID from permissions:`, creatorId);

        // If creatorId wasn't found via permissions, try the denormalized attribute as a fallback
        if (!creatorId && doc.creatorId) {
             creatorId = doc.creatorId;
             console.log(`[Detail/${videoId}] Creator ID from doc.creatorId fallback:`, creatorId);
        }

        // --- Initialize Channel Info (using denormalized data as initial fallback) ---
        let creatorName = doc.channelName || 'Unknown Channel'; // Name from video doc
        let channelAvatarUrl = doc.channelProfileImageUrl || null; // Avatar from video doc
        let creatorBio = ''; // Initialize bio
        let creatorAccountNameFallback = null; // To store name from account.get if needed

        // If a creatorId was determined, attempt to fetch the user's real name and avatar pref
        if (creatorId) {
            console.log(`[Detail/${videoId}] Attempting to fetch account details from DB for creatorId: ${creatorId}`);
            // --- PRIMARY: Fetch account details (name, bio, profileImageUrl) from 'accounts' collection ---
            try {
               const accountDetailsDoc = await databases.getDocument(
                 appwriteConfig.databaseId,
                 appwriteConfig.accountsCollectionId,
                 creatorId
               );
               console.log(`[Detail/${videoId}] Fetched account details document:`, accountDetailsDoc);
               creatorName = accountDetailsDoc.name || creatorName; // Prioritize name from DB doc
               creatorBio = accountDetailsDoc.bio || ''; // Get bio from DB doc
               // Use DB profile image URL if available and no video-specific denormalized one exists
               if (accountDetailsDoc.profileImageUrl && !channelAvatarUrl) {
                 channelAvatarUrl = accountDetailsDoc.profileImageUrl;
                 console.log(`[Detail/${videoId}] Using profile image URL from accounts collection: ${channelAvatarUrl}`);
               }
               console.log(`[Detail/${videoId}] Channel name set from DB doc: '${creatorName}'`);
            } catch (detailsError) {
               if (detailsError.code === 404) {
                 console.warn(`[Detail/${videoId}] No account details document found for creator ${creatorId}. Falling back.`);
                 // FALLBACK: Try fetching the core Appwrite account name if DB doc fails
                 try {
                   const creatorAccount = await account.get(creatorId);
                   creatorAccountNameFallback = creatorAccount.name;
                   creatorName = creatorAccountNameFallback || creatorName; // Use core account name as fallback
                   console.log(`[Detail/${videoId}] Channel name set from account.get fallback: '${creatorName}'`);
                 } catch (accountGetError) {
                   console.warn(`[Detail/${videoId}] Could not fetch core account details for creator ${creatorId}:`, accountGetError);
                 }
               } else {
                 console.warn(`[Detail/${videoId}] Error fetching account details document for creator ${creatorId}:`, detailsError);
               }
            }
        } else {
            // Could not determine Creator ID
        }

        // Final Avatar Fallback: Generate initials if no specific URL was found/fetched
        if (!channelAvatarUrl) {
            let initialBase = '?'; // Default fallback identifier

            if (creatorName && creatorName !== 'Unknown Channel') {
                initialBase = creatorName; // Prioritize name if available and not default
            } else if (creatorId) {
                initialBase = creatorId; // Fallback to creatorId if name is unavailable/default
            }

            try {
                channelAvatarUrl = appwriteAvatars.getInitials(initialBase).href;
            } catch (avatarError) {
                // Error generating avatar
                // Keep channelAvatarUrl as null or set a default placeholder if needed
                channelAvatarUrl = 'https://via.placeholder.com/48?text=ERR'; // Basic error placeholder
            }
        }

        // --- Map Appwrite data to video state object ---
        const fetchedVideo = {
          id: doc.$id,
          title: doc.title || 'Untitled Video',
          description: doc.description || 'No description available.', // Keep original video description
          videoStreamUrl: videoStreamUrl, // The actual video stream URL
          thumbnailUrl: thumbnailUrl,     // The thumbnail URL (for poster/related)
          viewCount: doc.viewCount || 0,
          uploadedAt: doc.$createdAt,    // Use Appwrite's creation timestamp
          channel: {
            // Adjust attribute names based on your Appwrite collection schema
            id: creatorId || `channel-${doc.$id}`, // Use creatorId if available, else fallback
            name: creatorName, // Use name fetched via DB or fallback
            subscriberCount: doc.subscriberCount || 0, // Use denormalized count
            profileImageUrl: channelAvatarUrl, // Use determined avatar URL
            bio: creatorBio, // Use bio fetched via DB or fallback ''
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
        setLoading(false); // Stop overall loading (counts might still be loading)
      }
    };

    fetchVideoData();
  }, [videoId]); // Re-run effect when videoId changes

  // --- New effect to fetch like/dislike counts ---
  useEffect(() => {
    if (!videoId) return; // Don't run if videoId isn't set

    const fetchCounts = async () => {
      setLoadingCounts(true); // Start count-specific loading
      try {
        // Use videoId as the document ID for video_counts
        const countsDoc = await databases.getDocument(
          appwriteConfig.databaseId,
          appwriteConfig.videoCountsCollectionId,
          videoId
        );
        setLikeCount(countsDoc.likeCount || 0);
        setDislikeCount(countsDoc.dislikeCount || 0);
      } catch (err) {
        if (err.code === 404) {
          // Video has no counts document yet (no likes/dislikes)
          setLikeCount(0);
          setDislikeCount(0);
          console.log(`Counts document not found for video ${videoId}, defaulting to 0.`);
        } else {
          console.error("Failed to fetch video counts:", err);
          // Optionally set an error state specific to counts
          setLikeCount(0); // Default to 0 on error too
          setDislikeCount(0);
        }
      } finally {
        setLoadingCounts(false); // Stop count-specific loading
      }
    };

    fetchCounts();
  }, [videoId]); // Re-run when videoId changes

  // --- Effect to fetch user's like status ---
  useEffect(() => {
    // Fetch like status only if video data is loaded and user is logged in
    if (videoId && currentUser?.$id) {
      const fetchUserLikeStatus = async () => {
        try {
          const response = await databases.listDocuments(
            appwriteConfig.databaseId,
            appwriteConfig.likesCollectionId,
            [
              Query.equal('userId', currentUser.$id),
              Query.equal('videoId', videoId),
              Query.limit(1) // We only need one record max
            ]
          );

          if (response.documents.length > 0) {
            setUserLikeStatus(response.documents[0].type); // 'like' or 'dislike'
          } else {
            setUserLikeStatus(null); // No record found
          }
        } catch (err) {
          // Handle common errors like collection not found during setup
          if (err.code === 404 && err.message.includes('Collection')) {
             console.warn("Like status check failed: 'likes' collection not found. Did you deploy it?");
          } else {
             console.error("Failed to fetch user's like status:", err);
          }
          // Don't set page error, just log it. Lack of status isn't page-breaking.
          setUserLikeStatus(null);
        }
      };

      fetchUserLikeStatus();
    } else {
      // If user logs out or videoId changes, reset status
      setUserLikeStatus(null);
    }
  }, [videoId, currentUser]); // Re-run when video or user changes

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

  // Prepare bio display
  const bioLines = (video.channel.bio || '').split('\n'); // Use bio from channel object
  const showBioToggleButton = bioLines.length > 3 && video.channel.bio.length > 150; // Show toggle if long enough
  const displayedBio = showFullBio ? video.channel.bio : bioLines.slice(0, 3).join('\n');

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
            {/* --- Updated Action Buttons --- */}
            <div className="video-actions">
              {/* Like Button */}
              <button
                className={`video-action-btn like-btn ${userLikeStatus === 'like' ? 'active' : ''}`}
                onClick={() => {
                  console.log('Like button clicked, handleLikeDislike exists?', typeof handleLikeDislike);
                  if (typeof handleLikeDislike === 'function') {
                    handleLikeDislike('like');
                  } else {
                    console.error('handleLikeDislike is not a function!', handleLikeDislike);
                  }
                }}
                disabled={isLiking || loadingCounts} // Disable while liking or fetching counts
                aria-pressed={userLikeStatus === 'like'}
                title={userLikeStatus === 'like' ? 'Unlike' : 'I like this'}
              >
                <svg viewBox="0 0 24 24" height="20" width="20" fill="currentColor">
                  <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-1.91l-.01-.01L23 10z"></path>
                </svg>
                {/* Display updated likeCount state */}
                <span>{loadingCounts ? '...' : formatViews(likeCount)}</span>
              </button>

              {/* Dislike Button */}
              <button
                className={`video-action-btn dislike-btn ${userLikeStatus === 'dislike' ? 'active' : ''}`}
                onClick={() => {
                  console.log('Dislike button clicked, handleLikeDislike exists?', typeof handleLikeDislike);
                  if (typeof handleLikeDislike === 'function') {
                    handleLikeDislike('dislike');
                  } else {
                    console.error('handleLikeDislike is not a function!', handleLikeDislike);
                  }
                }}
                disabled={isLiking || loadingCounts} // Disable while liking or fetching counts
                aria-pressed={userLikeStatus === 'dislike'}
                title={userLikeStatus === 'dislike' ? 'Remove dislike' : 'I dislike this'}
              >
                 <svg viewBox="0 0 24 24" height="20" width="20" fill="currentColor">
                   <path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v1.91l.01.01L1 14c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z"></path>
                </svg>
                {/* Optionally display dislike count */}
                {/* <span>{formatViews(dislikeCount)}</span> */}
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
          {/* Display Like/Dislike Error */}
          {likeError && <p className="like-error-message">{likeError}</p>}
        </div>

        {/* Channel Info and Description Box */}
        <div className="channel-description-box">
            <div className="channel-header">
                <Link to={`/profile/${video.channel.creatorUserId || 'unknown-user'}`} className="channel-avatar-link"> {/* Link the avatar */}
                    <img
                      src={video.channel.profileImageUrl}
                      alt={`${video.channel.name} avatar`}
                      className="channel-avatar"
                    />
                </Link>
                <div className="channel-details">
                    <Link to={`/profile/${video.channel.creatorUserId || 'unknown-user'}`} className="channel-name-link">
                        {video.channel.name}
                    </Link>
                    <p className="channel-subscribers">{formatViews(video.channel.subscriberCount)} subscribers</p>
                </div>
                {/* TODO: Add dynamic Subscribe button state */}
                <button className="subscribe-btn">Subscribe</button>
            </div>

            {/* Video Description */}
            <div className="video-description">
                <p style={{ whiteSpace: 'pre-wrap' }}>{displayedBio || 'No bio available.'}</p>
                {showBioToggleButton && (
                    <button
                        className="description-toggle-btn"
                        onClick={() => setShowFullBio(!showFullBio)}
                    >
                        {showFullBio ? 'Show less' : 'Show more'}
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
