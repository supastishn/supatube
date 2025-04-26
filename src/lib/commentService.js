import { functions, databases, appwriteConfig } from './appwriteConfig';
import { ID, Permission, Role } from 'appwrite';
import { v4 as uuidv4 } from 'uuid';

const COMMENTS_FUNCTION_ID = 'comments-manager';

/**
 * Posts a new comment or reply to a video.
 * @param {string} videoId
 * @param {string} commentText
 * @param {string | null} parentCommentId - ID of the parent comment if replying, null otherwise.
 * @param {string} userId - ID of the user posting the comment.
 * @param {string} [providedTempId=null] - Optional temporary client ID for optimistic updates.
 * @returns {Promise<{success: boolean, temporaryClientId: string}>} - Confirmation and the temporary ID used.
 */
export const postComment = async (videoId, commentText, parentCommentId = null, userId, providedTempId = null) => {
  console.log(`[commentService] Posting comment. Video: ${videoId}, Parent: ${parentCommentId}, Text: ${commentText.substring(0, 30)}...`);

  if (!userId) {
    throw new Error("User ID is required to post a comment interaction.");
  }
  if (!videoId || !commentText) {
    throw new Error("Video ID and comment text are required.");
  }

  // Use provided temporary ID or generate a new one
  const temporaryClientId = providedTempId || `temp-${uuidv4()}`;

  try {
    // Data for the interaction document
    const interactionData = {
      videoId,
      commentText,
      parentCommentId: parentCommentId || null, // Ensure null if empty
      temporaryClientId
    };

    // Permissions: Creator can manage, function (via API key) reads implicitly
    const docPermissions = [
      Permission.read(Role.user(userId)),
      Permission.update(Role.user(userId)),
      Permission.delete(Role.user(userId))
    ];

    // Create the interaction document
    const response = await databases.createDocument(
      appwriteConfig.databaseId,
      appwriteConfig.commentsInteractionsCollectionId, // Use the new collection ID
      ID.unique(), // Appwrite generates document ID
      interactionData,
      docPermissions
    );

    console.log(`[commentService] Interaction document created: ${response.$id} with temp ID: ${temporaryClientId}`);

    // Return success and the temporary ID (no optimistic object needed now)
    return { success: true, temporaryClientId };

  } catch (error) {
    console.error('[commentService] Error posting comment:', error);
    throw error; // Re-throw the error for the component to handle
  }
};

/**
 * Posts a 'delete' interaction for a specific comment.
 * @param {string} videoId - The ID of the video the comment belongs to.
 * @param {string} commentIdToDelete - The ID of the comment to be deleted.
 * @param {string} userId - ID of the user requesting the deletion.
 * @returns {Promise<{success: boolean}>} - Confirmation of recording.
 */
export const deleteCommentInteraction = async (videoId, commentIdToDelete, userId) => {
  console.log(`[commentService] Posting delete interaction. Video: ${videoId}, Comment: ${commentIdToDelete}`);

  if (!userId) {
    throw new Error("User ID is required to delete a comment interaction.");
  }
  if (!videoId || !commentIdToDelete) {
    throw new Error("Video ID and Comment ID to delete are required.");
  }

  try {
    // Data for the delete interaction document
    const interactionData = {
      videoId,
      type: 'delete', // Explicitly set type to delete
      commentIdToDelete,
      commentText: '', // Not needed for delete, send empty or null
      temporaryClientId: `delete-${commentIdToDelete}-${Date.now()}` // Unique identifier for this delete request
    };

    // Permissions: Creator can manage their own delete request
    const docPermissions = [
      Permission.read(Role.user(userId)),
      Permission.update(Role.user(userId)),
      Permission.delete(Role.user(userId))
    ];

    // Create the interaction document
    const response = await databases.createDocument(
      appwriteConfig.databaseId,
      appwriteConfig.commentsInteractionsCollectionId,
      ID.unique(),
      interactionData,
      docPermissions
    );

    console.log(`[commentService] Delete interaction document created: ${response.$id}`);
    return { success: true };

  } catch (error) {
    console.error('[commentService] Error posting delete comment interaction:', error);
    throw error; // Re-throw the error
  }
};

/**
 * Fetches the comments JSON for a video.
 * NOTE: This fetches ALL comments at once. Client-side parsing/sorting needed.
 * @param {string} videoId
 * @returns {Promise<Array<object>>} - An array of comment objects (including replies).
 */
export const fetchCommentsForVideo = async (videoId) => {
  console.log(`[commentService] Fetching comments for video: ${videoId}`);
  try {
    const doc = await databases.getDocument(
      appwriteConfig.databaseId,
      appwriteConfig.videoCountsCollectionId, // Fetch from video_counts
      videoId
    );

    const commentsJsonString = doc.commentsJson || '[]';
    console.log(`[commentService] Raw comments JSON string length: ${commentsJsonString.length}`);

    try {
      const commentsArray = JSON.parse(commentsJsonString);
      if (!Array.isArray(commentsArray)) {
        console.error('[commentService] Parsed commentsJson is not an array.');
        return []; // Return empty array if data is malformed
      }
      console.log(`[commentService] Parsed ${commentsArray.length} comments.`);
      // No server-side sorting possible with this model, client must sort.
      // Backend inserts newest first, so array is likely already newest first.
      return commentsArray;
    } catch (parseError) {
      console.error('[commentService] Failed to parse comments JSON:', parseError, `Raw: ${commentsJsonString.substring(0, 100)}...`);
      return []; // Return empty array on parse error
    }

  } catch (error) {
    if (error.code === 404) {
      console.log(`[commentService] No counts/comments document found for video ${videoId}.`);
      return []; // No document means no comments
    } else {
      console.error('[commentService] Error fetching comments document:', error);
      throw error; // Re-throw other errors
    }
  }
};
