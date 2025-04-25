import { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { account, avatars, databases } from '../lib/appwriteConfig';
import { appwriteConfig } from '../lib/appwriteConfig';
import { ID, Permission, Role } from 'appwrite';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkUserStatus();
  }, []);

  // Helper to fetch account details (bio, profileImageUrl)
  const fetchAccountDetails = async (userId) => {
    try {
      const doc = await databases.getDocument(
        appwriteConfig.databaseId,
        appwriteConfig.accountsCollectionId,
        userId
      );
      return {
        bio: doc.bio,
        profileImageUrl: doc.profileImageUrl,
        videosLiked: doc.videosLiked || [], // Add this, default to empty array
        videosDisliked: doc.videosDisliked || [], // Add this, default to empty array
        subscribingTo: doc.subscribingTo || [] // Add subscribingTo field
      };
    } catch (error) {
      // Handle 404 Not Found specifically - means no profile doc exists yet
      if (error.code === 404) {
        return { bio: '', profileImageUrl: null, videosLiked: [], videosDisliked: [], subscribingTo: [] }; // Add defaults
      }
      console.error("Failed to fetch account details:", error);
      // Return defaults for other errors
      return { bio: '', profileImageUrl: null };
    }
  };

  // Check if user is logged in and fetch preferences
  const checkUserStatus = async () => {
    setLoading(true); // Ensure loading is true at the start
    try {
      const currentAccount = await account.get();
      // Fetch details from 'accounts' collection instead of prefs
      const accountDetails = await fetchAccountDetails(currentAccount.$id);
      setUser({ ...currentAccount, ...accountDetails }); // Merge account data with details
    } catch (error) {
      // Only log error if it's not the expected "not logged in" error (401)
      if (error.code !== 401) {
        console.error("Error checking user status:", error);
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  // Register new user
  const register = async (email, password, name, profileImageUrl) => { // Remove username parameter
    try {
      // 1. Create the user account
      const newAccount = await account.create(
        ID.unique(),
        email,
        password,
        name
      );
      const userId = newAccount.$id;

      if (newAccount) {
        // 2. Attempt to create the corresponding document in 'accounts' collection
        try {
          await databases.createDocument(
            appwriteConfig.databaseId,
            appwriteConfig.accountsCollectionId,
            userId, // Use the new user's ID as the document ID
            {
              bio: '', // Initialize bio as empty
              profileImageUrl: profileImageUrl?.trim() || null, // Store provided URL or null
              name: name, // Store the provided name
              videosLiked: [], // Initialize empty array
              videosDisliked: [], // Initialize empty array
              subscribingTo: [] // Initialize empty subscription array
            },
            [
              Permission.read(Role.user(userId)), // User can read their own doc
              Permission.update(Role.user(userId)), // User can update their own doc
              Permission.read(Role.any()) // Make profiles public
            ]
          );
        } catch (docError) {
          console.error("Failed to create account details document:", docError);
          // Decide how to handle this - user exists but details doc failed.
          // For now, we proceed to login. The user can update details later.
        }

        // Log in the user immediately after registration
        await login(email, password); // login calls checkUserStatus which fetches the new doc
      }
    } catch (error) {
      throw error;
    }
  };

  // Login user
  const login = async (email, password) => {
    try {
      await account.createEmailPasswordSession(email, password);
      const currentAccount = await account.get();
      setUser(currentAccount);
      return currentAccount;
    } catch (error) {
      throw error;
    }
  };

  // Logout user
  const logout = async () => {
    try {
      await account.deleteSession('current');
      setUser(null);
      navigate('/sign-in');
    } catch (error) {
      // Logout error
    }
  };

  // Get user avatar URL
  const getAvatarUrl = (userId) => {
    return avatars.getInitials(userId || (user ? user.$id : "Guest"));
  };

  // Function to manually refresh user data + details after an update
  const updateUserProfile = async () => {
    try {
      const currentAccount = await account.get();
      // Fetch details from 'accounts' collection
      const accountDetails = await fetchAccountDetails(currentAccount.$id);
      setUser({ ...currentAccount, ...accountDetails });
      console.log("Updated user profile in context:", { ...currentAccount, ...accountDetails });
      return { ...currentAccount, ...accountDetails }; // Return updated user object
    } catch (error) {
      // Failed to refresh user profile
      // Optionally handle logout or error display if fetching fails critically
      return null;
    }
  };

  const value = {
    user,
    loading,
    register,
    login,
    logout,
    getAvatarUrl,
    checkUserStatus,
    updateUserProfile,
    account,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
