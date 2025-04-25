import { functions } from './appwriteConfig';

// Define the function ID (matches appwrite.json)
const VIDEO_DELETION_FUNCTION_ID = 'video-deletion-manager';

/**
 * Calls the backend function to delete a video and its associated files.
 * @param {string} videoId - The Document ID of the video to delete.
 * @returns {Promise<{success: boolean, message: string}>} - The result from the function execution.
 * @throws {Error} - Throws an error if the function call fails or returns an error.
 */
export const deleteVideo = async (videoId) => {
  if (!videoId) {
    throw new Error('Video ID is required.');
  }
  console.log(`[videoService] Calling delete function ${VIDEO_DELETION_FUNCTION_ID} for video ${videoId}`);

  try {
    // Execute the function, sending videoId in the body
    const result = await functions.createExecution(
      VIDEO_DELETION_FUNCTION_ID,
      JSON.stringify({ videoId }), // Body must be a string
      false, // async = false (wait for response)
      '/',   // path (use default '/')
      'POST' // method (Using POST as function expects body)
    );

    console.log('[videoService] Raw delete function result:', result);

    // Check if the function execution itself failed (e.g., timeout, internal error)
    if (result.status === 'failed') {
      console.error('Video deletion function execution failed:', result.stderr || result.responseBody); // Log stderr or body
      let funcErrorMsg = 'Video deletion function execution failed.';
      // Try to parse a more specific error message from the function's response body
      try {
        const errorDetails = JSON.parse(result.responseBody);
        if (errorDetails.message) funcErrorMsg = errorDetails.message;
      } catch (e) { /* ignore parse error, use default message */ }
      throw new Error(funcErrorMsg);
    }

    // Parse the JSON response body from the function
    let responseData = {};
    try {
      responseData = JSON.parse(result.responseBody);
      console.log(`[videoService] Parsed delete function response:`, responseData);
    } catch (parseError) {
      console.error("[videoService] Could not parse JSON response from delete function:", result.responseBody, parseError);
      throw new Error('Failed to delete video. Unexpected response from function.');
    }

    // Check the 'success' boolean flag from the function's response
    if (responseData.success !== true) {
      console.error(`[videoService] Function indicated failure:`, responseData.message);
      throw new Error(responseData.message || 'Failed to delete video.');
    }

    // Return the successful response data (e.g., { success: true, message: '...' })
    return responseData;

  } catch (error) {
    console.error(`[videoService] Error calling delete function for video ${videoId}:`, error);
    // Rethrow a more specific error or the original error
    throw new Error(error.message || 'Failed to delete video.');
  }
};

// Add other video-related service functions here if needed (e.g., fetchVideo)
