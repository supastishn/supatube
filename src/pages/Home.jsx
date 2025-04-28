import { useState, useEffect, useCallback } from 'react';
import VideoCard from '../components/VideoCard'; // Assuming VideoCard component is in ../components
import { databases, storage, avatars, account, appwriteConfig } from '../lib/appwriteConfig';
import { Query, Permission, Role } from 'appwrite'; // Import Query, Permission, Role
import { useAuth } from '../context/AuthContext';

const Home = () => {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user: currentUser, loading: authLoading } = useAuth(); // Get user and auth loading state

  // Effect to ensure account document exists for logged-in user
  useEffect(() => {
    const ensureAccountDocumentExists = async () => {
      // Only run if auth check is complete and user is logged in
      if (authLoading || !currentUser) {
        return;
      }

      try {
        // Try to get the document
        await databases.getDocument(
          appwriteConfig.databaseId,
          appwriteConfig.accountsCollectionId,
          currentUser.$id
        );
        // console.log(`[Home] Account document found for user ${currentUser.$id}.`); // Optional: Log success
      } catch (err) {
        // If document not found (404), create it
        if (err.code === 404) {
          console.log(`[Home] Account document not found for user ${currentUser.$id}. Creating...`);
          try {
            const defaultAccountData = {
              name: currentUser.name || 'User', // Use name from auth, fallback to 'User'
              bio: '',                         // Default empty bio
              profileImageUrl: null,           // Default null image URL
              videosLiked: [],                 // Required empty array
              videosDisliked: [],              // Required empty array
              videosUploaded: [],              // Include required empty array
              watchLaterVideos: []             // Include required empty array
            };
            await databases.createDocument(
              appwriteConfig.databaseId,
              appwriteConfig.accountsCollectionId,
              currentUser.$id, // Use user's ID as document ID
              defaultAccountData,
              [
                Permission.read(Role.user(currentUser.$id)),   // User can read their own doc
                Permission.update(Role.user(currentUser.$id)), // User can update their own doc
                Permission.read(Role.any())                     // Profiles are public
              ]
            );
            console.log(`[Home] Successfully created account document for user ${currentUser.$id}.`);
            // Optionally, trigger a context update if needed, though subsequent fetches should get it
            // await updateUserProfile();
          } catch (createError) {
            console.error(`[Home] Failed to create account document for ${currentUser.$id}:`, createError);
          }
        } else {
          // Log other errors during getDocument
          console.error(`[Home] Error checking account document for ${currentUser.$id}:`, err);
        }
      }
    };

    ensureAccountDocumentExists();
  }, [currentUser, authLoading]); // Dependencies: Run when user or loading state changes

  useEffect(() => {
    const fetchVideos = async () => {
      setLoading(true);
      setError(null); // Reset error state
      try {
        // Fetch videos from Appwrite
        const response = await databases.listDocuments(
          appwriteConfig.databaseId,
          appwriteConfig.videosCollectionId,
          [Query.orderDesc('$createdAt')] // Example: Order by creation date, newest first
        );

        // Use Promise.all to handle async fetching of creator details within the map
        const fetchedVideos = await Promise.all(response.documents.map(async (doc) => {
            // --- Extract Creator ID from Permissions ---
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
            // Fallback to denormalized attribute if needed
            if (!creatorId && doc.creatorId) {
               creatorId = doc.creatorId;
            }

            // --- Initialize Channel Info (using denormalized data as initial fallback) ---
            let channelName = doc.channelName || 'Unknown Channel';
            let channelAvatarUrl = doc.channelProfileImageUrl || null;
            let channelBio = ''; // Initialize bio
            let creatorAccountNameFallback = null; // Variable to store name from account.get if needed

            // --- Fetch Creator Details if ID exists ---
            if (creatorId) {
                try {
                   const accountDetailsDoc = await databases.getDocument(
                     appwriteConfig.databaseId,
                     appwriteConfig.accountsCollectionId,
                     creatorId
                   );
                   channelName = accountDetailsDoc.name || channelName;
                   channelBio = accountDetailsDoc.bio || '';
                   if (accountDetailsDoc.profileImageUrl && !channelAvatarUrl) {
                       channelAvatarUrl = accountDetailsDoc.profileImageUrl;
                   }
                } catch (detailsError) {
                   if (detailsError.code === 404) {
                     try {
                       const creatorAccount = await account.get(creatorId);
                       creatorAccountNameFallback = creatorAccount.name;
                       channelName = creatorAccountNameFallback || channelName;
                     } catch {}
                   }
                }
            }

            // --- Final Avatar Fallback Logic ---
            if (!channelAvatarUrl) {
                channelAvatarUrl = creatorId
                    ? avatars.getInitials(creatorId).href
                    : avatars.getInitials(channelName || '?').href;
            }

            // --- Generate Thumbnail URL using thumbnail_id ---
            let thumbnailUrl = 'https://via.placeholder.com/320x180/CCCCCC/969696?text=No+Thumbnail';
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
                    console.warn(`[Home/${doc.$id}] Error fetching view counts:`, countsError);
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
                    id: creatorId || doc.channelId || `channel-${doc.$id}`,
                    name: channelName,
                    profileImageUrl: channelAvatarUrl,
                    bio: channelBio,
                    creatorUserId: creatorId
                }
            };
        }));

        setVideos(fetchedVideos); // Set fetched data
      } catch (err) {
        setError(err.message || "An unknown error occurred while fetching videos.");
      } finally {
        setLoading(false); // Stop loading indicator
      }
    };

    fetchVideos();
  }, []); // Empty dependency array means this effect runs once on mount

  // Display Loading State
  if (loading) {
    return (
      <div className="loading-container">
        {/* You can use a more sophisticated spinner/skeleton loader here */}
        <div className="loading-spinner"></div>
        <p>Loading videos...</p>
      </div>
    );
  }

  // Display Error State
  if (error) {
    return (
      <div className="error-container">
        <h2>Oops! Something went wrong.</h2>
        <p>{error}</p>
        {/* Optionally add a retry button */}
        {/* <button onClick={fetchVideos}>Try Again</button> */}
      </div>
    );
  }

  // Display Content (Video Grid)
  return (
    <div className="home-container">
      {/* You might add filter chips or other elements here later */}
      {/* <div className="filter-chips">...</div> */}

      <div className="videos-grid">
        {videos.map((video) => (
          <VideoCard key={video.id} video={video} isRelated={false} />
        ))}
      </div>
      {/* No specific styles needed here as they are in App.css */}
    </div>
  );
};

export default Home;
