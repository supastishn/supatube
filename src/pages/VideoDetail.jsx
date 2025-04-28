import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import VideoCard from '../components/VideoCard'; // Assuming VideoCard component
import { formatDistanceToNowStrict, parseISO } from 'date-fns'; // For time ago formatting
import { Fragment } from 'react'; // Import Fragment if needed for structure
import { useAuth } from '../context/AuthContext'; // Import useAuth
import { toggleLikeDislike } from '../lib/likesService'; // Import like service
import { createSubscriptionInteraction } from '../lib/subscriptionService'; // Import subscription service
import Comment from '../components/Comment'; // Add this
import { postComment, fetchCommentsForVideo } from '../lib/commentService'; // Add this
import { deleteVideo } from '../lib/videoService'; // Import video deletion function
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs
import { 
  getPendingCommentsFromStorage, 
  savePendingCommentsToStorage, 
  createTempComment, 
  addPendingComment,
  cleanupExpiredComments,
  PENDING_COMMENT_TIMEOUT_MS 
} from '../lib/commentUtils';

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
  const { user: currentUser, accountDetails, loading: authLoading, likedVideoIds, dislikedVideoIds, watchLaterVideoIds, updateClientVideoStates, updateAccountLikeDislikeArrays, refreshUserProfile, toggleWatchLater } = useAuth(); // Add watchLaterVideoIds, toggleWatchLater
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

    // Determine current status *before* optimistic update for count logic
    const wasLiked = likedVideoIds.has(videoId);
    const wasDisliked = dislikedVideoIds.has(videoId);
    let currentStatus = 0;
    if (wasLiked) currentStatus = 1;
    else if (wasDisliked) currentStatus = -1;

    // Store previous local count state for potential *count* rollback
    const previousLikeCount = likeCount;
    const previousDislikeCount = dislikeCount;

    // 1. Update AuthContext client state sets IMMEDIATELY
    updateClientVideoStates(videoId, action); // Use the existing function for Sets

    // --- ADDED STEP: Update the account document arrays asynchronously ---
    updateAccountLikeDislikeArrays(videoId, action); // Call the new function, no need to await

    // 2. Optimistically update LOCAL counts for UI feedback
    // Use the status *before* the update to calculate the change
    if (action === 'like') {
        if (currentStatus === 1) { // Was liked, now toggling off
            setLikeCount(prev => Math.max(0, prev - 1));
        } else { // Was neutral or disliked, now liking
            setLikeCount(prev => prev + 1);
            if (currentStatus === -1) { // Was disliked
                setDislikeCount(prev => Math.max(0, prev - 1)); // Remove dislike count too
            }
        }
    } else { // action === 'dislike'
        if (currentStatus === -1) { // Was disliked, now toggling off
            setDislikeCount(prev => Math.max(0, prev - 1));
        } else { // Was neutral or liked, now disliking
            setDislikeCount(prev => prev + 1);
            if (currentStatus === 1) { // Was liked
                setLikeCount(prev => Math.max(0, prev - 1)); // Remove like count too
            }
        }
    }

    // 3. Call Backend Service to RECORD the interaction
    try {
      await toggleLikeDislike(videoId, action, currentUser.$id); // This function remains the same
      console.log(`[VideoDetail] Interaction ${action} recorded successfully for video ${videoId}`);

    } catch (error) {
      console.error(`Failed to record ${action} interaction:`, error);
      // Revert optimistic LOCAL count updates ONLY if recording fails
      setLikeCount(previousLikeCount);
      setDislikeCount(previousDislikeCount);
      // DO NOT revert the AuthContext state change (the Sets).
      // DO NOT revert the account array update (it was fire-and-forget).
      setLikeError(error.message || `Failed to sync ${action}. Your preference is saved.`);

    } finally {
      setIsLiking(false);
    }
