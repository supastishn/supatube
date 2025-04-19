import React from 'react';
import { useParams } from 'react-router-dom';

// Basic placeholder for Profile page
const Profile = () => {
  const { userId } = useParams(); // Get userId from URL

  // TODO: Fetch user profile data based on userId
  // Handle case where userId might be 'me' for the logged-in user

  const isOwnProfile = userId === 'me'; // Placeholder logic

  return (
    <div className="profile-container">
      <h1>User Profile</h1>
      <p>Displaying profile for user ID: {userId}</p>
      {isOwnProfile && <p>(This is your profile)</p>}

      {/* TODO: Display user information, uploaded videos, settings (if own profile) */}
      <div className="profile-details">
         <h2>User Details</h2>
         <p>Username: SampleUser_{userId}</p>
         <p>Joined: January 1, 2024</p>
         {isOwnProfile && <button>Edit Profile</button>}
      </div>

      <div className="user-videos">
         <h2>Uploaded Videos</h2>
         <p>Video list will appear here...</p>
         {/* Map through user's videos and render VideoCards */}
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
      `}</style>
    </div>
  );
};

export default Profile;
