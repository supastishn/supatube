import { Client, Account, Databases, Storage, Avatars, Functions } from 'appwrite';

export const appwriteConfig = {
    endpoint: 'https://fra.cloud.appwrite.io/v1',
    projectId: 'supatube',
    databaseId: 'database',                  // Database ID
    videosCollectionId: 'videos',            // Videos collection ID
    storageVideosBucketId: 'videos',         // Videos storage bucket ID
    accountsCollectionId: 'accounts',        // Accounts collection ID
    likesCollectionId: 'likes',              // Likes collection ID
    videoCountsCollectionId: 'video_counts', // Video counts collection ID
    videoInteractionsCollectionId: 'video_interactions', // Video interactions collection ID
    channelStatsCollectionId: 'channel_stats', // Channel stats collection ID
    userVideoStatesCollectionId: 'user_video_states', // User video states collection ID
};

// Initialize Appwrite client
export const client = new Client();

client
  .setEndpoint(appwriteConfig.endpoint)
  .setProject(appwriteConfig.projectId);

export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);
export const avatars = new Avatars(client);
export const functions = new Functions(client);
