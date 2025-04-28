

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import VideoCard from '../components/VideoCard';
import { databases, storage, avatars, account, appwriteConfig } from '../lib/appwriteConfig';
import { Query } from 'appwrite';
import { useAuth } from '../context/AuthContext';

const YourVideos = () => {
  const { user: currentUser, loading: authLoading, accountDetails } = useAuth();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Effect to fetch user's uploaded videos using the videosUploaded array from accountDetails
  useEffect(() => {
    const fetchUserVideos = async () => {
      // Ensure user is logged in and auth is not loading
      if (authLoading) return;
      
      if (!currentUser) {
        setError("Please log in to view your videos.");
        setLoading(false);
        return;
      }

      try {
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
            // --- Fetch videos using the specific IDs from the account's videosUploaded array ---
            const response = await databases.listDocuments(
              appwriteConfig.databaseId,
              appwriteConfig.videosCollectionId,
              [
                Query.equal('$id', uploadedVideoIds), // Fetch documents whose $id is in the array
                Query.limit(uploadedVideoIds.length), // Ensure we fetch all specified videos
                Query.orderDesc('$createdAt') // Show newest first
              ]
            );

            // --- Process the fetched videos ---
            const fetchedVideos = await Promise.all(response.documents.map(async (doc) => {
              // Extract Creator ID from Permissions (same logic as in Home.jsx)
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
              
              // Initialize channel info
              let channelName = currentUser.name || 'Your Channel';
              let channelAvatarUrl = null;
              let channelBio = '';
              
              // Use current user's details for the channel info
              try {
                if (accountDetails) {
                  channelName = accountDetails.name || channelName;
                  channelAvatarUrl = accountDetails.profileImageUrl || null;
                  channelBio = accountDetails.bio || '';
                }
              } catch (error) {
                console.warn("[YourVideos] Error processing account details:", error);
              }
              
              // Avatar fallback logic
              if (!channelAvatarUrl) {
                channelAvatarUrl = avatars.getInitials(channelName || '?').href;
              }
              
              // Generate Thumbnail URL
              let thumbnailUrl = 'https://via.placeholder.com/320x180/CCCCCC/969696?text=No+Thumbnail';
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
                      console.warn(`[YourVideos/${doc.$id}] Error fetching view counts:`, countsError);
                  }
              }

              // Return formatted video object for VideoCard
              return {
                id: doc.$id,
                title: doc.title || 'Untitled Video',
                thumbnailUrl: thumbnailUrl,
                durationSeconds: doc.video_duration || 0,
                viewCount: viewCount,
                uploadedAt: doc.$createdAt,
                channel: {
                  id: currentUser.$id,
                  name: channelName,
                  profileImageUrl: channelAvatarUrl,
                  bio: channelBio,
                  creatorUserId: currentUser.$id // We know this is the current user's videos
                }
              };
            }));
            
            setVideos(fetchedVideos);
            
          } catch (err) {
            console.error("Error fetching video documents:", err);
            setError(`Failed to fetch videos: ${err.message}`);
          }
      } catch (err) {
        console.error("Error in fetchUserVideos:", err);
        setError(`An error occurred: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchUserVideos();
  }, [currentUser, authLoading, accountDetails]); // Depend on accountDetails to refresh when it changes

  if (authLoading) {
    return <div className="loading-container">Loading...</div>;
  }

  if (!currentUser) {
    return (
      <div className="error-container">
        <h2>Authentication Required</h2>
        <p>Please log in to view your videos.</p>
        <Link to="/sign-in" className="btn-primary">Sign In</Link>
      </div>
    );
  }

  if (loading) {
    return <div className="loading-container">Loading your videos...</div>;
  }

  if (error) {
    return <div className="error-container">{error}</div>;
  }

  return (
    <div className="your-videos-container">
      <h1>Your Videos</h1>
      
      <div className="actions-bar">
        <Link to="/upload" className="btn-primary">
          <svg viewBox="0 0 24 24" height="24" width="24" fill="currentColor">
            <path d="M14,13h-3v3H9v-3H6v-2h3V8h2v3h3V13z M17,6H3v12h14v-6.39l4,1.83V8.56l-4,1.83V6 M18,5v3.83L22,7v8l-4-1.83V19H2V5H18L18,5 z"></path>
          </svg>
          Upload New Video
        </Link>
      </div>

      {videos.length === 0 ? (
        <div className="empty-state">
          <p>You haven't uploaded any videos yet.</p>
          <p>Get started by clicking the Upload button above!</p>
        </div>
      ) : (
        <div className="videos-grid">
          {videos.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      )}

      <style jsx>{`
        .your-videos-container {
          padding: 20px;
          max-width: 1200px;
          margin: 0 auto;
        }
        .your-videos-container h1 {
          margin-bottom: 24px;
        }
        .actions-bar {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 24px;
        }
        .actions-bar .btn-primary {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .empty-state {
          text-align: center;
          padding: 40px;
          background-color: var(--light-gray);
          border-radius: 8px;
          color: var(--text-secondary);
        }
        .empty-state p {
          margin: 8px 0;
        }
      `}</style>
    </div>
  );
};

export default YourVideos;
