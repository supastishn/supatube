import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { databases, appwriteConfig, storage, avatars, account } from '../lib/appwriteConfig';
import { Query } from 'appwrite'; // Import Query directly from appwrite package
import VideoCard from '../components/VideoCard'; // Assumes VideoCard is in components folder
import '../App.css'; // Using general App styles, adjust if needed

const SearchResults = () => {
  const location = useLocation();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    // Extract the search query from URL parameters
    const searchParams = new URLSearchParams(location.search);
    const searchQuery = searchParams.get('query');
    setQuery(searchQuery || ''); // Update state to display the query

    if (searchQuery && searchQuery.trim() !== '') {
      const fetchSearchResults = async () => {
        setLoading(true);
        setError(null);
        setVideos([]); // Clear previous results
        try {
          // --- Search Appwrite Database ---
          // Ensure the 'title' attribute is indexed in your Appwrite collection!
          // You might want to index 'description' as well if you add it below.
          const response = await databases.listDocuments(
            appwriteConfig.databaseId,
            appwriteConfig.videosCollectionId,
            [
              Query.search('title', searchQuery.trim()), // Search the 'title' field
              // Optional: Add more search queries combined with OR logic if needed,
              // but Appwrite's basic search might have limitations.
              // Searching a single indexed field is often most reliable.
              // Example: Query.search('description', searchQuery.trim()),
              Query.limit(25), // Limit results per page (optional)
              Query.orderDesc('$createdAt') // Order results (optional)
            ]
          );

          // --- Process search results like in Home.jsx ---
          const fetchedVideos = await Promise.all(response.documents.map(async (doc) => {
            // Extract Creator ID from Permissions
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
            if (!creatorId && doc.creatorId) { creatorId = doc.creatorId; } // Fallback

            // --- Initialize Channel Info ---
            let channelName = doc.channelName || 'Unknown Channel';
            let channelAvatarUrl = doc.channelProfileImageUrl || null;
            let channelBio = ''; // Initialize bio

            // --- Fetch Creator Details if ID exists ---
            if (creatorId) {
              try {
                const creatorAccount = await account.get(creatorId);
                channelName = creatorAccount.name || channelName;

                // --- Fetch account details (bio, profileImageUrl) from 'accounts' collection ---
                try {
                  const accountDetailsDoc = await databases.getDocument(
                      appwriteConfig.databaseId,
                      appwriteConfig.accountsCollectionId,
                      creatorId
                  );
                  if (accountDetailsDoc.profileImageUrl && !channelAvatarUrl) {
                      channelAvatarUrl = accountDetailsDoc.profileImageUrl;
                  }
                  channelBio = accountDetailsDoc.bio || '';
                } catch (detailsError) {
                  if (detailsError.code !== 404) console.warn(`[Search/${doc.$id}] Could not fetch account details for creator ${creatorId}:`, detailsError);
                }
              } catch (userFetchError) {
                // ignore
              }
            }

            // Final Avatar Fallback Logic
            if (!channelAvatarUrl) {
              channelAvatarUrl = creatorId
                ? avatars.getInitials(creatorId).href
                : avatars.getInitials(channelName || '?').href;
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
                console.warn(`[SearchResults/${doc.$id}] Error fetching view counts:`, countsError);
              }
            }

            // Construct video object for VideoCard
            return {
              id: doc.$id,
              title: doc.title || 'Untitled Video',
              thumbnailUrl: thumbnailUrl,
              durationSeconds: doc.durationSeconds || 0,
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

          setVideos(fetchedVideos); // Set processed videos
        } catch (err) {
          console.error('Failed to fetch search results:', err);
          // Provide a user-friendly error message
          if (err.message.includes("index")) {
             setError('Search cannot be performed. Required database index is missing. Please contact the administrator.');
          } else {
             setError('Failed to load search results. Please try again later.');
          }
        } finally {
          setLoading(false);
        }
      };

      fetchSearchResults();
    } else {
      // Handle cases where there is no query or it's empty
      setQuery('');
      setVideos([]);
      setLoading(false);
      setError(searchQuery === null ? null : 'Please enter a search term.'); // Show error only if attempted empty search
    }
  }, [location.search]); // Re-run effect when the URL search string changes

  return (
    <div className="search-results-container page-container">
      {query && <h2>Search Results for: "{query}"</h2>}
      {!query && !loading && !error && <h2>Enter a term in the search bar above.</h2>}

      {loading && <div className="loading-container">Loading results...</div>}
      {error && <div className="error-message">{error}</div>}

      {!loading && !error && query && videos.length === 0 && (
        <p>No videos found matching your search term "{query}".</p>
      )}

      {!loading && !error && videos.length > 0 && (
        <div className="video-grid"> {/* Use the same grid layout as Home */}
          {videos.map((video) => (
            <VideoCard key={video.$id} video={video} />
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchResults;
