import { Client, Account, Databases, Storage, Avatars } from 'appwrite';

export const appwriteConfig = {
  // Consider using environment variables for these!
  // See: https://vitejs.dev/guide/env-and-mode.html
  projectId: 'YOUR_APPWRITE_PROJECT_ID', // Replace with your project ID
  endpoint: 'YOUR_APPWRITE_ENDPOINT',     // Replace with your endpoint URL
  databaseId: 'YOUR_DATABASE_ID',         // Replace with your database ID
  storageId: 'YOUR_STORAGE_BUCKET_ID',    // Replace with your storage bucket ID
  usersCollectionId: 'YOUR_USERS_COLLECTION_ID', // Replace with your users collection ID
  videosCollectionId: 'YOUR_VIDEOS_COLLECTION_ID', // Replace with your videos collection ID
};

export const client = new Client();

client
  .setEndpoint(appwriteConfig.endpoint)
  .setProject(appwriteConfig.projectId);

export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);
export const avatars = new Avatars(client);

// Note: You'll need to create the database, collections, and storage bucket
// in your Appwrite console corresponding to the IDs above.
