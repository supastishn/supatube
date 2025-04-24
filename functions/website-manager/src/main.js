import { Client, Databases, Account, Query } from 'node-appwrite';

// --- Top-Level Scope ---

// Helper function to extract User ID from permissions array
const getOwnerId = (permissions) => {
  if (!permissions || !Array.isArray(permissions)) {
    return null;
  }
  for (const perm of permissions) {
    if (perm.startsWith('delete("user:') && perm.endsWith('")')) {
      return perm.substring('delete("user:'.length, perm.length - '")'.length);
    }
  }
  return null;
};

// --- 1. Get Environment Variables & Initialize Client (Top Level) ---
// IMPORTANT: This code runs when the function instance *starts*, not necessarily on every trigger.
console.log('[Top Level] Initializing function instance...');

const {
  APPWRITE_FUNCTION_ENDPOINT,
  APPWRITE_FUNCTION_PROJECT_ID,
  APPWRITE_ADMIN_EMAIL,
  APPWRITE_ADMIN_PASSWORD,
  APPWRITE_DATABASE_ID,
  LIKES_COLLECTION_ID,
} = process.env;

// Basic validation at the top level
if (!APPWRITE_FUNCTION_ENDPOINT || !APPWRITE_FUNCTION_PROJECT_ID || !APPWRITE_ADMIN_EMAIL || !APPWRITE_ADMIN_PASSWORD || !APPWRITE_DATABASE_ID || !LIKES_COLLECTION_ID) {
  const errorMsg = 'FATAL: Missing required environment variables (Endpoint, ProjectID, Admin Email, Admin Password, DB ID, Likes Collection ID). Function cannot start.';
  console.error(`[Top Level] ${errorMsg}`);
  // Throwing an error here might prevent the function instance from becoming ready or cause deployment issues.
  throw new Error(errorMsg);
} else {
    console.log('[Top Level] Environment variables loaded successfully.');
}

const client = new Client()
  .setEndpoint(APPWRITE_FUNCTION_ENDPOINT)
  .setProject(APPWRITE_FUNCTION_PROJECT_ID);

const account = new Account(client);
const databases = new Databases(client);

// --- 2. Login and Start Subscription Logic (Top Level) ---
(async () => {
  try {
    console.log(`[Top Level] Attempting login as ${APPWRITE_ADMIN_EMAIL}...`);
    await account.createEmailPasswordSession(APPWRITE_ADMIN_EMAIL, APPWRITE_ADMIN_PASSWORD);
    console.log('[Top Level] Admin login successful.');
    
    // --- Define and Start Subscription Logic ---
    const channel = `databases.${APPWRITE_DATABASE_ID}.collections.${LIKES_COLLECTION_ID}.documents`;
    const eventPattern = `databases.${APPWRITE_DATABASE_ID}.collections.${LIKES_COLLECTION_ID}.documents.*.create`;

    console.log(`[Top Level] Attempting to subscribe to channel: ${channel}`);

    try {
      // This subscription attempt runs when the function container initializes.
      client.subscribe(channel, async (response) => {
        // Use console.log/error here as the 'log'/'error' context objects aren't available.
        try {
            // Check if the event is a document creation event
            if (response.events.includes(eventPattern)) {
                console.log(`[Subscription] Received create event for document ID: ${response.payload.$id}`);
                const newLikeDoc = response.payload; // Payload IS the document

                // --- Extract Necessary Data ---
                const videoId = newLikeDoc.videoId;
                const newDocumentId = newLikeDoc.$id;
                const permissions = newLikeDoc.$permissions;
                const ownerUserId = getOwnerId(permissions);

                if (!videoId) {
                    console.error(`[Subscription] Skipping ${newDocumentId}: Missing 'videoId' in payload.`);
                    return;
                }
                if (!ownerUserId) {
                    console.error(`[Subscription] Skipping ${newDocumentId}: Could not determine owner. Permissions: ${JSON.stringify(permissions)}`);
                    return;
                }

                console.log(`[Subscription] Processing: VideoID=${videoId}, OwnerID=${ownerUserId}, NewDocID=${newDocumentId}`);

                // --- Find and Delete Previous Likes/Dislikes ---
                const query = [
                    Query.equal('videoId', videoId),
                    Query.limit(100) // Limit query results for performance
                ];
                console.log(`[Subscription] Querying for previous docs with videoId: ${videoId}, excluding ${newDocumentId}`);

                const previousDocsResponse = await databases.listDocuments(
                    APPWRITE_DATABASE_ID,
                    LIKES_COLLECTION_ID,
                    query
                );

                let deletedCount = 0;
                for (const oldDoc of previousDocsResponse.documents) {
                    // Skip the document that just triggered this subscription event
                    if (oldDoc.$id === newDocumentId) continue;

                    const oldDocOwnerId = getOwnerId(oldDoc.$permissions);
                    // Delete only if the previous document belongs to the *same user*
                    if (oldDocOwnerId === ownerUserId) {
                        console.log(`[Subscription] Found previous doc ${oldDoc.$id} by same user ${ownerUserId}. Deleting...`);
                        try {
                            await databases.deleteDocument(APPWRITE_DATABASE_ID, LIKES_COLLECTION_ID, oldDoc.$id);
                            console.log(`[Subscription] Successfully deleted previous doc ${oldDoc.$id}.`);
                            deletedCount++;
                        } catch (deleteError) {
                            console.error(`[Subscription] Failed to delete doc ${oldDoc.$id}: ${deleteError.message || deleteError}`);
                        }
                    } else {
                         // Log if a doc for the same video is found but owner doesn't match (useful for debugging)
                         // console.log(`[Subscription] Skipping doc ${oldDoc.$id} - owner mismatch (Expected: ${ownerUserId}, Found: ${oldDocOwnerId})`);
                    }
                }
                console.log(`[Subscription] Finished processing ${newDocumentId}. Deleted ${deletedCount} previous doc(s).`);

            } else {
                // Log other event types received on this channel if needed for debugging
                // console.log(`[Subscription] Received other event types: ${response.events.join(', ')}`);
            }
        } catch (processingError) {
            // Catch errors within the async subscription handler
            console.error(`[Subscription] Error processing event payload for ${response?.payload?.$id || 'unknown doc'}: ${processingError.message || processingError}`);
        }
      });

      console.log(`[Top Level] Subscription to ${channel} initiated successfully. **WARNING: Persistence of this subscription is NOT guaranteed by the Appwrite runtime.**`);

    } catch (subscribeError) {
      // Catch errors during the initial client.subscribe call
      console.error(`[Top Level] FATAL: Failed to initiate subscription after login: ${subscribeError.message || subscribeError}`);
      // Throw error to potentially signal deployment/startup failure
      throw new Error(`Failed to initiate subscription: ${subscribeError.message}`);
    }
  } catch (loginError) {
    console.error(`[Top Level] FATAL: Admin login failed: ${loginError.message || loginError}`);
    // Throw error to prevent function execution if login fails
    throw new Error(`Admin login failed: ${loginError.message}`);
  }
})();

// --- 3. Exported Default Function (Minimal) ---
// This function still gets called if an event trigger is configured or if executed manually.
// It does NOT interact with the subscription logic above, which runs "in the background"
// within the Node.js process of the function instance (until the instance is terminated).
export default async ({ req, res, log, error }) => {
  log('Function execution handler triggered (e.g., by event, schedule, or manually).');

  // The main like processing logic is intended to run in the top-level subscription.
  // This handler just acknowledges the trigger.
  return res.json({
    success: true,
    message: 'Function execution handler completed. Like processing occurs in background subscription (if active and stable).'
  }, 200);
};
