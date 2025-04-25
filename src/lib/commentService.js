import { functions, databases, appwriteConfig } from './appwriteConfig';

const COMMENTS_FUNCTION_ID = 'comments-manager';

/**
 * Posts a new comment or reply to a video.
 * @param {string} videoId
 * @param {string} commentText
 * @param {string | null} parentCommentId - ID of the parent comment if replying, null otherwise.
 * @returns {Promise<object>} - The newly created comment object from the backend.
 */
export const postComment = async (videoId, commentText, parentCommentId = null) => {
  console.log(`[commentService] Posting comment. Video: ${videoId}, Parent: ${parentCommentId}, Text: ${commentText.substring(0, 30)}...`);

  try {
    const result = await functions.createExecution(
      COMMENTS_FUNCTION_ID,
      JSON.stringify({ videoId, commentText, parentCommentId }),
      false, // Synchronous execution
      '/',
      'POST'
    );

    console.log(`[commentService] Raw function result:`, result);

    if (result.status === 'failed') {
      let errorMsg = 'Comment function execution failed.';
      try {
        const errorDetails = JSON.parse(result.responseBody);
        if (errorDetails.message) errorMsg = errorDetails.message;
      } catch (e) { /* ignore parse error */ }
      throw new Error(errorMsg);
    }

    const responseData = JSON.parse(result.responseBody);
    console.log(`[commentService] Parsed function response:`, responseData);

    if (responseData.success !== 'true' || !responseData.comment) {
      throw new Error(responseData.message || 'Failed to post comment.');
    }

    return responseData.comment; // Return the new comment object

  } catch (error) {
    console.error('[commentService] Error posting comment:', error);
    throw error; // Re-throw the error for the component to handle
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
