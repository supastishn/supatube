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

// Main function entry point - This runs WHEN Appwrite triggers the function based on an event
export default async ({ req, res, log, error }) => {
  // --- 1. Get Environment Variables & Initialize Appwrite Client ---
  // These are automatically provided by Appwrite in the function's execution environment
  // LIKES_COLLECTION_ID and APPWRITE_DATABASE_ID must be set in function settings.
  const {
    APPWRITE_FUNCTION_ENDPOINT,
    APPWRITE_FUNCTION_PROJECT_ID,
    APPWRITE_FUNCTION_API_KEY,
    APPWRITE_DATABASE_ID,
    LIKES_COLLECTION_ID,
  } = process.env;

  // Validate required environment variables
  if (
    !APPWRITE_FUNCTION_ENDPOINT ||
    !APPWRITE_FUNCTION_PROJECT_ID ||
    !APPWRITE_FUNCTION_API_KEY ||
    !APPWRITE_DATABASE_ID ||
    !LIKES_COLLECTION_ID
  ) {
    error('FATAL: Missing required environment variables. Ensure APPWRITE_DATABASE_ID and LIKES_COLLECTION_ID are set in function settings.');
    return res.json({ success: false, message: 'Configuration error: Missing environment variables.' }, 500);
  }

  const client = new Client()
    .setEndpoint(APPWRITE_FUNCTION_ENDPOINT)
    .setProject(APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(APPWRITE_FUNCTION_API_KEY); // Use the API key provided for function execution

  const databases = new Databases(client);

  // --- 2. Process Event Payload ---
  let newLikeDoc;
  try {
    // Appwrite passes the event payload (the created document) as a JSON string in req.payload
    if (!req.payload) {
      error('Request payload is missing. Function was likely not triggered by an event.');
      return res.json({ success: false, message: 'Request payload is missing.' }, 400);
    }
    newLikeDoc = JSON.parse(req.payload);
    log(`Processing event for new document ID: ${newLikeDoc.$id}`);
  } catch (e) {
    error(`Failed to parse request payload: ${e.message}`);
    return res.json({ success: false, message: 'Invalid request payload.' }, 400);
  }

  // --- 3. Extract Necessary Data ---
  const videoId = newLikeDoc.videoId;
  const newDocumentId = newLikeDoc.$id;
  const permissions = newLikeDoc.$permissions;
  const ownerUserId = getOwnerId(permissions); // Get ID of user who created this new like/dislike

  if (!videoId) {
      error(`Missing 'videoId' attribute in payload for document ${newDocumentId || 'UNKNOWN'}.`);
      return res.json({ success: false, message: "Payload missing required 'videoId' field." }, 400);
  }

  if (!ownerUserId) {
    error(`Could not determine owner for document ${newDocumentId}. Permissions: ${JSON.stringify(permissions)}`);
    // Stopping is safer than potentially deleting likes from other users.
    return res.json({ success: false, message: 'Could not determine document owner.' }, 400);
  }

  log(`Identified data - VideoID: ${videoId}, OwnerID: ${ownerUserId}, NewDocID: ${newDocumentId}`);

  // --- 4. Find and Delete Previous Likes/Dislikes by the Same User for the Same Video ---
  try {
    // Query for documents matching the videoId AND created by the same user,
    // but EXCLUDING the newly created document itself.
    // Appwrite queries don't directly support querying based on permissions owner.
    // We must query broadly and filter afterwards.
    const query = [
      Query.equal('videoId', videoId),     // Match the same video
      Query.limit(100)                     // Limit results for safety/performance
    ];

    log(`Querying for documents with videoId: ${videoId}`);
    const previousDocsResponse = await databases.listDocuments(
      APPWRITE_DATABASE_ID,
      LIKES_COLLECTION_ID,
      query
    );

    log(`Found ${previousDocsResponse.total} potential previous documents for video ${videoId}.`);

    let deletedCount = 0;
    // Iterate through found documents and delete only those owned by the SAME user, excluding the new one.
    for (const oldDoc of previousDocsResponse.documents) {
      // Skip the document that just triggered this function
      if (oldDoc.$id === newDocumentId) {
        continue;
      }

      const oldDocOwnerId = getOwnerId(oldDoc.$permissions);
      if (oldDocOwnerId === ownerUserId) {
        log(`Found previous document ${oldDoc.$id} owned by same user ${ownerUserId}. Deleting...`);
        try {
          await databases.deleteDocument(APPWRITE_DATABASE_ID, LIKES_COLLECTION_ID, oldDoc.$id);
          log(`Successfully deleted previous document ${oldDoc.$id}.`);
          deletedCount++;
        } catch (deleteError) {
          error(`Failed to delete document ${oldDoc.$id}: ${deleteError.message || deleteError}`);
          // Log error but continue trying to delete others if found.
        }
      } else {
         // Log if a doc for the same video is found but owner doesn't match. Useful for debugging permissions.
         log(`Skipping document ${oldDoc.$id} - owner mismatch (Expected: ${ownerUserId}, Found: ${oldDocOwnerId}).`);
      }
    }

    log(`Finished processing. Deleted ${deletedCount} previous document(s) by user ${ownerUserId} for video ${videoId}.`);
    return res.json({ success: true, message: `Processed like event. Deleted ${deletedCount} previous entries.` });

  } catch (processingError) {
    error(`Error querying or deleting documents: ${processingError.message || processingError}`);
    return res.json({ success: false, message: 'An internal error occurred during processing.' }, 500);
  }
};
