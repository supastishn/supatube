import { databases, appwriteConfig } from './appwriteConfig';
import { ID, Permission, Role } from 'appwrite';

/**
 * Records a view interaction in the 'pending_views' collection.
 *
 * @param {string} videoId - The ID of the video being viewed.
 * @param {string} userId - The ID of the user performing the interaction.
 * @returns {Promise<{success: boolean, docId?: string}>} - Confirmation of recording.
 * @throws {Error} - Throws an error if recording the interaction fails.
 */
export const recordViewInteraction = async (videoId, userId) => {
  // Validate inputs
  if (!videoId) {
    console.warn('[viewService] Video ID is required.');
    return { success: false }; // Don't throw, just warn and exit
  }
  if (!userId) {
    console.warn("[viewService] User ID is required to record view interaction.");
    return { success: false };
  }

  console.log(`[viewService] Recording view interaction: video ${videoId}, user: ${userId}`);

  try {
    // Data for the new interaction document
    const interactionData = {
      videoId: videoId,
      // userId is NOT stored as an attribute
    };

    // Permissions identify the user who viewed it
    const docPermissions = [
      Permission.read(Role.user(userId)),
      Permission.update(Role.user(userId)), // CRUCIAL for function to identify owner
      Permission.delete(Role.user(userId)),
    ];

    // Create the document in the pending_views collection
    const response = await databases.createDocument(
      appwriteConfig.databaseId,
      'pending_views', // Use the correct collection ID
      ID.unique(),     // Generate a unique document ID
      interactionData,
      docPermissions   // Apply document-level permissions
    );

    console.log(`[viewService] Pending view document created successfully:`, response.$id);
    return { success: true, docId: response.$id };

  } catch (error) {
    console.error(`[viewService] Error recording view interaction for video ${videoId} (User: ${userId}):`, error);
    // Don't throw error to avoid interrupting user experience, just log it.
    // throw new Error(error.message || `Failed to record view interaction.`);
    return { success: false };
  }
};
