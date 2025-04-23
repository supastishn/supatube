import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { databases } from '../lib/appwriteConfig';
import { appwriteConfig } from '../lib/appwriteConfig';

const Account = () => {
  const { user, account, updateUserProfile } = useAuth(); // Get user, account obj, and update function
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

      // Update 'accounts' document if bio or profileImageUrl changed
      const bioChanged = bio !== (user?.bio || '');
      const imageUrlChanged = profileImageUrl !== (user?.profileImageUrl || '');

      if (bioChanged || imageUrlChanged) {
        await databases.updateDocument(
          appwriteConfig.databaseId,
          appwriteConfig.accountsCollectionId,
          user.$id,
          { bio: bio, profileImageUrl: profileImageUrl }
        );
        detailsUpdated = true;
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
      `}</style>
    </div>
  );
};

export default Account;
