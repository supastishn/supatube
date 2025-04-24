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

// --- 1. Get Environment Variables (Top Level) ---
console.log('[Top Level] Initializing function instance for event processing...');

const {
  APPWRITE_FUNCTION_ENDPOINT,
  APPWRITE_FUNCTION_PROJECT_ID,
  APPWRITE_DATABASE_ID,
  LIKES_COLLECTION_ID,
  // VIDEOS_COLLECTION_ID, // Only needed if interacting with videos collection
} = process.env;

// Basic validation at the top level
if (
  !APPWRITE_FUNCTION_ENDPOINT ||
  !APPWRITE_FUNCTION_PROJECT_ID ||
  !APPWRITE_DATABASE_ID ||
  !LIKES_COLLECTION_ID
  // !VIDEOS_COLLECTION_ID // Only needed if interacting with videos collection
) {
  const errorMsg = 'FATAL: Missing required environment variables (Endpoint, ProjectID, DB ID, Likes Collection ID). Function cannot start.';
  console.error(`[Top Level] ${errorMsg}`);
  throw new Error(errorMsg);
} else {
  console.log('[Top Level] Environment variables loaded successfully.');
}

// Client will be initialized inside the function using the API key from the request header

// --- 2. Exported Default Function (CRON Job Handler) ---
// This function runs when triggered by the CRON schedule.
export default async ({ req, res, log, error }) => {
  log('Starting scheduled cleanup of likes/dislikes...');

  // --- Initialize Client Inside Function using Header ---
  const apiKey = req?.headers ? req.headers['x-appwrite-key'] : null;

  if (!apiKey) {
    error('Missing required authentication key in x-appwrite-key header.');
    return res.json({ success: false, message: 'Authentication key missing in request header.' }, 401); // Unauthorized
  }

  const client = new Client()
    .setEndpoint(APPWRITE_FUNCTION_ENDPOINT)
    .setProject(APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(apiKey); // Use the key from the header

  const databases = new Databases(client);
  // --- End Client Initialization ---

  // Map structure: Map<videoId, Map<userId, { id: string; createdAt: Date }[]>>
  const userVideoLikes = new Map();
  let totalDocsScanned = 0;
  const MAX_DOCS_OVERALL = 100000; // Safety limit to prevent runaway loops/memory issues
  const PAGE_LIMIT = 100; // Fetch documents in pages

  try {
    log(`Fetching all documents from collection ${LIKES_COLLECTION_ID}...`);
    let cursor = null; // For cursor pagination

    do {
      const queries = [Query.limit(PAGE_LIMIT)];
      if (cursor) {
        queries.push(Query.cursorAfter(cursor));
      }

      log(`Fetching page (limit ${PAGE_LIMIT}, cursor ${cursor || 'start'})...`);
      const response = await databases.listDocuments(
        APPWRITE_DATABASE_ID,
        LIKES_COLLECTION_ID,
        queries
      );

      const documents = response.documents;
      totalDocsScanned += documents.length;
      log(`Fetched ${documents.length} documents this page. Total scanned: ${totalDocsScanned}`);

      if (documents.length > 0) {
        // Update cursor for the next page
        cursor = documents[documents.length - 1].$id;

        // Process documents in the current page
        for (const doc of documents) {
          const videoId = doc.videoId;
          const ownerUserId = getOwnerId(doc.$permissions);
          const docId = doc.$id;
          const createdAtString = doc.$createdAt;

          if (!videoId || !ownerUserId || !createdAtString) {
            // Log skipped documents for potential debugging
            // log(`Skipping document ${docId}: Missing videoId (${videoId}), ownerUserId (${ownerUserId}), or $createdAt (${createdAtString}).`);
            continue;
          }

          // Convert createdAt string to Date object for sorting
          let createdAtDate;
          try {
            createdAtDate = new Date(createdAtString);
            if (isNaN(createdAtDate.getTime())) {
              // log(`Skipping document ${docId}: Invalid $createdAt date format: ${createdAtString}.`);
              continue;
            }
          } catch (dateError) {
            // log(`Skipping document ${docId}: Error parsing $createdAt date: ${dateError.message}.`);
            continue;
          }

          // --- Grouping Logic ---
          // Get or create videoId map
          if (!userVideoLikes.has(videoId)) {
            userVideoLikes.set(videoId, new Map());
          }
          const videoMap = userVideoLikes.get(videoId);

          // Get or create userId array within videoMap
          if (!videoMap.has(ownerUserId)) {
            videoMap.set(ownerUserId, []);
          }
          const likesArray = videoMap.get(ownerUserId);

          // Add like info (id and parsed date) to the array
          likesArray.push({ id: docId, createdAt: createdAtDate });
        }
      } else {
        // No more documents found
        cursor = null;
      }

      // Safety break if too many documents are scanned
      if (totalDocsScanned >= MAX_DOCS_OVERALL) {
        error(`Safety break: Scanned ${totalDocsScanned} documents, exceeding limit ${MAX_DOCS_OVERALL}. Stopping scan.`);
        cursor = null; // Stop pagination
        break;
      }

    } while (cursor); // Continue while there are more pages

    log(`Finished fetching. Scanned ${totalDocsScanned} total documents. Found likes for ${userVideoLikes.size} unique videos.`);
    log('Identifying duplicate likes/dislikes to keep only the latest per user/video...');

    const deleteIds = new Set();

    // Iterate through the collected data (grouped by video, then user) to find duplicates
    for (const [videoId, videoMap] of userVideoLikes.entries()) {
      for (const [userId, likesArray] of videoMap.entries()) {
        // Only process if a user has more than one like/dislike for the same video
        if (likesArray.length > 1) {
          // Sort the likes for this user/video by creation date, newest first
          likesArray.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

          // The first element (likesArray[0]) is the latest, keep it.
          // Add all others (from index 1 onwards) to the delete set.
          for (let i = 1; i < likesArray.length; i++) {
            deleteIds.add(likesArray[i].id);
          }
          // Log details about duplicates found for a specific user/video pair
          // log(`User ${userId} / Video ${videoId}: Found ${likesArray.length} entries. Marked ${likesArray.length - 1} for deletion. Keeping ${likesArray[0].id}.`);
        }
      }
    }

    log(`Identified ${deleteIds.size} older documents to delete.`);

    if (deleteIds.size === 0) {
      log('No duplicate documents found needing deletion.');
      return res.json({ success: true, message: 'Scan complete. No duplicates found.', scanned: totalDocsScanned });
    }

    // --- Perform Deletions ---
    log(`Starting deletion of ${deleteIds.size} documents...`);
    let deletedCount = 0;
    const deletePromises = [];

    for (const docIdToDelete of deleteIds) {
      deletePromises.push(
        databases.deleteDocument(APPWRITE_DATABASE_ID, LIKES_COLLECTION_ID, docIdToDelete)
          .then(() => {
            // log(`Successfully deleted document ${docIdToDelete}.`); // Can be very verbose
            deletedCount++;
          })
          .catch(deleteError => {
            error(`Failed to delete document ${docIdToDelete}: ${deleteError.message || deleteError}`);
            // Log error but continue processing other deletions
          })
      );
      // Optional: Batch promises if deleting thousands of documents to avoid overwhelming the API
      // if (deletePromises.length >= 50) { await Promise.all(deletePromises); deletePromises.length = 0; log('Processed batch of 50 deletes...'); }
    }

    // Wait for any remaining delete operations
    if (deletePromises.length > 0) {
      await Promise.all(deletePromises);
    }

    log(`Deletion complete. Successfully deleted ${deletedCount} out of ${deleteIds.size} targeted documents.`);
    return res.json({
      success: true,
      message: `Scan complete. Deleted ${deletedCount} older likes/dislikes.`,
      scanned: totalDocsScanned,
      deleted: deletedCount,
      intendedDeletions: deleteIds.size
    });

  } catch (processingError) {
    error(`Error during scheduled cleanup: ${processingError.message || processingError}`);
    // Log stack trace if available for better debugging
    if (processingError.stack) {
       error(processingError.stack);
    }
    return res.json({
      success: false,
      message: 'An internal error occurred during cleanup.',
      error: processingError.message || 'Unknown error'
     }, 500);
  }
}; // End of export default async function
