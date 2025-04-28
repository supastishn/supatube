import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { databases, storage, avatars, account, appwriteConfig } from '../lib/appwriteConfig';
import { Query } from 'appwrite';
import VideoCard from '../components/VideoCard';
import '../App.css'; // Use shared styles

const LikedVideos = () => {
  const { user: currentUser, loading: authLoading, likedVideoIds } = useAuth(); // Add likedVideoIds
  const [likedVideos, setLikedVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Function to fetch video details based on IDs
    const fetchVideoDetails = async (videoIds) => {
      if (!videoIds || videoIds.length === 0) {
        setLikedVideos([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Fetch video documents matching the liked IDs
        const response = await databases.listDocuments(
          appwriteConfig.databaseId,
          appwriteConfig.videosCollectionId,
          [
            Query.equal('$id', videoIds), // Fetch documents whose ID is in the videoIds array
            Query.limit(videoIds.length) // Ensure we get all matches up to the limit
            // Note: Order might not be guaranteed; can sort later if needed
          ]
        );

        // Process fetched videos (similar to Home.jsx)
        const fetchedVideos = await Promise.all(response.documents.map(async (doc) => {
          // --- Extract Creator ID ---
          let creatorId = null;
          const permissions = doc.$permissions || [];
          const deletePermissionRegex = /^delete\("user:(.+)"\)$/;
          for (const perm of permissions) {
            const match = perm.match(deletePermissionRegex);
            if (match && match[1]) {
              creatorId = match[1];
              break;
            }
          }
          if (!creatorId && doc.creatorId) { creatorId = doc.creatorId; }

          // --- Initialize Channel Info ---
          let channelName = 'Unknown Channel';
          let channelAvatarUrl = null;
          let channelBio = '';

          // --- Fetch Creator Details ---
          if (creatorId) {
            try {
              const accountDetailsDoc = await databases.getDocument(
                appwriteConfig.databaseId,
                appwriteConfig.accountsCollectionId,
                creatorId
              );
              channelName = accountDetailsDoc.name || channelName;
              channelBio = accountDetailsDoc.bio || '';
              if (accountDetailsDoc.profileImageUrl) {
                channelAvatarUrl = accountDetailsDoc.profileImageUrl;
              }
            } catch (detailsError) {
              if (detailsError.code === 404) {
                 try { // Fallback to account.get() name
                   const creatorAccount = await account.get(creatorId);
                   channelName = creatorAccount.name || channelName;
                 } catch {}
              }
            }
          }

          // --- Final Avatar Fallback ---
          if (!channelAvatarUrl) {
            channelAvatarUrl = creatorId
              ? avatars.getInitials(creatorId).href
              : avatars.getInitials(channelName || '?').href;
          }

          // --- Generate Thumbnail URL ---
          let thumbnailUrl = 'https://via.placeholder.com/320x180?text=No+Thumb';
          if (doc.thumbnail_id) {
            try {
              thumbnailUrl = storage.getFilePreview(
                appwriteConfig.storageVideosBucketId,
                doc.thumbnail_id
              ).href;
            } catch {}
          }

          // --- Fetch View Count ---
          let viewCount = 0;
          try {
              const countsDoc = await databases.getDocument(
                  appwriteConfig.databaseId,
                  appwriteConfig.videoCountsCollectionId,
                  doc.$id
              );
              viewCount = countsDoc.viewCount || 0;
          } catch (countsError) {
              if (countsError.code !== 404) {
                  console.warn(`[LikedVideos/${doc.$id}] Error fetching view counts:`, countsError);
              }
          }

          return {
            id: doc.$id,
            title: doc.title || 'Untitled Video',
            thumbnailUrl: thumbnailUrl,
            durationSeconds: doc.video_duration || 0,
            viewCount: viewCount,
            uploadedAt: doc.$createdAt,
            channel: {
              id: creatorId || `channel-${doc.$id}`,
              name: channelName,
              profileImageUrl: channelAvatarUrl,
              bio: channelBio,
              creatorUserId: creatorId
            }
          };
        }));

        // Optional: Sort fetched videos based on the original liked order if needed
        // const orderedVideos = videoIds.map(id => fetchedVideos.find(v => v.id === id)).filter(Boolean);
        // setLikedVideos(orderedVideos);

        setLikedVideos(fetchedVideos); // Set videos (order might match DB response, not liked order)

      } catch (err) {
        console.error('Failed to fetch liked videos:', err);
        setError('Could not load liked videos. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    // Check user status and fetch videos
    if (!authLoading) {
      if (currentUser) { // Check only if user exists
        // --- Use likedVideoIds Set from context ---
        const idsToFetch = Array.from(likedVideoIds);
        fetchVideoDetails(idsToFetch);
      } else {
        // User is not logged in
        setLoading(false);
        setLikedVideos([]); // Clear videos if user logs out
      }
    }
// --- Update dependencies ---
}, [currentUser, authLoading, likedVideoIds]); // Depend on likedVideoIds set

  // Render Loading State
  if (loading || authLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading liked videos...</p>
      </div>
    );
  }

  // Render Error State
  if (error) {
    return (
      <div className="error-container">
        <h2>Error Loading Liked Videos</h2>
        <p>{error}</p>
      </div>
    );
  }

  // Render Content
  return (
    <div className="page-container liked-videos-container">
      <h1>Liked Videos</h1>

      {likedVideos.length === 0 ? (
        <p>You haven't liked any videos yet. Videos you like will appear here.</p>
      ) : (
        <div className="videos-grid">
          {likedVideos.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      )}

      {/* Optional: Add simple styling */}
      <style jsx>{`
        .liked-videos-container {
          padding: 24px;
        }
        .liked-videos-container h1 {
          margin-bottom: 24px;
        }
        .liked-videos-container p {
            color: var(--text-secondary);
        }
        /* videos-grid style is already in App.css */
      `}</style>
    </div>
  );
};

export default LikedVideos;
