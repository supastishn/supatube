import { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { account, avatars } from '../lib/appwriteConfig';
import { ID } from 'appwrite';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkUserStatus();
  }, []);

  // Check if user is logged in and fetch preferences
  const checkUserStatus = async () => {
    setLoading(true); // Ensure loading is true at the start
    try {
      const currentAccount = await account.get();
      const currentPrefs = await account.getPrefs(); // Fetch preferences
      setUser({ ...currentAccount, prefs: currentPrefs }); // Merge account and prefs
      console.log("User status checked, user:", { ...currentAccount, prefs: currentPrefs });
    } catch (error) {
      // Only log error if it's not the expected "not logged in" error (401)
      if (error.code !== 401) {
         console.error("Check user status error:", error);
      } else {
         console.log("User is not logged in");
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  // Register new user
  const register = async (email, password, name) => {
    try {
      const response = await account.create(
        ID.unique(),
        email,
        password,
        name
      );

      if (response) {
        // Log in the user immediately after registration
        await login(email, password);
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
      console.error("Logout error:", error);
    }
  };

  // Get user avatar URL
  const getAvatarUrl = (userId) => {
    return avatars.getInitials(userId || (user ? user.$id : "Guest"));
  };

  // Function to manually refresh user data + prefs after an update
  const updateUserProfile = async () => {
    try {
      const currentAccount = await account.get();
      const currentPrefs = await account.getPrefs();
      setUser({ ...currentAccount, prefs: currentPrefs });
      console.log("User profile updated in context.");
      return { ...currentAccount, prefs: currentPrefs }; // Return updated user object
    } catch (error) {
      console.error("Failed to refresh user profile:", error);
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
