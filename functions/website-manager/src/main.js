import { Client, Databases, Query } from 'node-appwrite';

// Helper function to extract User ID from permissions array
const getOwnerId = (permissions) => {
  if (!permissions || !Array.isArray(permissions)) {
    return null;
  }
  for (const perm of permissions) {
    // Look for the standard 'delete("user:...")' permission string
    if (perm.startsWith('delete("user:') && perm.endsWith('")')) {
      return perm.substring('delete("user:'.length, perm.length - '")'.length);
    }
  }
  return null; // Return null if no owner delete permission found
};

// Main function entry point
export default async ({ req, res, log, error }) => {
  // --- 1. Get Environment Variables & Initialize Appwrite Client ---
  const {
    APPWRITE_FUNCTION_ENDPOINT,
    APPWRITE_FUNCTION_PROJECT_ID,
    APPWRITE_FUNCTION_API_KEY, // API Key with necessary permissions
    APPWRITE_DATABASE_ID,
    LIKES_COLLECTION_ID,
  } = process.env;

  // Basic validation
  if (!APPWRITE_FUNCTION_ENDPOINT || !APPWRITE_FUNCTION_PROJECT_ID || !APPWRITE_FUNCTION_API_KEY || !APPWRITE_DATABASE_ID || !LIKES_COLLECTION_ID) {
    error('FATAL: Missing required environment variables.');
    // Cannot proceed without configuration
    return res.json({ success: false, message: 'Configuration error: Missing environment variables.' }, 500);
  }

  const client = new Client()
    .setEndpoint(APPWRITE_FUNCTION_ENDPOINT)
    .setProject(APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(APPWRITE_FUNCTION_API_KEY); // Use a long-lived API key with documents read/write permissions

  const databases = new Databases(client);

  // --- 2. Define the Subscription Logic ---
  const channel = `databases.${APPWRITE_DATABASE_ID}.collections.${LIKES_COLLECTION_ID}.documents`;
  const event = `databases.${APPWRITE_DATABASE_ID}.collections.${LIKES_COLLECTION_ID}.documents.*.create`;

  log(`Attempting to subscribe to channel: ${channel}`);

  try {
    client.subscribe(channel, async (response) => {
      // Check if the event is a document creation event
      if (response.events.includes(event)) {
        log(`Received create event for document ID: ${response.payload.$id}`);
        const newLikeDoc = response.payload; // Payload IS the document

        // --- Extract Necessary Data ---
        const videoId = newLikeDoc.videoId;
        const newDocumentId = newLikeDoc.$id;
        const permissions = newLikeDoc.$permissions;
        const ownerUserId = getOwnerId(permissions);

        if (!videoId) {
          error(`[Subscription] Missing 'videoId' in payload for doc ${newDocumentId}.`);
          return; // Skip processing this event
        }
        if (!ownerUserId) {
          error(`[Subscription] Could not determine owner for doc ${newDocumentId}.`);
          return; // Skip processing this event
        }

        log(`[Subscription] Processing: VideoID=${videoId}, OwnerID=${ownerUserId}, NewDocID=${newDocumentId}`);

        // --- Find and Delete Previous Likes/Dislikes ---
        try {
          const query = [
            Query.equal('videoId', videoId),
            Query.limit(100)
          ];
          log(`[Subscription] Querying for previous docs with videoId: ${videoId}`);
          const previousDocsResponse = await databases.listDocuments(
            APPWRITE_DATABASE_ID,
            LIKES_COLLECTION_ID,
            query
          );

          let deletedCount = 0;
          for (const oldDoc of previousDocsResponse.documents) {
            if (oldDoc.$id === newDocumentId) continue; // Skip the new doc itself

            const oldDocOwnerId = getOwnerId(oldDoc.$permissions);
            if (oldDocOwnerId === ownerUserId) {
              log(`[Subscription] Found previous doc ${oldDoc.$id} by same user ${ownerUserId}. Deleting...`);
              try {
                await databases.deleteDocument(APPWRITE_DATABASE_ID, LIKES_COLLECTION_ID, oldDoc.$id);
                log(`[Subscription] Successfully deleted previous doc ${oldDoc.$id}.`);
                deletedCount++;
              } catch (deleteError) {
                error(`[Subscription] Failed to delete doc ${oldDoc.$id}: ${deleteError.message || deleteError}`);
              }
            }
          }
          log(`[Subscription] Finished processing ${newDocumentId}. Deleted ${deletedCount} previous doc(s).`);

        } catch (processingError) {
          error(`[Subscription] Error processing event for ${newDocumentId}: ${processingError.message || processingError}`);
        }
      } else {
        // Log other events received on the channel if needed for debugging
        // log(`Received other event: ${response.events.join(', ')}`);
      }
    });

    log(`Subscription to ${channel} initiated. **WARNING: This connection will likely be terminated soon due to function timeouts.**`);

    // --- 3. Return Response (Function Execution Completes Here) ---
    // The function execution ENDS after returning this response.
    // The subscription started above will only run until the function times out.
    return res.json({
      success: true,
      message: `Subscription attempt initiated. This is NOT a reliable long-term solution. Use Event Triggers instead.`
    }, 200);

  } catch (subscribeError) {
    error(`Failed to initiate subscription: ${subscribeError.message || subscribeError}`);
    return res.json({ success: false, message: `Failed to initiate subscription: ${subscribeError.message}` }, 500);
  }

  // NOTE: Code placed here will likely never be reached if the subscription starts successfully.
  // The function needs to stay alive to keep the subscription running, which it won't do
  // after returning the response above. This highlights the architectural mismatch.
};
