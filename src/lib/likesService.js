import { functions } from './appwriteConfig';
import { appwriteConfig } from './appwriteConfig';

// IMPORTANT: Ensure this matches the ID in your appwrite.json and Appwrite console
const LIKES_FUNCTION_ID = 'likes-manager'; // Revert to the actual likes manager function

/**
 * Calls the backend function to toggle like/dislike status for a video.
 * @param {string} videoId - The ID of the video.
 * @param {'like' | 'dislike'} action - The action to perform.
 * @returns {Promise<object>} - The result from the function execution (e.g., { success: true, newStatus: 'liked' }).
 * @throws {Error} - Throws an error if the function call fails.
 */
export const toggleLikeDislike = async (videoId, action) => {
  if (!videoId || !action) {
    throw new Error('Video ID and action are required.');
  }

  console.log(`[likesService] Calling function ${LIKES_FUNCTION_ID} for video ${videoId}, action: ${action}`);

  try {
    // Execute the function, sending data in the body
    const result = await functions.createExecution(
      LIKES_FUNCTION_ID,
      JSON.stringify({ // Pass data as a JSON string in the body
        videoId: videoId,
        action: action,
      }),
      false, // async = false (wait for response)
      '/', // path (use default '/')
      'POST' // method (important!)
    );

    console.log(`[likesService] Raw function result:`, result);

    // Check if the function execution itself failed (e.g., timeout, permissions)
    if (result.status === 'failed') {
      console.error('Like/Dislike function execution failed:', result.stderr || result.response);
      throw new Error(`Failed to ${action} video. Function execution error.`);
    }

    // Attempt to parse the JSON response body from the function
    let responseData = {};
    try {
        responseData = JSON.parse(result.responseBody);
        console.log(`[likesService] Parsed function response:`, responseData);
        console.log(`[likesService] Parsed responseData.success: ${responseData.success} (Type: ${typeof responseData.success})`);
        console.log(`[likesService] Parsed responseData.newStatus: ${responseData.newStatus} (Type: ${typeof responseData.newStatus})`);
    } catch (parseError) {
        console.error("[likesService] Could not parse JSON response from likes function:", result.responseBody, parseError);
        // Treat non-JSON response as an error from the function's perspective
        throw new Error(`Failed to ${action} video. Unexpected response from function.`);
    }

    // Check the 'success' flag (which is now a string 'true' or 'false')
    if (responseData.success !== 'true') { // Check for the string "true"
      console.error(`[likesService] Function indicated failure:`, responseData.message);
      throw new Error(responseData.message || `Failed to ${action} video.`);
    }

    // Return the parsed data (e.g., { success: true, newStatus: 'liked' })
    return responseData;

  } catch (error) {
    console.error(`[likesService] Error calling like/dislike function for video ${videoId} (${action}):`, error);
    // Rethrow a more specific error or the original error
    throw new Error(error.message || `Failed to ${action} video.`);
  }
};
