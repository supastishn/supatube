import { Client, Databases, Query } from 'node-appwrite';

// --- Top-Level Scope ---

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

// --- 1. Get Environment Variables & Initialize Client (Top Level) ---
console.log('[Top Level] Initializing function instance for event processing...');

const {
  APPWRITE_FUNCTION_ENDPOINT,
  APPWRITE_FUNCTION_PROJECT_ID,
  APPWRITE_FUNCTION_API_KEY, // Use the API key provided by the function runtime
  APPWRITE_DATABASE_ID,
  LIKES_COLLECTION_ID,
  // VIDEOS_COLLECTION_ID, // Only needed if interacting with videos collection
} = process.env;

// Basic validation at the top level
if (
  !APPWRITE_FUNCTION_ENDPOINT ||
  !APPWRITE_FUNCTION_PROJECT_ID ||
  !APPWRITE_FUNCTION_API_KEY || // Check for API key
  !APPWRITE_DATABASE_ID ||
  !LIKES_COLLECTION_ID
  // !VIDEOS_COLLECTION_ID // Only needed if interacting with videos collection
) {
  const errorMsg = 'FATAL: Missing required environment variables (Endpoint, ProjectID, API Key, DB ID, Likes Collection ID). Function cannot start.';
  console.error(`[Top Level] ${errorMsg}`);
  throw new Error(errorMsg);
} else {
  console.log('[Top Level] Environment variables loaded successfully.');
}

// Initialize Appwrite client - uses API Key provided by runtime
const client = new Client()
  .setEndpoint(APPWRITE_FUNCTION_ENDPOINT)
  .setProject(APPWRITE_FUNCTION_PROJECT_ID)
  .setKey(APPWRITE_FUNCTION_API_KEY); // Use the key provided by the environment

const databases = new Databases(client);
// const account = new Account(client); // Remove - not needed for this logic

// --- 2. Exported Default Function (Event Handler) ---
// This function executes when Appwrite triggers it based on a configured event.
export default async ({ req, res, log, error }) => {
  log('Like cleanup function triggered by database create event.');

  // --- A. Process Event Payload ---
  let newLikeDoc;
  try {
    // Appwrite passes the event payload (the created document) as a JSON string in req.payload
    if (!req.payload) {
      error('Request payload is missing. Function was likely not triggered by an event.');
      return res.json({ success: false, message: 'Request payload is missing.' }, 400);
    }
    newLikeDoc = JSON.parse(req.payload);
    log(`Processing event for new like document ID: ${newLikeDoc.$id}`);
  } catch (e) {
    error(`Failed to parse request payload: ${e.message}`);
    return res.json({ success: false, message: 'Invalid request payload.' }, 400);
  }

  // --- B. Extract Necessary Data ---
  const videoId = newLikeDoc.videoId;
  const newDocumentId = newLikeDoc.$id;
  const permissions = newLikeDoc.$permissions;
  const ownerUserId = getOwnerId(permissions); // Get ID of user who created this new like/dislike

  // Validate essential data
  if (!videoId) {
      error(`Missing 'videoId' attribute in payload for document ${newDocumentId || 'UNKNOWN'}.`);
      return res.json({ success: false, message: "Payload missing required 'videoId' field." }, 400);
  }
  if (!ownerUserId) {
    error(`Could not determine owner for document ${newDocumentId}. Permissions: ${JSON.stringify(permissions)}`);
    return res.json({ success: false, message: 'Could not determine document owner.' }, 400);
  }

  log(`Identified data - VideoID: ${videoId}, OwnerID: ${ownerUserId}, NewDocID: ${newDocumentId}`);

  // --- C. Find and Delete Previous Likes/Dislikes by the Same User for the Same Video ---
  try {
    // Query for documents matching the videoId. Filtering by owner happens after fetching.
    const query = [
      Query.equal('videoId', videoId),
      Query.limit(100) // Safety limit
    ];

    log(`Querying for previous documents with videoId: ${videoId}`);
    const previousDocsResponse = await databases.listDocuments(
      APPWRITE_DATABASE_ID,
      LIKES_COLLECTION_ID,
      query
    );

    log(`Found ${previousDocsResponse.total} potential previous documents for video ${videoId}.`);

    let deletedCount = 0;
    const deletePromises = []; // Array to hold delete promises for concurrent execution

    // Iterate through found documents and delete only those owned by the SAME user, excluding the new one.
    for (const oldDoc of previousDocsResponse.documents) {
      // Skip the document that just triggered this function
      if (oldDoc.$id === newDocumentId) {
        // log(`Skipping current document ${oldDoc.$id}.`);
        continue;
      }

      const oldDocOwnerId = getOwnerId(oldDoc.$permissions);
      if (oldDocOwnerId === ownerUserId) {
        log(`Found previous document ${oldDoc.$id} owned by same user ${ownerUserId}. Queueing for deletion...`);
        // Add the delete operation promise to the array
        deletePromises.push(
          databases.deleteDocument(APPWRITE_DATABASE_ID, LIKES_COLLECTION_ID, oldDoc.$id)
            .then(() => {
              log(`Successfully deleted previous document ${oldDoc.$id}.`);
              deletedCount++; // Increment count on successful deletion
            })
            .catch(deleteError => {
              error(`Failed to delete document ${oldDoc.$id}: ${deleteError.message || deleteError}`);
              // Log error but allow other deletions to proceed
            })
        );
      } else {
         // Optional: Log owner mismatch for debugging permissions
         // log(`Skipping document ${oldDoc.$id} - owner mismatch (Expected: ${ownerUserId}, Found: ${oldDocOwnerId}).`);
      }
    }

    // Wait for all queued delete operations to complete
    await Promise.all(deletePromises);

    log(`Finished processing. Deleted ${deletedCount} previous document(s) by user ${ownerUserId} for video ${videoId}.`);
    return res.json({ success: true, message: `Processed like event. Deleted ${deletedCount} previous entries.` });

  } catch (processingError) {
    error(`Error querying or deleting documents: ${processingError.message || processingError}`);
    if (processingError.stack) {
       error(processingError.stack);
    }
    return res.json({ success: false, message: 'An internal error occurred during processing.' }, 500);
  }
}; // End of export default async function