// Add dependencies for the new context values used
}, [currentUser, videoId, isLiking, likeCount, dislikeCount, likedVideoIds, dislikedVideoIds, navigate, updateClientVideoStates, updateAccountLikeDislikeArrays, setIsLiking, setLikeError, setLikeCount, setDislikeCount]);

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
      const result = await createSubscriptionInteraction(creatorId, action, currentUser.$id);
      console.log('Subscription interaction created:', result);
      // --- ADD THIS: Refresh user profile data in context after successful interaction ---
      console.log('[VideoDetail] Subscription interaction successful, refreshing user context...');
      await refreshUserProfile(); // Re-fetch user data including subscriptions
      console.log('[VideoDetail] User context refreshed.');
    } catch (error) {
      console.error('Subscription interaction failed:', error);
      // Revert optimistic updates
      setIsSubscribed(previousSubState);
      setSubscriberCount(previousSubCount);
      setSubscriptionError(error.message || 'Failed to request subscription change.');
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
      
      // Get pending comments from localStorage
      const pendingComments = getPendingCommentsFromStorage()
        .filter(p => p.videoId === videoId);
      
      // Identify which pending comments should be replaced with real ones
      const pendingIdsToRemove = [];
      
      // Process fetched comments to identify those that match pending ones
      const processedComments = fetchedComments.map(realComment => {
        const tempClientId = realComment.temporaryClientId;
        if (tempClientId) {
          // Look for a pending comment with matching tempClientId
          const matchingPendingComment = pendingComments.find(
            p => p.temporaryClientId === tempClientId
          );
          
          if (matchingPendingComment) {
            // Mark this pending comment for removal from localStorage
            pendingIdsToRemove.push(matchingPendingComment.commentId);
          }
        }
        return realComment;
      });
      
      // Remove matched pending comments from localStorage
      if (pendingIdsToRemove.length > 0) {
        const updatedPendingComments = getPendingCommentsFromStorage()
          .filter(p => !pendingIdsToRemove.includes(p.commentId));
        savePendingCommentsToStorage(updatedPendingComments);
      }
      
      // Add remaining valid pending comments
      const remainingValidPending = pendingComments
        .filter(p => !pendingIdsToRemove.includes(p.commentId))
        .filter(p => Date.now() - p.createdAt < PENDING_COMMENT_TIMEOUT_MS);
      
      // Combine and set the comments
      const combinedComments = [...remainingValidPending, ...processedComments];
      
      setComments(combinedComments);
    } catch (error) {
      console.error("Failed to fetch comments:", error);
      setCommentsError("Could not load comments. Please try again later.");
    } finally {
      setLoadingComments(false);
    }
  }, [videoId]); // Re-run when videoId changes

  useEffect(() => {
    loadComments();

    // Setup cleanup interval for expired comments
    const cleanupInterval = setInterval(() => {
      const { expired, valid } = cleanupExpiredComments();
      
      if (expired.length > 0) {
        // Update UI state to remove expired comments
        setComments(prev => prev.filter(c => {
          // Keep if not pending OR if pending but still in valid list
          return !c.pending || valid.some(v => v.commentId === c.commentId);
        }));
      }
    }, 10000); // Check every 10 seconds

    return () => {
      clearInterval(cleanupInterval);
    };
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

  const isLiked = currentUser && likedVideoIds.has(videoId);
  const isDisliked = currentUser && dislikedVideoIds.has(videoId);

  // --- Determine if video is saved to Watch Later ---
  const isSaved = currentUser && watchLaterVideoIds.has(videoId);
  const handleSaveToggle = () => {
      if (!currentUser) {
          navigate('/sign-in', { state: { from: { pathname: `/videos/${videoId}` } } });
      } else {
          toggleWatchLater(videoId); // Call context function
      }
  };

  // Determine local status for count logic inside handleLikeDislike if needed
  let localLikeStatus = 0;
  if (isLiked) localLikeStatus = 1;
  else if (isDisliked) localLikeStatus = -1;
  
  // --- Realtime updates subscription ---
  useEffect(() => {
    if (!videoId) return; // Don't subscribe if no video ID
    
    console.log(`[Realtime/${videoId}] Setting up subscriptions (like/dislike counts subscription is now REMOVED)...`);
    
    // --- Subscribe to Video Counts ---
    // const countsCollection = `databases.${appwriteConfig.databaseId}.collections.${appwriteConfig.videoCountsCollectionId}.documents.${videoId}`;
    // const countsUnsubscribe = client.subscribe(countsCollection, (response) => {
    //     console.log("Realtime Counts Update Received:", response.payload);
    //     // Update state based on payload, handle potential nulls gracefully
    //     setLikeCount(response.payload.likeCount ?? likeCount);
    //     setDislikeCount(response.payload.dislikeCount ?? dislikeCount);
    //     setVideoCommentCount(response.payload.commentCount ?? videoCommentCount);
    // });
    // console.log(`Realtime: Subscribed to ${countsCollection}`);

    // Cleanup function: Unsubscribe when component unmounts or videoId changes
    return () => {
        console.log("Realtime: Unsubscribing from updates...");
        // countsUnsubscribe();
    };
  // Dependencies ensure re-subscription if videoId changes
  }, [videoId, likeCount, dislikeCount, videoCommentCount]); // Include states potentially updated by the callback
  
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

    // Create optimistic comment
    const tempComment = createTempComment(videoId, trimmedComment, null, currentUser);
    
    // Add to state immediately for optimistic UI update
    setComments(prev => [tempComment, ...prev]);
    
    // Add to localStorage
    addPendingComment(tempComment);
    
    // Clear input field
    setNewCommentText('');

    setIsPostingComment(true);
    setCommentPostError('');

    try {
      // Call the interaction service, passing the current user's ID
      const result = await postComment(
        videoId, 
        trimmedComment, 
        null, 
        currentUser.$id, 
        tempComment.temporaryClientId
      );
      console.log('Comment interaction created:', result);
      // No need to reload - optimistic update is showing and will be reconciled
    } catch (error) {
      console.error("Failed to post comment:", error);
      setCommentPostError(error.message || "Failed to post comment.");
    } finally {
      setIsPostingComment(false);
    }
  };

  // --- Effect to derive initial subscription status from user context ---
  useEffect(() => {
    // Check only if auth is loaded, user exists, details are loaded, and creator ID exists
    if (!authLoading && currentUser && accountDetails && video?.channel?.creatorUserId) {
      const creatorId = video.channel.creatorUserId;
      // Use subscribingTo array from accountDetails (populated by AuthContext)
      const currentlySubscribed = (accountDetails.subscribingTo || []).includes(creatorId);
      setIsSubscribed(currentlySubscribed);
      console.log(`[VideoDetail Sub Effect] Initial subscription status for ${creatorId}: ${currentlySubscribed}`);
    } else {
      setIsSubscribed(false); // Not logged in or no creator ID
    }
  }, [currentUser, accountDetails, video?.channel?.creatorUserId, authLoading]); // Add accountDetails and authLoading

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
                className={`video-action-btn like-btn ${isLiked ? 'active' : ''}`} // Use isLiked derived from context Set
                onClick={() => handleLikeDislike('like')} // Ensure correct function call
                disabled={isLiking || loadingCounts} // Disable while liking or fetching counts
                aria-pressed={isLiked}
                title={isLiked ? 'Unlike' : 'I like this'}
              >
                <svg viewBox="0 0 24 24" height="20" width="20" fill="currentColor">
                  <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-1.91l-.01-.01L23 10z"></path>
                </svg>
                {/* Display updated likeCount state */}
                <span>{loadingCounts ? '...' : formatViews(likeCount)}</span>
              </button>

              {/* Dislike Button */}
              <button
                className={`video-action-btn dislike-btn ${isDisliked ? 'active' : ''}`} // Use isDisliked derived from context Set
                onClick={() => handleLikeDislike('dislike')} // Ensure correct function call
                disabled={isLiking || loadingCounts} // Disable while liking or fetching counts
                aria-pressed={isDisliked}
                title={isDisliked ? 'Remove dislike' : 'I dislike this'}
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
              {/* --- Updated Save Button --- */}
              <button
                className={`video-action-btn save-btn ${isSaved ? 'active' : ''}`} // Add active class
                onClick={handleSaveToggle} // Use the new handler
                disabled={!currentUser} // Disable if not logged in (or handle via handler)
                aria-pressed={isSaved}
                title={isSaved ? 'Remove from Watch Later' : 'Save to Watch Later'}
              >
                <svg viewBox="0 0 24 24" height="20" width="20" fill="currentColor">
                  {/* Use a filled clock for 'Saved', outline for 'Save' */}
                  {isSaved ? <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/> : <path d="M14.97 16.95 10 13.87V7h2v5.76l3.77 2.26-.8 1.93zM12 3c-4.96 0-9 4.04-9 9s4.04 9 9 9 9-4.04 9-9-4.04-9-9-9m0 16c-3.86 0-7-3.14-7-7s3.14-7 7-7 7 3.14 7 7-3.14 7-7 7z"/>}
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
              {comments
                .filter(comment => comment.commentText && comment.commentText.trim() !== "") // Filter out empty comments
                .map(comment => (
                <Comment 
                  key={comment.commentId} 
                  comment={comment}
                  videoId={videoId}
                  onReplyPosted={loadComments}
                  onOptimisticReply={(tempReply) => {
                    // Handle optimistic replies - add to parent comment
                    setComments(prevComments => {
                      return prevComments.map(c => {
                        if (c.commentId === tempReply.parentCommentId) {
                          // Found the parent comment, add reply to it
                          return {
                            ...c,
                            replies: [tempReply, ...(c.replies || [])]
                          };
                        }
                        return c;
                      });
                    });
                  }}
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
