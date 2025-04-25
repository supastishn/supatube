import { databases, appwriteConfig } from './appwriteConfig';
import { ID, Permission, Role } from 'appwrite';

/**
 * Records a like/dislike interaction in the database.
 * This function DOES NOT return the final counts or status.
 * UI updates should be handled optimistically and via Realtime.
 *
 * @param {string} videoId - The ID of the video being interacted with.
 * @param {'like' | 'dislike'} action - The type of interaction.
 * @param {string} userId - The ID of the user performing the interaction.
 * @returns {Promise<{success: boolean, message: string}>} - Confirmation of recording.
 * @throws {Error} - Throws an error if recording the interaction fails.
 */
export const toggleLikeDislike = async (videoId, action, userId) => {
  // Validate inputs
  if (!videoId || (action !== 'like' && action !== 'dislike')) {
    throw new Error('Video ID and a valid action ("like" or "dislike") are required.');
  }
  if (!userId) {
    // This function must be called by an authenticated user context
    throw new Error("User ID is required to record like/dislike interaction.");
  }

  console.log(`[likesService] Recording interaction: video ${videoId}, action: ${action}, user: ${userId}`);

  try {
    // Data for the new interaction document
    const interactionData = {
      videoId: videoId,
      type: action,
      // DO NOT include userId attribute here
    };

    // Permissions for the interaction document: Only the creator can manage it.
    // The backend function identifies the user via these permissions.
    const docPermissions = [
      Permission.read(Role.user(userId)),   // User can read their own interaction
      Permission.update(Role.user(userId)), // User can update (though unlikely needed)
      Permission.delete(Role.user(userId)), // User can delete their interaction
      // Read permission for backend function (using API key) is implicit
    ];

    // Create the document in the video_interactions collection
    const response = await databases.createDocument(
      appwriteConfig.databaseId,
      appwriteConfig.videoInteractionsCollectionId, // Target the new collection
      ID.unique(), // Generate a unique document ID
      interactionData,
      docPermissions // Apply document-level permissions
    );

    console.log(`[likesService] Interaction document created successfully:`, response.$id);

    // Return confirmation that the interaction was recorded
    return { success: true, message: "Interaction recorded." };

  } catch (error) {
    console.error(`[likesService] Error recording interaction for video ${videoId} (Action: ${action}, User: ${userId}):`, error);
    // Rethrow a more specific or the original error
    throw new Error(error.message || `Failed to record ${action} interaction.`);
  }
};
