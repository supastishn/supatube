import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { databases, storage, avatars, account, appwriteConfig } from '../lib/appwriteConfig';
import { Query } from 'appwrite';
import VideoCard from '../components/VideoCard';
import '../App.css'; // Use shared styles

const WatchLater = () => {
  const { user: currentUser, loading: authLoading, watchLaterVideoIds } = useAuth(); // Get watchLaterVideoIds from context
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Function to fetch video details based on IDs in watchLaterVideoIds
    const fetchVideoDetails = async (videoIds) => {
      if (!videoIds || videoIds.length === 0) {
        setVideos([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Fetch video documents matching the watch later IDs
        const response = await databases.listDocuments(
          appwriteConfig.databaseId,
          appwriteConfig.videosCollectionId,
          [
            Query.equal('$id', videoIds), // Fetch documents whose ID is in the videoIds array
            Query.limit(videoIds.length) // Ensure we get all matches up to the limit
            // Note: Order might not be guaranteed; can sort later if needed based on when they were added (not stored currently)
          ]
        );

        // Process fetched videos (similar to Home.jsx / LikedVideos.jsx)
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
                 try {
                   const creatorAccount = await account.get(creatorId);
                   channelName = creatorAccount.name || channelName;
                 } catch {}
              }
            }
          }

          // --- Final Avatar Fallback ---
          if (!channelAvatarUrl) {
             channelAvatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(channelName || '?')}&background=random`;
          }

          // --- Generate Thumbnail URL ---
          let thumbnailUrl = 'https://via.placeholder.com/320x180?text=No+Thumb';
          if (doc.thumbnail_id) {
            try {
              thumbnailUrl = storage.getFilePreview(
                appwriteConfig.storageVideosBucketId,
                doc.thumbnail_id
              );
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
                  console.warn(`[WatchLater/${doc.$id}] Error fetching view counts:`, countsError);
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

        // Optional: Reorder based on watchLaterVideoIds array if needed
        // const orderedVideos = videoIds.map(id => fetchedVideos.find(v => v.id === id)).filter(Boolean);
        // setVideos(orderedVideos);

        setVideos(fetchedVideos); // Set videos

      } catch (err) {
        console.error('Failed to fetch watch later videos:', err);
        setError('Could not load Watch Later videos. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    // Check user status and fetch videos
    if (!authLoading) {
      if (currentUser) {
        // --- Use watchLaterVideoIds Set from context ---
        const idsToFetch = Array.from(watchLaterVideoIds);
        console.log("[WatchLater] Fetching videos for IDs:", idsToFetch); // Log IDs being fetched
        fetchVideoDetails(idsToFetch);
      } else {
        // User is not logged in
        setLoading(false);
        setVideos([]); // Clear videos if user logs out
      }
    }
  // --- Update dependencies ---
  }, [currentUser, authLoading, watchLaterVideoIds]); // Depend on watchLaterVideoIds set

  // Render Loading State
  if (loading || authLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading Watch Later videos...</p>
      </div>
    );
  }

  // Render Error State
  if (error) {
    return (
      <div className="error-container">
        <h2>Error Loading Watch Later</h2>
        <p>{error}</p>
      </div>
    );
  }

   // Render Not Logged In State
  if (!currentUser) {
    return (
      <div className="page-container watch-later-container">
        <h1>Watch Later</h1>
        <p>Please <Link to="/sign-in" className="text-link">sign in</Link> to view your Watch Later list.</p>
      </div>
    );
  }


  // Render Content
  return (
    <div className="page-container watch-later-container">
      <h1>Watch Later</h1>

      {videos.length === 0 ? (
        <p>You haven't added any videos to your Watch Later list yet.</p>
      ) : (
        <div className="videos-grid">
          {videos.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      )}

      {/* Optional: Add simple styling */}
      <style jsx>{`
        .watch-later-container {
          padding: 24px;
        }
        .watch-later-container h1 {
          margin-bottom: 24px;
        }
        .watch-later-container p {
            color: var(--text-secondary);
        }
        .text-link {
            color: var(--primary);
            font-weight: 500;
        }
        /* videos-grid style is already in App.css */
      `}</style>
    </div>
  );
};

export default WatchLater;
