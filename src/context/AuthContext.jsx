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
    let accountVideosLiked = []; // Initialize as empty arrays
    let accountVideosDisliked = [];

    // Fetch core account details first
    try {
        accountDoc = await databases.getDocument(
            appwriteConfig.databaseId,
            appwriteConfig.accountsCollectionId,
            userId
        );
        // --- Get arrays directly from accountDoc ---
        accountVideosLiked = accountDoc?.videosLiked || [];
        accountVideosDisliked = accountDoc?.videosDisliked || [];
        console.log(`[AuthContext] Fetched account arrays: Liked(${accountVideosLiked.length}), Disliked(${accountVideosDisliked.length})`);

    } catch (error) {
        if (error.code !== 404) {
            console.error("Failed to fetch account details:", error);
        } else {
            console.log(`[AuthContext] Account doc not found for ${userId}, using empty arrays.`);
        }
        // Proceed even if account doc doesn't exist yet, defaults will be used
    }

    return {
        bio: accountDoc?.bio || '', // Default if doc or field is missing
        profileImageUrl: accountDoc?.profileImageUrl || null,
        subscribingTo: accountDoc?.subscribingTo || [],
        // --- Return the arrays fetched from account ---
        initialLikedIds: accountVideosLiked,
        initialDislikedIds: accountVideosDisliked
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
        // --- Initialize Sets directly from the fetched account arrays ---
        setLikedVideoIds(new Set(userData.initialLikedIds));
        setDislikedVideoIds(new Set(userData.initialDislikedIds));

        console.log("[AuthContext] User status checked, state updated from account arrays.");

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
          // Create account document WITH NEW ARRAYS
          await databases.createDocument(
            appwriteConfig.databaseId,
            appwriteConfig.accountsCollectionId,
            userId,
            {
              name: name,
              bio: '',
              profileImageUrl: null,
              subscribingTo: [],
              videosLiked: [], // Add required empty array
              videosDisliked: [] // Add required empty array
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

  // --- Add updateAccountLikeDislikeArrays ---
  const updateAccountLikeDislikeArrays = async (videoId, action) => {
    if (!user) {
        console.warn("[AuthContext] Cannot update account arrays: User not logged in.");
        return;
    }
    console.log(`[AuthContext] Queueing update for account arrays: video ${videoId}, action ${action}`);

    try {
        // Fetch the latest arrays (optional, could use current context state but fetch is safer)
        const currentAccountDoc = await databases.getDocument(
            appwriteConfig.databaseId,
            appwriteConfig.accountsCollectionId,
            user.$id
        );
        let currentLiked = new Set(currentAccountDoc.videosLiked || []);
        let currentDisliked = new Set(currentAccountDoc.videosDisliked || []);

        // Apply the action
        if (action === 'like') {
            if (currentLiked.has(videoId)) {
                currentLiked.delete(videoId); // Toggle off like
            } else {
                currentLiked.add(videoId); // Add like
                currentDisliked.delete(videoId); // Remove potential dislike
            }
        } else if (action === 'dislike') {
            if (currentDisliked.has(videoId)) {
                currentDisliked.delete(videoId); // Toggle off dislike
            } else {
                currentDisliked.add(videoId); // Add dislike
                currentLiked.delete(videoId); // Remove potential like
            }
        }

        // Convert Sets back to arrays for update
        const updatedLikedArray = Array.from(currentLiked);
        const updatedDislikedArray = Array.from(currentDisliked);

        // Update the document
        await databases.updateDocument(
            appwriteConfig.databaseId,
            appwriteConfig.accountsCollectionId,
            user.$id,
            {
                videosLiked: updatedLikedArray,
                videosDisliked: updatedDislikedArray
                // Only update these fields to avoid overwriting concurrent updates to bio/name etc.
            }
        );
        console.log(`[AuthContext] Successfully updated account arrays for user ${user.$id}`);

    } catch (error) {
        console.error(`[AuthContext] Failed to update account arrays for user ${user.$id}:`, error);
        // Log the error, but don't block the user. The backend function will eventually correct the state.
    }
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
    updateClientVideoStates, // Keep this for immediate UI update
    updateAccountLikeDislikeArrays, // Expose the new function
    account, // Keep access to account service if needed elsewhere
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
