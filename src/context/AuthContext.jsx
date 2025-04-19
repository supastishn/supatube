import { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { account } from '../lib/appwriteConfig';
import { ID } from 'appwrite';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkUserStatus();
  }, []);

  // Check if user is logged in
  const checkUserStatus = async () => {
    try {
      const currentAccount = await account.get();
      setUser(currentAccount);
    } catch (error) {
      console.log("User is not logged in");
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
      await account.createEmailSession(email, password);
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

  const value = {
    user,
    loading,
    register,
    login,
    logout,
    getAvatarUrl,
    checkUserStatus
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
