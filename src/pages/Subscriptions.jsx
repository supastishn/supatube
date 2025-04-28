import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { databases, avatars, appwriteConfig } from '../lib/appwriteConfig';
import { Query } from 'appwrite';
import ChannelCard from '../components/ChannelCard'; // Import the new component
import '../App.css'; // Use shared styles

const Subscriptions = () => {
  const { user: currentUser, loading: authLoading, accountDetails } = useAuth();
  const [subscribedChannels, setSubscribedChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchSubscribedChannels = async () => {
      // Wait for auth context to load
      if (authLoading) return;

      // Ensure user is logged in
      if (!currentUser || !accountDetails) {
        setLoading(false);
        setSubscribedChannels([]);
        return; // Handled by ProtectedRoute, but good to double check
      }

      const channelIds = accountDetails.subscribingTo || [];
      console.log("[Subscriptions] Channel IDs from context:", channelIds);

      if (channelIds.length === 0) {
        setSubscribedChannels([]);
        setLoading(false);
        return; // No subscriptions
      }

      setLoading(true);
      setError(null);

      try {
        // Fetch account documents for the subscribed channel IDs
        const accountsResponse = await databases.listDocuments(
          appwriteConfig.databaseId,
          appwriteConfig.accountsCollectionId,
          [
            Query.equal('$id', channelIds),
            Query.limit(channelIds.length) // Fetch details for all IDs
          ]
        );

        // Fetch subscriber counts for these channels
        const statsResponse = await databases.listDocuments(
          appwriteConfig.databaseId,
          appwriteConfig.channelStatsCollectionId,
          [
            Query.equal('$id', channelIds),
            Query.limit(channelIds.length)
          ]
        );
        // Create a map for quick lookup of subscriber counts
        const subscriberCountsMap = new Map(
          statsResponse.documents.map(doc => [doc.$id, doc.subscriberCount || 0])
        );

        // Map fetched account data to channel objects
        const channels = accountsResponse.documents.map(doc => {
          let avatarUrl = doc.profileImageUrl;
          if (!avatarUrl) {
            // Use ui-avatars.com fallback
            avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(doc.name || '?')}&background=random`;
          }

          return {
            id: doc.$id,
            name: doc.name || 'Unnamed Channel',
            profileImageUrl: avatarUrl,
            bio: doc.bio || '',
            subscriberCount: subscriberCountsMap.get(doc.$id) || 0 // Get count from map
          };
        });

        setSubscribedChannels(channels);

      } catch (err) {
        console.error('Failed to fetch subscribed channels:', err);
        setError('Could not load your subscriptions. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchSubscribedChannels();
  }, [currentUser, authLoading, accountDetails]); // Depend on context state

  // Render Loading State
  if (loading || authLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading subscriptions...</p>
      </div>
    );
  }

  // Render Error State
  if (error) {
    return (
      <div className="error-container">
        <h2>Error Loading Subscriptions</h2>
        <p>{error}</p>
      </div>
    );
  }

  // Render Not Logged In State (Primarily handled by ProtectedRoute)
  if (!currentUser) {
    return (
      <div className="page-container subscriptions-container">
        <h1>Subscriptions</h1>
        <p>Please <Link to="/sign-in" className="text-link">sign in</Link> to view your subscriptions.</p>
      </div>
    );
  }

  // Render Content
  return (
    <div className="page-container subscriptions-container">
      <h1>Subscriptions</h1>

      {subscribedChannels.length === 0 ? (
        <p>You haven't subscribed to any channels yet.</p>
      ) : (
        <div className="channels-list">
          {subscribedChannels.map((channel) => (
            <ChannelCard key={channel.id} channel={channel} />
          ))}
        </div>
      )}

      {/* Add simple styling */}
      <style jsx>{`
        .subscriptions-container {
          padding: 24px;
          max-width: 900px; /* Consistent max-width */
          margin: 0 auto;
        }
        .subscriptions-container h1 {
          margin-bottom: 24px;
        }
        .subscriptions-container p {
          color: var(--text-secondary);
        }
        .text-link {
            color: var(--primary);
            font-weight: 500;
        }
        .channels-list {
          display: flex;
          flex-direction: column;
          gap: 16px; /* Space between channel cards */
        }
      `}</style>
    </div>
  );
};

export default Subscriptions;
