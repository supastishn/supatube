import { databases, appwriteConfig } from './appwriteConfig';
import { ID, Permission, Role } from 'appwrite';

/**
 * Creates a subscription interaction document to request subscribe/unsubscribe.
 * @param {string} creatorId - The ID of the channel/creator to subscribe/unsubscribe to.
 * @param {'subscribe' | 'unsubscribe'} action - The action to perform.
 * @returns {Promise<{success: boolean}>} - Confirmation of the interaction document creation.
 * @throws {Error} - Throws an error if the document creation fails.
 */
export const createSubscriptionInteraction = async (creatorId, action) => {
  if (!creatorId || !action) {
    throw new Error('Creator ID and action are required.');
  }

  console.log(`[subscriptionService] Creating ${action} interaction for creator ${creatorId}`);

  try {
    // Get the current user ID from the Auth session
    const userId = localStorage.getItem('currentUser') ? 
      JSON.parse(localStorage.getItem('currentUser')).$id : 
      null;
    
    if (!userId) {
      throw new Error('User authentication required.');
    }

    // Create the interaction document with permissions for user identification
    const docPermissions = [
      Permission.read(Role.user(userId)),    // Owner can read
      Permission.update(Role.user(userId)),  // Owner can update (USED FOR IDENTIFICATION)
      Permission.delete(Role.user(userId))   // Owner can delete (optional client-side cancel)
      // Function accesses via API key implicitly
    ];

    // Create the document in the account_interactions collection
    const response = await databases.createDocument(
      appwriteConfig.databaseId,
      appwriteConfig.accountInteractionsCollectionId,
      ID.unique(),
      { 
        type: action, 
        targetAccountId: creatorId
      },
      docPermissions
    );

    console.log(`[subscriptionService] Created interaction document:`, response.$id);

    // Return success confirmation
    return { success: true };

  } catch (error) {
    console.error(`[subscriptionService] Error creating subscription interaction for creator ${creatorId} (${action}):`, error);
    throw new Error(error.message || `Failed to request ${action} action.`);
  }
};

/**
 * Legacy function name for backward compatibility
 * @deprecated Use createSubscriptionInteraction instead
 */
export const toggleSubscription = createSubscriptionInteraction;
