import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { databases, storage, avatars, appwriteConfig } from '../lib/appwriteConfig';
import { Query } from 'appwrite';
import VideoCard from '../components/VideoCard';
import '../App.css'; // Use shared styles

const YourVideos = () => {
  // Use useAuth to get user data and loading status
  const { user: currentUser, accountDetails, loading: authLoading } = useAuth();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Only fetch if authentication is checked and user/details are loaded
    if (authLoading || !currentUser || !accountDetails) {
      // If auth is still loading, keep the page loading state
      setLoading(authLoading);
      // If auth finished and no user/details, clear videos and stop loading
      if (!authLoading && (!currentUser || !accountDetails)) {
          setVideos([]);
          setLoading(false);
          setError("Please log in to view your videos.");
      }
      return; // Don't fetch yet
    }

    const fetchUserVideos = async () => {
      setLoading(true);
      setError(null);
      setVideos([]);

      // --- Get video IDs from AuthContext's accountDetails ---
      const uploadedVideoIds = accountDetails?.videosUploaded || [];
      console.log("[YourVideos] Fetched video IDs from context:", uploadedVideoIds);

      if (uploadedVideoIds.length === 0) {
        setLoading(false);
        setVideos([]); // Ensure videos are empty
        return; // Nothing to fetch
      }

      try {
        // --- Fetch videos using the specific IDs from the account document ---
        const response = await databases.listDocuments(
          appwriteConfig.databaseId,
          appwriteConfig.videosCollectionId,
          [
            Query.equal('$id', uploadedVideoIds), // Fetch documents whose $id is in the array
            Query.limit(uploadedVideoIds.length), // Ensure we fetch all specified videos
            Query.orderDesc('$createdAt') // Show newest first
          ]
        );

        // Process the video documents
        const fetchedVideos = response.documents.map((doc) => {
          // Generate Thumbnail URL
          let thumbnailUrl = 'https://via.placeholder.com/320x180?text=No+Thumb';
          if (doc.thumbnail_id) {
            try {
              thumbnailUrl = storage.getFilePreview(
                appwriteConfig.storageVideosBucketId,
                doc.thumbnail_id
              ).href;
            } catch (previewError) {
              console.error(`[YourVideosThumb/${doc.$id}] Error generating thumbnail preview:`, previewError);
            }
          }

          // Construct the channel object (which is the current user)
          const channelInfo = {
            id: currentUser.$id, // Use current user's ID
            name: accountDetails.name || currentUser.name || 'Your Channel', // Prioritize DB name
            profileImageUrl: accountDetails.profileImageUrl || avatars.getInitials(currentUser.name || '?').href, // Prioritize DB image
            bio: accountDetails.bio || '', // Use DB bio
            creatorUserId: currentUser.$id // Explicitly set creatorUserId
          };

          return {
            id: doc.$id,
            title: doc.title || 'Untitled Video',
            thumbnailUrl: thumbnailUrl,
            durationSeconds: doc.video_duration || 0,
            viewCount: doc.viewCount || 0,
            uploadedAt: doc.$createdAt,
            channel: channelInfo // Use the constructed channel info for the current user
          };
        });

        setVideos(fetchedVideos);

      } catch (err) {
        console.error('Failed to fetch your videos:', err);
        setError('Could not load your videos. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchUserVideos();

  // Dependencies: Re-fetch if user, auth state, or account details change
  }, [currentUser, authLoading, accountDetails]);

  // Render Loading State
  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading your videos...</p>
      </div>
    );
  }

  // Render Error State
  if (error) {
    return (
      <div className="error-container">
        <h2>Error Loading Videos</h2>
        <p>{error}</p>
      </div>
    );
  }

  // Render Content
  return (
    <div className="page-container your-videos-container">
      <h1>Your Videos</h1>

      {!currentUser ? (
         <p>Please <Link to="/sign-in">sign in</Link> to see your uploaded videos.</p>
      ) : videos.length === 0 ? (
        <p>You haven't uploaded any videos yet. <Link to="/upload">Upload your first video!</Link></p>
      ) : (
        <div className="videos-grid">
          {videos.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      )}

      {/* Optional: Add simple styling */}
      <style jsx>{`
        .your-videos-container {
          padding: 24px;
        }
        .your-videos-container h1 {
          margin-bottom: 24px;
        }
        .your-videos-container p {
            color: var(--text-secondary);
        }
        .your-videos-container p a {
            color: var(--primary);
            font-weight: 500;
        }
        /* videos-grid style is already in App.css */
      `}</style>
    </div>
  );
};

export default YourVideos;
