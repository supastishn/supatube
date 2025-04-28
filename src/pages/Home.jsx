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
            console.log(`[Home/${doc.$id}] Permissions:`, permissions); // Log permissions
            const deletePermissionRegex = /^delete\("user:(.+)"\)$/;

            for (const perm of permissions) {
              const match = perm.match(deletePermissionRegex);
              if (match && match[1]) {
                  creatorId = match[1];
                  break;
              }
            }
            console.log(`[Home/${doc.$id}] Extracted Creator ID:`, creatorId); // Log extracted ID
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
                console.log(`[Home/${doc.$id}] Attempting to fetch account details from DB for creatorId: ${creatorId}`);
                // --- PRIMARY: Fetch account details (name, bio, profileImageUrl) from 'accounts' collection ---
                try {
                   const accountDetailsDoc = await databases.getDocument(
                     appwriteConfig.databaseId,
                     appwriteConfig.accountsCollectionId,
                     creatorId
                   );
                   console.log(`[Home/${doc.$id}] Fetched account details document:`, accountDetailsDoc);
                   channelName = accountDetailsDoc.name || channelName; // Prioritize name from DB doc
                   channelBio = accountDetailsDoc.bio || ''; // Get bio
                   // Use DB profile image URL if available and no video-specific denormalized one exists
                   if (accountDetailsDoc.profileImageUrl && !channelAvatarUrl) {
                       channelAvatarUrl = accountDetailsDoc.profileImageUrl;
                       console.log(`[Home/${doc.$id}] Using profile image URL from accounts collection: ${channelAvatarUrl}`);
                   }
                   console.log(`[Home/${doc.$id}] Channel name set from DB doc: '${channelName}'`);

                } catch (detailsError) {
                   if (detailsError.code === 404) {
                     console.warn(`[Home/${doc.$id}] No account details document found for creator ${creatorId}. Falling back.`);
                     // FALLBACK: Try fetching the core Appwrite account name if DB doc fails
                     try {
                       const creatorAccount = await account.get(creatorId);
                       creatorAccountNameFallback = creatorAccount.name;
                       channelName = creatorAccountNameFallback || channelName; // Use core account name as fallback
                       console.log(`[Home/${doc.$id}] Channel name set from account.get fallback: '${channelName}'`);
                     } catch (accountGetError) {
                       console.warn(`[Home/${doc.$id}] Could not fetch core account details for creator ${creatorId}:`, accountGetError);
                     }
                   } else {
                     console.warn(`[Home/${doc.$id}] Error fetching account details document for creator ${creatorId}:`, detailsError);
                    }
                }
            }

            // --- Final Avatar Fallback Logic ---
            if (!channelAvatarUrl) {
                channelAvatarUrl = creatorId
                    ? avatars.getInitials(creatorId).href // Initials from ID first
                    : avatars.getInitials(channelName || '?').href; // Then from name, then '?'
            }

            // --- Generate Thumbnail URL using thumbnail_id ---
            let thumbnailUrl = 'https://via.placeholder.com/320x180/CCCCCC/969696?text=No+Thumbnail'; // Default fallback
            console.log(`[Thumb/${doc.$id}] Checking doc.thumbnail_id:`, doc.thumbnail_id); // Log the ID attribute
            if (doc.thumbnail_id) { // Check if the thumbnail file ID exists
                try {
                    thumbnailUrl = storage.getFilePreview(
                        appwriteConfig.storageVideosBucketId, // The bucket where thumbnails are stored
                        doc.thumbnail_id                    // The attribute holding the thumbnail's File ID
                    ); // Get the URL string
                    //print(doc.thumbnail_id)
                } catch (previewError) {
                    console.error(`[Thumb/${doc.$id}] Error generating thumbnail preview URL:`, previewError);
                }
            }
            console.log(`[Thumb/${doc.$id}] Final thumbnailUrl used:`, thumbnailUrl); // Log the final URL

            console.log(`[Home/${doc.$id}] Final Channel Data for Card:`, { 
                id: creatorId || doc.channelId || `channel-${doc.$id}`, 
                name: channelName, 
                profileImageUrl: channelAvatarUrl, 
                creatorUserId: creatorId,
                bio: channelBio // Add bio
            }); // Log final data
            
            return {
                id: doc.$id,
                title: doc.title || 'Untitled Video', // Provide fallback
                thumbnailUrl: thumbnailUrl, // Use the generated or fallback URL
                durationSeconds: doc.video_duration || 0, // Use video_duration attribute
                viewCount: doc.viewCount || 0, // Provide fallback
                uploadedAt: doc.$createdAt, // Use Appwrite's built-in timestamp
                channel: {
                    id: creatorId || doc.channelId || `channel-${doc.$id}`, // Use creatorId if available
                    name: channelName, // Use potentially fetched name
                    profileImageUrl: channelAvatarUrl, // Use determined avatar URL
                    bio: channelBio, // Add bio here
                    creatorUserId: creatorId // Pass the creator user ID explicitly
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
