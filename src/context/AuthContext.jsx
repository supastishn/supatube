import { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { account, avatars, databases } from '../lib/appwriteConfig';
import { appwriteConfig } from '../lib/appwriteConfig';
import { ID, Permission, Role, Query } from 'appwrite';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null); // Keep core user data (id, name, email)
  const [accountDetails, setAccountDetails] = useState({ // State for bio, profile image, subs
      bio: '',
      profileImageUrl: null,
      subscribingTo: []
  });
  const [likedVideoIds, setLikedVideoIds] = useState(new Set());
  const [dislikedVideoIds, setDislikedVideoIds] = useState(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkUserStatus();
  }, []);

  // Helper to fetch user data including video states
  const fetchUserDataAndStates = async (userId) => {
    let accountDoc = null;
    let fetchedLikedIds = new Set();
    let fetchedDislikedIds = new Set();

    // Fetch core account details first
    try {
        accountDoc = await databases.getDocument(
            appwriteConfig.databaseId,
            appwriteConfig.accountsCollectionId,
            userId
        );
    } catch (error) {
        if (error.code !== 404) {
            console.error("Failed to fetch account details:", error);
        }
        // Proceed even if account doc doesn't exist yet, defaults will be used
    }

    // Fetch video states
    try {
        console.log(`[AuthContext] Fetching video states for user ${userId}...`);
        // Simple fetch up to 5000 states (adjust limit if needed, or implement pagination)
        const stateResponse = await databases.listDocuments(
            appwriteConfig.databaseId,
            appwriteConfig.userVideoStatesCollectionId, // Use the new collection ID
            [
                Query.equal('userId', userId),
                Query.limit(5000) // Adjust limit as necessary
            ]
        );
        stateResponse.documents.forEach(doc => {
            if (doc.state === 'liked') {
                fetchedLikedIds.add(doc.videoId);
            } else if (doc.state === 'disliked') {
                fetchedDislikedIds.add(doc.videoId);
            }
        });
        console.log(`[AuthContext] Fetched ${fetchedLikedIds.size} liked, ${fetchedDislikedIds.size} disliked states.`);
    } catch (stateError) {
        console.error("Failed to fetch user video states:", stateError);
        // Proceed with empty sets on error
    }

    return {
        bio: accountDoc?.bio || '', // Default if doc or field is missing
        profileImageUrl: accountDoc?.profileImageUrl || null,
        subscribingTo: accountDoc?.subscribingTo || [],
        initialLikedIds: fetchedLikedIds,
        initialDislikedIds: fetchedDislikedIds
    };
  };

  // Check if user is logged in and fetch preferences
  const checkUserStatus = async () => {
    setLoading(true);
    try {
        const currentAccount = await account.get();
        const userData = await fetchUserDataAndStates(currentAccount.$id); // Fetch combined data

        setUser(currentAccount); // Set core user data
        setAccountDetails({ // Set details separately
            bio: userData.bio,
            profileImageUrl: userData.profileImageUrl,
            subscribingTo: userData.subscribingTo
        });
        setLikedVideoIds(userData.initialLikedIds);
        setDislikedVideoIds(userData.initialDislikedIds);

        console.log("[AuthContext] User status checked, state updated.");

    } catch (error) {
        if (error.code !== 401) {
            console.error("Error checking user status:", error);
        }
        setUser(null);
        setAccountDetails({ bio: '', profileImageUrl: null, subscribingTo: [] }); // Reset details
        setLikedVideoIds(new Set()); // Reset sets
        setDislikedVideoIds(new Set());
    } finally {
        setLoading(false);
    }
  };

  // Register new user
  const register = async (email, password, name) => {
    try {
      const newAccount = await account.create(
        ID.unique(),
        email,
        password,
        name
      );
      const userId = newAccount.$id;

      if (newAccount) {
        try {
          await databases.createDocument(
            appwriteConfig.databaseId,
            appwriteConfig.accountsCollectionId,
            userId,
            { // Data for the accounts document
              name: name,
              bio: '',
              profileImageUrl: null,
              subscribingTo: [] // REMOVED videosLiked, videosDisliked
            },
            [ // Permissions
              Permission.read(Role.user(userId)),
              Permission.update(Role.user(userId)),
              Permission.read(Role.any())
            ]
          );
          console.log(`[AuthContext] Successfully created account details document for user ${userId}.`);
        } catch (docError) {
          console.error("Failed to create account details document:", docError);
          // Proceed to login anyway
        }
        await login(email, password); // login will call checkUserStatus to fetch everything
      }
    } catch (error) {
      throw error;
    }
  };

  // Login user
  const login = async (email, password) => {
    try {
        await account.createEmailPasswordSession(email, password);
        // Call checkUserStatus to fetch all data including states
        await checkUserStatus();
        // Optional: return the user object if needed immediately after login
        // const loggedInUser = await account.get();
        // return loggedInUser;
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
      const userData = await fetchUserDataAndStates(currentAccount.$id); // Re-fetch combined data

      setUser(currentAccount); // Update core user data
      setAccountDetails({ // Update details separately
          bio: userData.bio,
          profileImageUrl: userData.profileImageUrl,
          subscribingTo: userData.subscribingTo
      });
      setLikedVideoIds(userData.initialLikedIds);
      setDislikedVideoIds(userData.initialDislikedIds);

      console.log("[AuthContext] User profile context refreshed.");
      // Return combined data if needed
      // return { ...currentAccount, ...userData };
    } catch (error) {
      console.error("Failed to refresh user profile context:", error);
      // Handle potential logout or error display
      return null;
    }
  };

  const updateClientVideoStates = (videoId, action) => {
    setLikedVideoIds(currentLiked => {
        const newLiked = new Set(currentLiked);
        if (action === 'like') {
            if (newLiked.has(videoId)) newLiked.delete(videoId); // Toggle off
            else newLiked.add(videoId); // Toggle on
        } else if (action === 'dislike') {
            newLiked.delete(videoId); // Remove like if disliking
        }
        console.log(`[AuthContext Optimistic] Liked set updated. Size: ${newLiked.size}`);
        return newLiked;
    });
    setDislikedVideoIds(currentDisliked => {
        const newDisliked = new Set(currentDisliked);
        if (action === 'dislike') {
            if (newDisliked.has(videoId)) newDisliked.delete(videoId); // Toggle off
            else newDisliked.add(videoId); // Toggle on
        } else if (action === 'like') {
            newDisliked.delete(videoId); // Remove dislike if liking
        }
         console.log(`[AuthContext Optimistic] Disliked set updated. Size: ${newDisliked.size}`);
        return newDisliked;
    });
     console.log(`[AuthContext Optimistic] Updated client state sets for ${videoId}, action ${action}`);
  };

  const value = {
    user,
    accountDetails, // Expose details separately
    loading,
    likedVideoIds,      // Expose the Set
    dislikedVideoIds,   // Expose the Set
    register,
    login,
    logout,
    getAvatarUrl,
    checkUserStatus,
    updateUserProfile,
    updateClientVideoStates, // Expose the new function
    // remove updateUserLikeDislikeState
    account, // Keep access to account service if needed elsewhere
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
