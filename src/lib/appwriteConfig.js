import { Client, Account, Databases, Storage, Avatars } from 'appwrite';

export const appwriteConfig = {
    endpoint: 'https://fra.cloud.appwrite.io/v1',
    projectId: 'supatube',
    // Add other IDs if needed later (e.g., databaseId, storageId, collectionIds)
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
