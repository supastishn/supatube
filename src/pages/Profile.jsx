import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { storage, databases, appwriteConfig } from '../lib/appwriteConfig';
import { Query } from 'appwrite'; // Import Query directly from appwrite package
import VideoCard from '../components/VideoCard'; // Import VideoCard
import { useAuth } from '../context/AuthContext'; // Optional: To check if it's the current user's profile

const Profile = () => {
  const { userId } = useParams(); // Get userId from URL
  const navigate = useNavigate(); // Add navigate for redirection
  const { user: currentUser } = useAuth(); // Get currently logged-in user (optional)

  const [userData, setUserData] = useState(null);
  const [userVideos, setUserVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const isOwnProfile = currentUser && currentUser.$id === userId; // Check if it's the logged-in user's profile

  useEffect(() => {
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

        // 2. Fetch User's Videos (from 'videos' collection)
        // Filter videos based on document permissions rather than creatorId
        const videoResponse = await databases.listDocuments(
          appwriteConfig.databaseId,
          appwriteConfig.videosCollectionId,
          [
            // No creatorId filter here - we'll filter client-side based on permissions
            Query.orderDesc('$createdAt'),   // Show newest videos first
            Query.limit(100)                 // Limit to avoid excessive data transfer
          ]
        );
        
        // Filter documents client-side based on delete permission for the profile user
        const userOwnedVideos = videoResponse.documents.filter(doc => {
          // Check if the userId has a delete permission in the document
          return doc.$permissions.some(perm => {
            const deletePermRegex = new RegExp(`^delete\\("user:${userId}"\\)$`);
            return deletePermRegex.test(perm);
          });
        });
        
        setUserVideos(userOwnedVideos);

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
        <h1>{userData.name || 'Unnamed User'}</h1>
        {userData.bio && <p className="profile-bio">{userData.bio}</p>}
        {/* You might want to format the join date from userData.$createdAt if needed */}
        {/* Example: <p>Joined: {format(parseISO(userData.$createdAt), 'MMMM d, yyyy')}</p> */}
        {isOwnProfile && <button className="btn-primary" onClick={() => navigate('/account')}>Edit Profile</button>}
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
                    viewCount: video.viewCount || 0,
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
         .profile-bio {
             color: var(--text-secondary);
             margin-bottom: 20px;
             white-space: pre-wrap; /* Preserve line breaks in bio */
         }
      `}</style>
    </div>
  );
};

export default Profile;
