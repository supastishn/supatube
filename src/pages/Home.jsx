import { useState, useEffect } from 'react';
import VideoCard from '../components/VideoCard'; // Assuming VideoCard component is in ../components
import { databases, storage, avatars, account } from '../lib/appwriteConfig';
import { Query } from 'appwrite';
import { appwriteConfig } from '../lib/appwriteConfig';

const Home = () => {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

            // --- Fetch Creator Details if ID exists ---
            if (creatorId) {
                console.log(`[Home/${doc.$id}] Attempting to fetch account for creatorId: ${creatorId}`);
                try {
                    const creatorAccount = await account.get(creatorId);
                    console.log(`[Home/${doc.$id}] Fetched account:`, creatorAccount); // Log fetched account
                    channelName = creatorAccount.name || channelName; // Prioritize fetched name
                    console.log(`[Home/${doc.$id}] Channel name after fetch: '${channelName}' (Used: ${creatorAccount.name ? 'Fetched' : 'Fallback'})`);

                    // Use fetched profile image URL if available and no denormalized one exists
                    const prefs = creatorAccount.prefs || {};
                    if (prefs.profileImageUrl && !channelAvatarUrl) {
                        channelAvatarUrl = prefs.profileImageUrl;
                        console.log(`[Home/${doc.$id}] Using profile image URL from prefs: ${channelAvatarUrl}`);
                    }
                } catch (userFetchError) {
                    // Handle or log error fetching user details (e.g., permissions issue)
                    console.warn(`[Home/${doc.$id}] Could not fetch details for creator ${creatorId}:`, userFetchError);
                    // Continue with potentially denormalized data
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
                    ).href; // Get the URL string
                } catch (previewError) {
                    console.error(`[Thumb/${doc.$id}] Error generating thumbnail preview URL:`, previewError);
                }
            }
            console.log(`[Thumb/${doc.$id}] Final thumbnailUrl used:`, thumbnailUrl); // Log the final URL

            console.log(`[Home/${doc.$id}] Final Channel Data for Card:`, { 
                id: creatorId || doc.channelId || `channel-${doc.$id}`, 
                name: channelName, 
                profileImageUrl: channelAvatarUrl, 
                creatorUserId: creatorId 
            }); // Log final data
            
            return {
                id: doc.$id,
                title: doc.title || 'Untitled Video', // Provide fallback
                thumbnailUrl: thumbnailUrl, // Use the generated or fallback URL
                durationSeconds: doc.durationSeconds || 0, // Provide fallback
                viewCount: doc.viewCount || 0, // Provide fallback
                uploadedAt: doc.$createdAt, // Use Appwrite's built-in timestamp
                channel: {
                    id: creatorId || doc.channelId || `channel-${doc.$id}`, // Use creatorId if available
                    name: channelName, // Use potentially fetched name
                    profileImageUrl: channelAvatarUrl, // Use determined avatar URL
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
