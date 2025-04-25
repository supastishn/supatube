import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import VideoCard from '../components/VideoCard'; // Assuming VideoCard component
import { formatDistanceToNowStrict, parseISO } from 'date-fns'; // For time ago formatting
import { Fragment } from 'react'; // Import Fragment if needed for structure
import { useAuth } from '../context/AuthContext'; // Import useAuth
import { toggleLikeDislike } from '../lib/likesService'; // Import like service
import { toggleSubscription } from '../lib/subscriptionService'; // Import subscription service
import Comment from '../components/Comment'; // Add this
import { postComment, fetchCommentsForVideo } from '../lib/commentService'; // Add this
import { deleteVideo } from '../lib/videoService'; // Import video deletion function

// Appwrite Imports
import { databases, storage, avatars as appwriteAvatars, account, client } from '../lib/appwriteConfig';
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
  const { user: currentUser, updateUserLikeDislikeState } = useAuth(); // Get current user and like/dislike updater
  const navigate = useNavigate(); // For redirecting to sign-in

  const [video, setVideo] = useState(null);
  const [relatedVideos, setRelatedVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showFullBio, setShowFullBio] = useState(false); // Renamed state
  
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [commentsError, setCommentsError] = useState('');
  const [newCommentText, setNewCommentText] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [commentPostError, setCommentPostError] = useState('');
  // Add state for video comment count (optional, could read from video state)
  const [videoCommentCount, setVideoCommentCount] = useState(0);

  // --- Add new state variables ---
  const [likeCount, setLikeCount] = useState(0);
  const [dislikeCount, setDislikeCount] = useState(0); // Track it even if not displayed
  const [userLikeStatus, setUserLikeStatus] = useState(0); // 1 for liked, -1 for disliked, 0 for null
  const [isLiking, setIsLiking] = useState(false); // Loading state for like/dislike actions
  const [likeError, setLikeError] = useState(''); // Specific error for like/dislike actions
  const [loadingCounts, setLoadingCounts] = useState(true); // Separate loading for counts
  
  // --- Add subscription state variables ---
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriberCount, setSubscriberCount] = useState(0);
  const [loadingSubscription, setLoadingSubscription] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState('');
  const [loadingSubCount, setLoadingSubCount] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  
  // Handle like/dislike button clicks
  const handleLikeDislike = useCallback(async (action) => {
    if (!currentUser) {
      navigate('/sign-in', { state: { from: { pathname: `/videos/${videoId}` } } });
      return;
    }
    if (isLiking) return;

    setIsLiking(true);
    setLikeError('');

    // Store previous local count state for potential *count* rollback
    const previousLikeCount = likeCount;
    const previousDislikeCount = dislikeCount;

    // 1. Update AuthContext state IMMEDIATELY
    updateUserLikeDislikeState(videoId, action);

    // 2. Optimistically update LOCAL counts for UI feedback
    // This logic calculates the *change* caused by the current click
    if (action === 'like') {
        if (userLikeStatus === 1) { // Was liked, now toggling off
            setLikeCount(prev => Math.max(0, prev - 1));
        } else { // Was neutral or disliked, now liking
            setLikeCount(prev => prev + 1);
            if (userLikeStatus === -1) {
                setDislikeCount(prev => Math.max(0, prev - 1)); // Remove dislike count too
            }
        }
    } else { // action === 'dislike'
        if (userLikeStatus === -1) { // Was disliked, now toggling off
            setDislikeCount(prev => Math.max(0, prev - 1));
        } else { // Was neutral or liked, now disliking
            setDislikeCount(prev => prev + 1);
            if (userLikeStatus === 1) {
                setLikeCount(prev => Math.max(0, prev - 1)); // Remove like count too
            }
        }
    }

    // 3. Call Backend Service to RECORD the interaction for the cron job
    try {
      await toggleLikeDislike(videoId, action, currentUser.$id);
      console.log(`[VideoDetail] Interaction ${action} recorded successfully for video ${videoId}`);
      // No state updates needed here, client is already updated

    } catch (error) {
      console.error(`Failed to record ${action} interaction:`, error);
      // Revert optimistic LOCAL count updates ONLY if recording fails
      setLikeCount(previousLikeCount);
      setDislikeCount(previousDislikeCount);
      setLikeError(error.message || `Failed to record ${action}. Your preference is saved locally.`);
      // DO NOT revert the AuthContext state change.
    } finally {
      setIsLiking(false);
    }
  }, [currentUser, videoId, isLiking, userLikeStatus, likeCount, dislikeCount, navigate, updateUserLikeDislikeState, setIsLiking, setLikeError, setLikeCount, setDislikeCount]);

  // Video deletion handler
  const handleDeleteVideo = async () => {
    if (!video || !video.id || isDeleting) return;

    const confirmDelete = window.confirm("Are you sure you want to delete this video? This cannot be undone.");
    if (!confirmDelete) {
      return;
    }

    setIsDeleting(true);
    setDeleteError('');

    try {
      const result = await deleteVideo(video.id);
      console.log('Video deleted successfully:', result.message);
      // On success, navigate away (e.g., to home)
      alert('Video deleted successfully!'); // Simple feedback
      navigate('/'); // Redirect to home page
    } catch (error) {
      console.error('Failed to delete video:', error);
      setDeleteError(error.message || 'Could not delete the video. Please try again.');
      setIsDeleting(false); // Stop loading on error
    }
    // No finally needed as we navigate away on success
  };

  // Subscribe/unsubscribe toggle handler
  const handleSubscribeToggle = useCallback(async () => {
    if (!currentUser) {
      navigate('/sign-in', { state: { from: { pathname: `/videos/${videoId}` } } });
      return;
    }
    if (!video?.channel?.creatorUserId || loadingSubscription) {
      return; // No creator ID or already processing
    }

    const creatorId = video.channel.creatorUserId;
    const action = isSubscribed ? 'unsubscribe' : 'subscribe';
    const previousSubState = isSubscribed;
    const previousSubCount = subscriberCount;

    setLoadingSubscription(true);
    setSubscriptionError('');

    // Optimistic Update
    setIsSubscribed(!previousSubState);
    setSubscriberCount(prev => Math.max(0, prev + (action === 'subscribe' ? 1 : -1)));

    try {
      const result = await toggleSubscription(creatorId, action);
      // Optional: Update state definitively if needed, though optimistic is usually fine
      // setIsSubscribed(result.isSubscribed);
      console.log('Subscription toggle success:', result);
    } catch (error) {
      console.error('Subscription toggle failed:', error);
      // Revert optimistic updates
      setIsSubscribed(previousSubState);
      setSubscriberCount(previousSubCount);
      setSubscriptionError(error.message || 'Failed to update subscription.');
    } finally {
      setLoadingSubscription(false);
    }
  }, [currentUser, video?.channel?.creatorUserId, videoId, isSubscribed, subscriberCount, loadingSubscription, navigate]);

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
        // Set comment count from video doc if available (for display)
        setVideoCommentCount(doc.commentCount || 0); // Add this line

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
  
  // --- Effect to fetch comments ---
  const loadComments = useCallback(async () => {
    if (!videoId) return;
    setLoadingComments(true);
    setCommentsError('');
    try {
      const fetchedComments = await fetchCommentsForVideo(videoId);
      // Client-side sort (optional, backend already inserts newest first)
      // fetchedComments.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      setComments(fetchedComments);
    } catch (error) {
      console.error("Failed to fetch comments:", error);
      setCommentsError("Could not load comments. Please try again later.");
    } finally {
      setLoadingComments(false);
    }
  }, [videoId]); // Re-run when videoId changes

  useEffect(() => {
    loadComments();
  }, [loadComments]); // Depend on the memoized function

  // --- Effect to fetch video counts (likes, dislikes, comments) ---
  useEffect(() => {
    if (!videoId) return; // Don't run if videoId isn't set

    const fetchAllCounts = async () => {
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
        setVideoCommentCount(countsDoc.commentCount || 0); // Ensure this line is present
        console.log(`[Counts Effect] Fetched counts for ${videoId}:`, countsDoc);
      } catch (err) {
        if (err.code === 404) {
          // Video has no counts document yet (no likes/dislikes/comments)
          setLikeCount(0);
          setDislikeCount(0);
          setVideoCommentCount(0); // Ensure this is set to 0 on 404
          console.log(`[Counts Effect] Counts doc 404 for ${videoId}, defaulting to 0.`);
        } else {
          console.error("[Counts Effect] Failed to fetch video counts:", err);
          // Optionally set an error state specific to counts
          setLikeCount(0); // Default to 0 on error too
          setDislikeCount(0);
          setVideoCommentCount(0); // Ensure this is set to 0 on error
        }
      } finally {
        setLoadingCounts(false); // Stop count-specific loading
      }
    };

    fetchAllCounts();
  }, [videoId]); // Re-run when videoId changes

  // --- Effect to derive initial like status from user context ---
  useEffect(() => {
    console.log("[VideoDetail Effect] Deriving like status from user context.");
    if (currentUser && videoId) {
      // Safely access arrays, default to empty if they don't exist on the user object yet
      const liked = (currentUser.videosLiked || []).includes(videoId);
      const disliked = (currentUser.videosDisliked || []).includes(videoId);

      if (liked) {
        console.log(`[VideoDetail Effect] Video ${videoId} found in currentUser.videosLiked`);
        setUserLikeStatus(1);
      } else if (disliked) {
        console.log(`[VideoDetail Effect] Video ${videoId} found in currentUser.videosDisliked`);
        setUserLikeStatus(-1);
      } else {
        console.log(`[VideoDetail Effect] Video ${videoId} not found in liked/disliked arrays.`);
        setUserLikeStatus(0);
      }
    } else {
      // Not logged in or videoId not available yet
      console.log(`[VideoDetail Effect] User not logged in or videoId missing. Setting status to 0.`);
      setUserLikeStatus(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, videoId]); // Rerun when user data or videoId changes
  
  // --- Realtime updates subscription ---
  useEffect(() => {
    if (!videoId) return; // Don't subscribe if no video ID

    // --- Subscribe to Video Counts ---
    const countsCollection = `databases.${appwriteConfig.databaseId}.collections.${appwriteConfig.videoCountsCollectionId}.documents.${videoId}`;
    const countsUnsubscribe = client.subscribe(countsCollection, (response) => {
        console.log("Realtime Counts Update Received:", response.payload);
        // Update state based on payload, handle potential nulls gracefully
        setLikeCount(response.payload.likeCount ?? likeCount);
        setDislikeCount(response.payload.dislikeCount ?? dislikeCount);
        setVideoCommentCount(response.payload.commentCount ?? videoCommentCount);
    });
    console.log(`Realtime: Subscribed to ${countsCollection}`);

    // --- Subscribe to User Account (if logged in) ---
    let userUnsubscribe = null;
    if (currentUser?.$id) {
        const accountCollection = `databases.${appwriteConfig.databaseId}.collections.${appwriteConfig.accountsCollectionId}.documents.${currentUser.$id}`;
        userUnsubscribe = client.subscribe(accountCollection, (response) => {
            console.log("Realtime User Account Update Received:", response.payload);
            const liked = (response.payload.videosLiked || []).includes(videoId);
            const disliked = (response.payload.videosDisliked || []).includes(videoId);

            // Update the button state based on the latest arrays from the user document
            let newStatus = 0;
            if (liked) newStatus = 1;
            else if (disliked) newStatus = -1;

            if (newStatus !== userLikeStatus) { // Only update if changed
                console.log(`Realtime: Updating userLikeStatus from ${userLikeStatus} to ${newStatus}`);
                setUserLikeStatus(newStatus);
            }
        });
        console.log(`Realtime: Subscribed to ${accountCollection}`);
    }

    // Cleanup function: Unsubscribe when component unmounts or videoId/currentUser changes
    return () => {
        console.log("Realtime: Unsubscribing from updates...");
        countsUnsubscribe();
        if (userUnsubscribe) {
            userUnsubscribe();
        }
    };
  // Dependencies ensure re-subscription if videoId or user changes
  }, [videoId, currentUser, likeCount, dislikeCount, videoCommentCount, userLikeStatus]); // Include states potentially updated by the callback
  
  // --- Effect to fetch subscriber count ---
  useEffect(() => {
    if (!video?.channel?.creatorUserId) return; // Don't run if creator ID isn't available

    const creatorId = video.channel.creatorUserId;
    const fetchSubCount = async () => {
      setLoadingSubCount(true);
      try {
        const statsDoc = await databases.getDocument(
          appwriteConfig.databaseId,
          appwriteConfig.channelStatsCollectionId, // Use the correct ID
          creatorId
        );
        setSubscriberCount(statsDoc.subscriberCount || 0);
      } catch (err) {
        if (err.code === 404) {
          setSubscriberCount(0); // No stats doc means 0 subs
        } else {
          console.error("Failed to fetch subscriber count:", err);
          setSubscriberCount(0); // Default to 0 on error
        }
      } finally {
        setLoadingSubCount(false);
      }
    };

    fetchSubCount();
  }, [video?.channel?.creatorUserId]); // Re-run when creator ID changes

  const handlePostComment = async (e) => {
    e.preventDefault(); // Prevent form submission page reload
    if (!currentUser) {
      navigate('/sign-in', { state: { from: { pathname: `/videos/${videoId}` } } });
      return;
    }
    const trimmedComment = newCommentText.trim();
    if (!trimmedComment || isPostingComment) {
      return; // Ignore empty comments or if already posting
    }

    setIsPostingComment(true);
    setCommentPostError('');

    try {
      const newComment = await postComment(videoId, trimmedComment);
      // Add new comment to the top of the list (optimistic update)
      setComments(prevComments => [newComment, ...prevComments]);
      setNewCommentText(''); // Clear input field
      setVideoCommentCount(prev => prev + 1); // Increment local count
      // Note: The server also updates the commentCount in the database
    } catch (error) {
      console.error("Failed to post comment:", error);
      setCommentPostError(error.message || "Failed to post comment.");
    } finally {
      setIsPostingComment(false);
    }
  };

  // --- Effect to derive initial subscription status from user context ---
  useEffect(() => {
    if (currentUser && video?.channel?.creatorUserId) {
      const creatorId = video.channel.creatorUserId;
      const currentlySubscribed = (currentUser.subscribingTo || []).includes(creatorId);
      setIsSubscribed(currentlySubscribed);
      console.log(`[VideoDetail Sub Effect] Initial subscription status for ${creatorId}: ${currentlySubscribed}`);
    } else {
      setIsSubscribed(false); // Not logged in or no creator ID
    }
  }, [currentUser, video?.channel?.creatorUserId]); // Re-run when user or creator ID changes

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
  
  const MAX_COMMENT_LENGTH = 2000;

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
                className={`video-action-btn like-btn ${currentUser && (currentUser.videosLiked || []).includes(videoId) ? 'active' : ''}`}
                onClick={() => {
                  console.log('Like button clicked, handleLikeDislike exists?', typeof handleLikeDislike);
                  if (typeof handleLikeDislike === 'function') {
                    handleLikeDislike('like');
                  } else {
                    console.error('handleLikeDislike is not a function!', handleLikeDislike);
                  }
                }}
                disabled={isLiking || loadingCounts} // Disable while liking or fetching counts
                aria-pressed={currentUser && (currentUser.videosLiked || []).includes(videoId)}
                title={currentUser && (currentUser.videosLiked || []).includes(videoId) ? 'Unlike' : 'I like this'}
              >
                <svg viewBox="0 0 24 24" height="20" width="20" fill="currentColor">
                  <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-1.91l-.01-.01L23 10z"></path>
                </svg>
                {/* Display updated likeCount state */}
                <span>{loadingCounts ? '...' : formatViews(likeCount)}</span>
              </button>

              {/* Dislike Button */}
              <button
                className={`video-action-btn dislike-btn ${currentUser && (currentUser.videosDisliked || []).includes(videoId) ? 'active' : ''}`}
                onClick={() => {
                  console.log('Dislike button clicked, handleLikeDislike exists?', typeof handleLikeDislike);
                  if (typeof handleLikeDislike === 'function') {
                    handleLikeDislike('dislike');
                  } else {
                    console.error('handleLikeDislike is not a function!', handleLikeDislike);
                  }
                }}
                disabled={isLiking || loadingCounts} // Disable while liking or fetching counts
                aria-pressed={currentUser && (currentUser.videosDisliked || []).includes(videoId)}
                title={currentUser && (currentUser.videosDisliked || []).includes(videoId) ? 'Remove dislike' : 'I dislike this'}
              >
                 <svg viewBox="0 0 24 24" height="20" width="20" fill="currentColor">
                   <path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v1.91l.01.01L1 14c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z"></path>
                </svg>
                <span>{loadingCounts ? '...' : formatViews(dislikeCount)}</span>
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

              {/* --- Delete Button (Owner Only) --- */}
              {currentUser && video?.channel?.creatorUserId === currentUser.$id && (
                <button
                  className="video-action-btn delete-btn" // Add specific class if needed for styling
                  onClick={handleDeleteVideo}
                  disabled={isDeleting}
                  title="Delete this video"
                  style={{ backgroundColor: 'var(--primary)', color: 'white', marginLeft: 'auto' }} // Push to right & Style
                >
                  <svg viewBox="0 0 24 24" height="20" width="20" fill="currentColor">
                      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"></path>
                  </svg>
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              )}
            </div>
          </div>
          {/* Display Like/Dislike Error */}
          {likeError && <p className="like-error-message">{likeError}</p>}
          {/* Display Delete Error */}
          {deleteError && <p className="error-message" style={{ color: 'red', width: '100%', marginTop: '8px' }}>{deleteError}</p>}
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
                    <p className="channel-subscribers">
                        {loadingSubCount ? '...' : formatViews(subscriberCount)} subscribers
                    </p>
                </div>
                {/* Dynamic Subscribe Button */}
                {video.channel.creatorUserId && currentUser?.$id !== video.channel.creatorUserId && (
                  <button
                    className={`subscribe-btn ${isSubscribed ? 'subscribed' : ''}`}
                    onClick={handleSubscribeToggle}
                    disabled={loadingSubscription || loadingSubCount}
                  >
                    {loadingSubscription ? '...' : (isSubscribed ? 'Subscribed' : 'Subscribe')}
                  </button>
                )}
                {subscriptionError && <p className="subscription-error-message">{subscriptionError}</p>}
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

        {/* Comments Section */}
        <div className="comments-section">
          {/* Comment Count Header */}
          <h3 className="comments-count">
             {/* Use videoCommentCount state, show '...' while counts are loading */}
             {loadingCounts ? '...' : `${videoCommentCount}`} Comments
          </h3>

          {/* Comment Input Form */}
          {currentUser && ( // Only show form if logged in
            <form onSubmit={handlePostComment} className="comment-form">
              <textarea
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                placeholder="Add a comment..."
                rows="3"
                required
                maxLength={MAX_COMMENT_LENGTH} // Same as backend limit
                disabled={isPostingComment}
              />
              {commentPostError && <p className="form-error">{commentPostError}</p>}
              <button type="submit" className="btn-primary" disabled={isPostingComment || !newCommentText.trim()}>
                {isPostingComment ? 'Posting...' : 'Comment'}
              </button>
            </form>
          )}
          {!currentUser && (
             <p className="login-prompt">Please <Link to="/sign-in" state={{ from: { pathname: `/videos/${videoId}` } }}>sign in</Link> to comment.</p>
          )}

          {/* Display Comments */}
          {loadingComments ? (
            <p>Loading comments...</p>
          ) : commentsError ? (
            <p className="error-message">{commentsError}</p>
          ) : comments.length === 0 ? (
            <p>No comments yet. Be the first!</p>
          ) : (
            <div className="comments-list">
              {comments.map(comment => (
                <Comment 
                  key={comment.commentId} 
                  comment={comment}
                  videoId={videoId}
                  onReplyPosted={loadComments}
                  depth={0} // Explicitly set depth=0 for top-level comments
                />
              ))}
            </div>
          )}
        </div>

        {/* Add Styles for Comments Section */}
        <style jsx>{`
          .comments-section {
            margin-top: 24px;
          }
          .comments-count {
            font-size: 16px;
            font-weight: 500;
            margin-bottom: 16px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--light-gray);
          }
          .comment-form {
            margin-bottom: 24px;
          }
          .comment-form textarea {
            width: 100%;
            padding: 10px;
            border: 1px solid var(--border-color, #ccc);
            border-radius: 4px;
            font-size: 14px;
            resize: vertical;
            min-height: 60px;
            margin-bottom: 8px;
          }
          .comment-form button {
            float: right; /* Align button right */
          }
          .login-prompt {
             margin-bottom: 24px;
             color: var(--text-secondary);
          }
           .login-prompt a {
              color: var(--primary);
              font-weight: 500;
           }
          .comments-list {
            display: flex;
            flex-direction: column;
          }
          .error-message, .form-error { /* Basic error styling */
             color: red;
             font-size: 14px;
             margin-top: 5px;
             margin-bottom: 15px;
          }
        `}</style>

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
