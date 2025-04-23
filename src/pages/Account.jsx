import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { databases } from '../lib/appwriteConfig';
import { appwriteConfig } from '../lib/appwriteConfig';
import { Permission, Role } from 'appwrite'; // Add Permission and Role

const Account = () => {
  const { user, account, updateUserProfile, logout } = useAuth(); // Get user, account obj, update function, and logout
  const [name, setName] = useState('');
  const [bio, setBio] = useState(''); // Renamed from description to bio
  const [profileImageUrl, setProfileImageUrl] = useState(''); // Add state for profile image URL
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Populate form with current user data when component mounts or user changes
  useEffect(() => {
    if (user) {
      setName(user.name || '');
      // Read directly from user object properties populated by context
      setBio(user.bio || ''); // Use user.bio
      setProfileImageUrl(user.profileImageUrl || ''); // Use user.profileImageUrl
    }
  }, [user]); // Re-run effect if user object changes

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    let nameUpdated = false;
    let detailsUpdated = false;

    try {
      // Update name if it has changed
      if (name !== (user?.name || '')) {
        await account.updateName(name);
        nameUpdated = true;
      }

      // Check if any of the details (name, bio, image) need DB update/creation
      const bioChanged = bio !== (user?.bio || '');
      const imageUrlChanged = profileImageUrl !== (user?.profileImageUrl || '');
      const nameChanged = name !== (user?.name || '');

      if (bioChanged || imageUrlChanged || nameChanged || nameUpdated) {
        // Prepare the data object with all current profile fields
        const accountDataPayload = {
          name: name, // Always include the current name state
          bio: bio,
          profileImageUrl: profileImageUrl
        };
        
        try {
          await databases.updateDocument(
            appwriteConfig.databaseId,
            appwriteConfig.accountsCollectionId,
            user.$id,
            accountDataPayload
          );
          detailsUpdated = true;
        } catch (docError) {
          // If the document wasn't found (404), create it instead
          if (docError.code === 404) {
            try {
              await databases.createDocument(
                appwriteConfig.databaseId,
                appwriteConfig.accountsCollectionId,
                user.$id, // Use user's ID as document ID
                accountDataPayload, // Use the combined payload
                [
                  Permission.read(Role.user(user.$id)),   // User can read their own doc
                  Permission.update(Role.user(user.$id)), // User can update their own doc
                  Permission.read(Role.any())             // Profiles are public
                ]
              );
              detailsUpdated = true; // Mark as updated since we created it
            } catch (createError) {
               // If creation also fails, throw the creation error
               throw createError;
            }
          } else {
            // If it was an error other than 404, re-throw it
            throw docError;
          }
        }
      }

      // Refresh the user state in the context to reflect changes
      await updateUserProfile();

      if (nameUpdated || detailsUpdated) {
          setSuccess('Account updated successfully!');
      } // Only show success if something actually changed

    } catch (err) {
      setError(err.message || 'Failed to update account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    // Should be handled by ProtectedRoute, but good fallback
    return <div>Please log in to view your account details.</div>;
  }

  return (
    <div className="account-container">
      <h1>Your Account</h1>

      {error && <p className="form-error">{error}</p>}
      {success && <p className="form-success">{success}</p>}

      <form onSubmit={handleSubmit} className="account-form">
        <div className="form-group">
          <label htmlFor="name">Display Name</label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="form-input"
          />
        </div>


        <div className="form-group">
          <label htmlFor="email">Email</label>
          {/* Email is usually not editable */}
          <input
            type="email"
            id="email"
            value={user.email || ''}
            disabled
            readOnly
            className="form-input disabled"
          />
        </div>

        <div className="form-group">
          <label htmlFor="bio">Bio</label>
          <textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows="4"
            placeholder="Tell us a bit about yourself or your channel"
            className="form-textarea"
          />
        </div>

        <div className="form-group">
          <label htmlFor="profileImageUrl">Profile Image URL</label>
          <input
            type="url"
            id="profileImageUrl"
            value={profileImageUrl}
            onChange={(e) => setProfileImageUrl(e.target.value)}
            placeholder="https://example.com/your-avatar.jpg"
            className="form-input"
          />
          <small>Provide a URL to your desired profile picture.</small>
        </div>

        <button type="submit" disabled={loading || !user} className="btn-primary">
          {loading ? 'Saving...' : 'Save Changes'}
        </button>
      </form>

      <button onClick={logout} className="btn-secondary logout-button">
        Sign Out
      </button>

      {/* Simple styling - can be moved to CSS file */}
      <style jsx>{`
        .account-container {
          max-width: 600px;
          margin: 40px auto;
          padding: 20px;
        }
        h1 {
          margin-bottom: 20px;
        }
        .account-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        label {
          font-weight: 500;
        }
        .form-input, .form-textarea {
          padding: 10px;
          border: 1px solid #ccc;
          border-radius: 4px;
          font-size: 1rem;
        }
        .form-group small {
            font-size: 0.8rem;
            color: #606060;
        }
        .form-input.disabled {
          background-color: #f0f0f0;
          cursor: not-allowed;
        }
        .btn-primary {
          padding: 10px 15px;
          background-color: var(--primary);
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 1rem;
          align-self: flex-start; /* Align button to the left */
        }
        .btn-primary:disabled {
          background-color: var(--gray);
          cursor: not-allowed;
        }
        .form-error {
          color: red;
          margin-bottom: 10px;
        }
        .form-success {
          color: green;
          margin-bottom: 10px;
        }
        .logout-button {
          margin-top: 30px; /* Space above the logout button */
          padding: 10px 15px;
          background-color: var(--light-gray); /* Use a secondary style */
          color: var(--text-secondary);
          border: 1px solid var(--gray);
          border-radius: 4px;
          cursor: pointer;
          font-size: 1rem;
          align-self: flex-start;
        }
        .logout-button:hover {
          background-color: #e0e0e0;
          color: var(--text);
        }
      `}</style>
    </div>
  );
};

export default Account;
