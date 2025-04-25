import { functions } from './appwriteConfig';

const SUBSCRIPTIONS_FUNCTION_ID = 'subscriptions-manager';

/**
 * Calls the backend function to toggle subscription status for a channel/creator.
 * @param {string} creatorId - The ID of the channel/creator to subscribe/unsubscribe to.
 * @param {'subscribe' | 'unsubscribe'} action - The action to perform.
 * @returns {Promise<{success: boolean, isSubscribed: boolean}>} - The result indicating success and the new subscription state.
 * @throws {Error} - Throws an error if the function call fails or returns an error.
 */
export const toggleSubscription = async (creatorId, action) => {
  if (!creatorId || !action) {
    throw new Error('Creator ID and action are required.');
  }

  console.log(`[subscriptionService] Calling function ${SUBSCRIPTIONS_FUNCTION_ID} for creator ${creatorId}, action: ${action}`);

  try {
    // Execute the function, sending data in the body
    const result = await functions.createExecution(
      SUBSCRIPTIONS_FUNCTION_ID,
      JSON.stringify({
        creatorId: creatorId,
        action: action,
      }),
      false, // async = false (wait for response)
      '/', // path (use default '/')
      'POST' // method (important!)
    );

    console.log(`[subscriptionService] Raw function result:`, result);

    // Check if the function execution itself failed
    if (result.status === 'failed') {
      console.error('Subscription function execution failed:', result.stderr || result.responseBody);
      throw new Error(`Failed to ${action} channel. Function execution error.`);
    }

    // Parse the JSON response body from the function
    let responseData = {};
    try {
      responseData = JSON.parse(result.responseBody);
      console.log(`[subscriptionService] Parsed function response:`, responseData);
    } catch (parseError) {
      console.error("[subscriptionService] Could not parse JSON response from subscription function:", result.responseBody, parseError);
      throw new Error(`Failed to ${action} channel. Unexpected response from function.`);
    }

    // Check the 'success' flag
    if (responseData.success !== 'true') {
      console.error(`[subscriptionService] Function indicated failure:`, responseData.message);
      throw new Error(responseData.message || `Failed to ${action} channel.`);
    }

    // Return the parsed data with successful result
    return {
      success: true,
      isSubscribed: responseData.isSubscribed
    };

  } catch (error) {
    console.error(`[subscriptionService] Error calling subscription function for creator ${creatorId} (${action}):`, error);
    throw new Error(error.message || `Failed to ${action} channel.`);
  }
};
