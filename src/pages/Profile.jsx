import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { storage, databases, appwriteConfig } from '../lib/appwriteConfig';
import { Query } from 'appwrite'; // Import Query directly from appwrite package
import { createSubscriptionInteraction } from '../lib/subscriptionService'; // Import subscription service
import VideoCard from '../components/VideoCard'; // Import VideoCard
import { useAuth } from '../context/AuthContext'; // Optional: To check if it's the current user's profile
import { formatViews } from '../utils/formatters'; // Add this line

const Profile = () => {
  const { userId } = useParams(); // Get userId from URL
  const navigate = useNavigate();
  const { user: currentUser, accountDetails, loading: authLoading, refreshUserProfile } = useAuth(); // Add refreshUserProfile

  const [userData, setUserData] = useState(null);
  const [userVideos, setUserVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Add subscription state variables
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriberCount, setSubscriberCount] = useState(0);
  const [loadingSubscription, setLoadingSubscription] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState('');
  const [loadingSubCount, setLoadingSubCount] = useState(true);

  const isOwnProfile = currentUser && currentUser.$id === userId; // Check if it's the logged-in user's profile

  useEffect(() => {
    // Always fetch profile data, regardless of auth state
    const fetchProfileData = async () => {
      if (!userId) {
        setError("No user ID provided.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setUserData(null);
      setUserVideos([]);

      try {
        // 1. Fetch User Account Details (from 'accounts' collection)
        // Assuming the 'accounts' collection document ID is the same as the user's $id
        const userDoc = await databases.getDocument(
          appwriteConfig.databaseId,
          appwriteConfig.accountsCollectionId,
          userId
        );
        setUserData(userDoc); // Contains name, bio, profileImageUrl etc.

        // --- 2. Get video IDs from the fetched accounts document ---
        const uploadedVideoIds = userDoc?.videosUploaded || [];
        console.log(`[Profile] Fetched video IDs from accounts doc:`, uploadedVideoIds);

        // 3. Fetch User's Videos if IDs were found
        if (uploadedVideoIds.length > 0) {
          const videoResponse = await databases.listDocuments(
            appwriteConfig.databaseId,
            appwriteConfig.videosCollectionId,
            [
              Query.equal('$id', uploadedVideoIds),
              Query.limit(uploadedVideoIds.length),
              Query.orderDesc('$createdAt'),
            ]
          );
          // Fetch view counts for each video
          const videosWithCounts = await Promise.all(videoResponse.documents.map(async (videoDoc) => {
            let viewCount = 0;
            try {
              const countsDoc = await databases.getDocument(
                appwriteConfig.databaseId,
                appwriteConfig.videoCountsCollectionId,
                videoDoc.$id
              );
              viewCount = countsDoc.viewCount || 0;
            } catch (countsError) {
              if (countsError.code !== 404) {
                console.warn(`[Profile/${videoDoc.$id}] Error fetching view counts:`, countsError);
              }
            }
            return { ...videoDoc, fetchedViewCount: viewCount };
          }));
          setUserVideos(videosWithCounts); // Set videos including the counts
        } else {
          setUserVideos([]); // Ensure it's empty if no IDs
        }

        // Fetch subscriber count
        try {
          const statsDoc = await databases.getDocument(
            appwriteConfig.databaseId,
            appwriteConfig.channelStatsCollectionId,
            userId
          );
          setSubscriberCount(statsDoc.subscriberCount || 0);
        } catch (statsErr) {
          if (statsErr.code === 404) {
            setSubscriberCount(0); // No stats doc means 0 subscribers
          } else {
            console.error("Error fetching subscriber count:", statsErr);
            setSubscriberCount(0); // Default to 0 on any error
          }
        } finally {
          setLoadingSubCount(false);
        }

      } catch (err) {
        console.error("Error fetching profile data:", err);
        // Handle user not found (Appwrite often throws 404 for getDocument)
        if (err.code === 404) {
          setError(`Profile not found for user ID: ${userId}`);
        } else {
          setError("Failed to load profile data. Please try again later.");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchProfileData();
  }, [userId]); // Re-run effect if userId changes

  // Effect to check if current user is subscribed to this profile
  useEffect(() => {
    // Check only if auth is loaded, user exists, details are loaded, and it's not the user's own profile
    if (!authLoading && currentUser && accountDetails && userId && !isOwnProfile) {
      // Use the subscribingTo array from accountDetails (populated by AuthContext)
      const currentlySubscribed = (accountDetails.subscribingTo || []).includes(userId);
      setIsSubscribed(currentlySubscribed);
      console.log(`[Profile] Initial subscription status for ${userId}: ${currentlySubscribed}`);
    } else {
      setIsSubscribed(false);
    }
  }, [currentUser, accountDetails, userId, isOwnProfile, authLoading]); // Add accountDetails and authLoading to dependencies

  // Handle subscribe/unsubscribe
  const handleSubscribeToggle = async () => {
    if (!currentUser) {
      navigate('/sign-in', { state: { from: { pathname: `/profile/${userId}` } } });
      return;
    }
    
    if (loadingSubscription) return;

    const action = isSubscribed ? 'unsubscribe' : 'subscribe';
    const previousSubState = isSubscribed;
    const previousSubCount = subscriberCount;

    setLoadingSubscription(true);
    setSubscriptionError('');

    // Optimistic Update
    setIsSubscribed(!previousSubState);
    setSubscriberCount(prev => Math.max(0, prev + (action === 'subscribe' ? 1 : -1)));

    try {
      await createSubscriptionInteraction(userId, action, currentUser.$id);
      // --- ADD THIS: Refresh user profile data in context after successful interaction ---
      console.log('[Profile] Subscription interaction successful, refreshing user context...');
      await refreshUserProfile(); // Re-fetch user data including subscriptions
      console.log('[Profile] User context refreshed.');
      // The useEffect watching accountDetails should now update isSubscribed correctly
    } catch (error) {
      console.error('Subscription interaction failed:', error);
      // Revert optimistic updates
      setIsSubscribed(previousSubState);
      setSubscriberCount(previousSubCount);
      setSubscriptionError(error.message || 'Failed to request subscription change.');
    } finally {
      setLoadingSubscription(false);
    }
  };

  if (loading) {
    return <div className="loading-container">Loading profile...</div>; // Use shared loading style
  }

  if (error) {
    return <div className="error-container">Error: {error}</div>; // Use shared error style
  }

  if (!userData) {
    // This case might be hit if loading finished but userData is still null (should ideally be covered by error)
    return <div className="error-container">Profile data could not be loaded.</div>;
  }

  return (
    <div className="profile-container">
      {/* Display user information */}
      <div className="profile-details">
        <img
          src={userData.profileImageUrl || `https://cloud.appwrite.io/v1/avatars/initials?name=${encodeURIComponent(userData.name || '?')}`} // Use Appwrite avatar endpoint
          alt={`${userData.name || 'User'}'s avatar`}
          className="profile-avatar" // Add styling for this class
        />
        <div className="profile-header-info">
          <h1>{userData.name || 'Unnamed User'}</h1>
          <p className="subscriber-count">{loadingSubCount ? '...' : `${formatViews(subscriberCount)} subscribers`}</p>
          {userData.bio && <p className="profile-bio">{userData.bio}</p>}

          {/* Conditional button rendering */}
          <div className="profile-actions">
            {isOwnProfile ? (
              <button className="btn-primary" onClick={() => navigate('/account')}>Edit Profile</button>
            ) : currentUser && (
              <button 
                className={`subscribe-btn ${isSubscribed ? 'subscribed' : ''}`}
                onClick={handleSubscribeToggle}
                disabled={loadingSubscription}
              >
                {loadingSubscription ? '...' : (isSubscribed ? 'Subscribed' : 'Subscribe')}
              </button>
            )}
            {subscriptionError && <p className="subscription-error-message">{subscriptionError}</p>}
          </div>
        </div>
      </div>

      <div className="user-videos">
         <h2>{isOwnProfile ? "Your Videos" : "Uploaded Videos"}</h2>
         {userVideos.length > 0 ? (
            <div className="videos-grid"> {/* Use videos-grid class from App.css */}
              {userVideos.map((video) => {
                // --- DEBUG PRINTS ---
                const thumbnailUrl = video.thumbnail_id ? 
                  storage.getFilePreview(appwriteConfig.storageVideosBucketId, video.thumbnail_id) : 
                  'https://via.placeholder.com/320x180?text=No+Thumbnail';
                const channelName = userData.name || 'Unknown User';
                console.log(`[Profile/${video.$id}] Thumbnail URL: ${thumbnailUrl}`);
                console.log(`[Profile/${video.$id}] Channel Name: ${channelName}`);
                console.log(`[Profile/${video.$id}] Channel profileImageUrl (from userData): ${userData.profileImageUrl}`);
                // --- END DEBUG PRINTS ---
                return (
                  <VideoCard key={video.$id} video={{
                    id: video.$id,
                    title: video.title || 'Untitled Video', 
                    thumbnailUrl: video.thumbnail_id ? 
                      storage.getFilePreview(appwriteConfig.storageVideosBucketId, video.thumbnail_id) : 
                      'https://via.placeholder.com/320x180?text=No+Thumbnail',
                    durationSeconds: video.video_duration || 0,
                    viewCount: video.fetchedViewCount || 0,
                    uploadedAt: video.$createdAt,
                    channel: {
                      id: userId,
                      name: userData.name || 'Unknown User',
                      profileImageUrl: userData.profileImageUrl,
                      creatorUserId: userId
                    }
                  }} />
                );
              })}
            </div>
          ) : (
            <p>{isOwnProfile ? "You haven't uploaded any videos yet." : "This user hasn't uploaded any videos yet."}</p>
          )}
      </div>

       <style jsx>{`
        .profile-container {
          max-width: 900px;
          margin: 20px auto;
          padding: 20px;
          background-color: var(--white);
          border-radius: 8px;
          box-shadow: var(--shadow);
        }
        .profile-avatar {
            width: 100px; /* Adjust size as needed */
            height: 100px;
            border-radius: 50%;
            margin-bottom: 15px;
            object-fit: cover; /* Ensure image covers the area */
        }
         .profile-container h1 {
             margin-bottom: 24px;
             border-bottom: 1px solid var(--light-gray);
             padding-bottom: 16px;
         }
         .profile-details, .user-videos {
             margin-bottom: 30px;
         }
         h2 {
             margin-bottom: 16px;
             font-size: 18px;
         }
         .profile-header-info {
             flex: 1;
         }
         .subscriber-count {
             color: var(--text-secondary);
             font-size: 14px;
             margin-bottom: 10px;
         }
         .profile-bio {
             color: var(--text-secondary);
             margin-bottom: 20px;
             white-space: pre-wrap; /* Preserve line breaks in bio */
         }
         .profile-actions {
             display: flex;
             align-items: center;
             gap: 10px;
             margin-top: 15px;
         }
         .profile-details {
             display: flex;
             gap: 20px;
             align-items: flex-start;
         }
      `}</style>
    </div>
  );
};

export default Profile;
