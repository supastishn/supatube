from appwrite.client import Client
from appwrite.services.databases import Databases
from appwrite.exception import AppwriteException
from appwrite.query import Query
from appwrite.permission import Permission
from appwrite.role import Role
import os
import json

DATABASE_ID = "database"
LIKES_COLLECTION_ID =  "likes"
VIDEO_COUNTS_COLLECTION_ID = "video_counts"
ACCOUNTS_COLLECTION_ID = "accounts"

# This is executed when the function is triggered
def main(context):
    # --- START DETAILED REQUEST LOGGING ---
    context.log("--- Likes Manager Invocation Start ---")
    context.log(f"Request Method: {context.req.method}")
    context.log(f"Request Scheme: {context.req.scheme}")
    context.log(f"Request Host: {context.req.host}")
    context.log(f"Request Port: {context.req.port}")
    context.log(f"Request Path: {context.req.path}")
    context.log(f"Request Query String: {context.req.query_string}")
    # Log headers, excluding potentially sensitive ones
    log_headers = {k.lower(): v for k, v in context.req.headers.items() if 'key' not in k.lower() and 'secret' not in k.lower() and 'auth' not in k.lower()}
    context.log(f"Request Headers: {json.dumps(log_headers)}")
    # Log the raw body received
    context.log(f"Request Body Raw: '{context.req.body_raw}'")
    # --- END DETAILED REQUEST LOGGING ---
    # Ensure environment variables are set
    api_endpoint = os.environ.get("APPWRITE_FUNCTION_API_ENDPOINT")
    project_id = os.environ.get("APPWRITE_FUNCTION_PROJECT_ID")
    api_key = context.req.headers.get('x-appwrite-key') # Use API key environment variable

    if not all([api_endpoint, project_id, api_key]):
        error_message = "Missing required environment variables (ENDPOINT, PROJECT_ID, API_KEY)."
        context.error(error_message)
        response_payload = {"success": "false", "message": "Function configuration error."}
        response_status = 500
        context.log(f"Exiting with Error - Status: {response_status}, Payload: {response_payload}")
        context.log("--- Likes Manager Invocation End (Error) ---")
        return context.res.json(response_payload, statusCode=response_status) # Return the configured response

    # Check for User ID (should be present if execute permission is 'users')
    user_id = context.req.headers.get('x-appwrite-user-id')
    if not user_id:
        error_message = "User not authenticated."
        context.error(error_message)
        response_payload = {"success": "false", "message": "Authentication required."}
        response_status = 401
        context.log(f"Exiting with Error - Status: {response_status}, Payload: {response_payload}")
        context.log("--- Likes Manager Invocation End (Error) ---")
        return context.res.json(response_payload, statusCode=response_status) # Return the configured response
    context.log(f"Authenticated User ID: {user_id}")

    # Parse request body
    payload = None
    video_id = None
    action = None
    try:
        # Use body_raw which should contain the string sent from the client SDK
        payload = json.loads(context.req.body_raw)
        # Log the successfully parsed payload
        context.log(f"Parsed Payload: {payload}")
        video_id = payload.get('videoId')
        action = payload.get('action')

        if not video_id or action not in ['like', 'dislike']:
            raise ValueError("Missing 'videoId' or invalid 'action' in request body.")
        # Log the extracted videoId and action
        context.log(f"Processing Video ID: {video_id}, Action: {action}")

    except Exception as e:
        # Log the specific error and include the raw body for context
        error_message = f"Invalid request payload: {e}. Raw body was: '{context.req.body_raw}'"
        context.error(error_message)
        response_payload = {"success": "false", "message": f"Invalid request: {e}"}
        response_status = 400
        context.log(f"Exiting with Error - Status: {response_status}, Payload: {response_payload}")
        context.log("--- Likes Manager Invocation End (Error) ---")
        return context.res.json(response_payload, statusCode=response_status) # Return the configured response

    # Initialize Appwrite Client
    client = Client()
    client.set_endpoint(api_endpoint)
    client.set_project(project_id)
    client.set_key(api_key) # Use API Key for privileged access

    databases = Databases(client)

    like_change = 0
    dislike_change = 0
    new_status = None # 'like', 'dislike', or None

    try:
        # === Start Core Logic (v2 - Using accounts collection arrays) ===
        context.log(f"Fetching account details for user {user_id}...")

        # 1. Get user's account document
        account_doc = None
        videos_liked = []
        videos_disliked = []
        try:
            account_doc = databases.get_document(DATABASE_ID, ACCOUNTS_COLLECTION_ID, user_id)
            # Ensure arrays exist and are lists, handle None/null from potential older docs or missing attributes
            videos_liked = account_doc.get('videosLiked', []) or []
            videos_disliked = account_doc.get('videosDisliked', []) or []
            context.log(f"Fetched account doc. Liked: {len(videos_liked)} videos, Disliked: {len(videos_disliked)} videos.")
        except AppwriteException as e:
            if e.code == 404:
                # This should ideally not happen if user is authenticated via Appwrite & registered
                context.error(f"CRITICAL: Account document not found for authenticated user {user_id}. Cannot proceed.")
                raise Exception(f"User account details document missing for user {user_id}.")
            else:
                context.error(f"Error fetching account document for user {user_id}: {e}")
                raise Exception(f"Database error fetching account details: {e.message}")

        # 2. Determine current status based on arrays
        current_status = None
        if video_id in videos_liked:
            current_status = 'liked'
        elif video_id in videos_disliked:
            current_status = 'disliked'
        context.log(f"Current status for video {video_id}: {current_status}")

        # 3. Determine changes based on action and current state
        like_change = 0         # For video_counts update
        dislike_change = 0      # For video_counts update
        new_status = None       # 'liked', 'disliked', or None (final state for account arrays)

        if action == 'like':
            if current_status == 'liked':       # Toggle like off
                like_change = -1
                new_status = None
            elif current_status == 'disliked':  # Change dislike to like
                like_change = 1
                dislike_change = -1
                new_status = 'liked'
            else:                               # Add new like
                like_change = 1
                new_status = 'liked'
        else: # action == 'dislike'
            if current_status == 'disliked':    # Toggle dislike off
                dislike_change = -1
                new_status = None
            elif current_status == 'liked':     # Change like to dislike
                like_change = -1
                dislike_change = 1
                new_status = 'disliked'
            else:                               # Add new dislike
                dislike_change = 1
                new_status = 'disliked'
        context.log(f"Determined changes: like_change={like_change}, dislike_change={dislike_change}, new_status={new_status}")

        # 4. Modify the arrays based on the new_status
        # Use sets for efficient add/remove and uniqueness
        liked_set = set(videos_liked)
        disliked_set = set(videos_disliked)

        if new_status == 'liked':
            disliked_set.discard(video_id) # Remove from disliked if present
            liked_set.add(video_id)      # Add to liked (set handles duplicates)
        elif new_status == 'disliked':
            liked_set.discard(video_id)    # Remove from liked if present
            disliked_set.add(video_id)     # Add to disliked
        else: # new_status is None
            liked_set.discard(video_id)    # Remove from liked if present
            disliked_set.discard(video_id) # Remove from disliked if present

        # Convert sets back to lists for storage
        updated_liked_list = list(liked_set)
        updated_disliked_list = list(disliked_set)
        context.log(f"Updated lists ready. Liked: {len(updated_liked_list)}, Disliked: {len(updated_disliked_list)}")

        # 5. Update the user's account document
        try:
            # --- Verify Data Payload ---
            # Ensure ONLY 'videosLiked' and 'videosDisliked' are sent for the 'accounts' update
            account_update_data = {
                'videosLiked': updated_liked_list,
                'videosDisliked': updated_disliked_list
            }
            context.log(f"Attempting to update ACCOUNTS collection document {user_id} with data: {account_update_data}")

            databases.update_document(
                database_id=DATABASE_ID,
                collection_id=ACCOUNTS_COLLECTION_ID, # Targeting the accounts collection
                document_id=user_id,
                data=account_update_data # Use the verified data payload
            )
            context.log(f"Successfully updated account document for user {user_id}")
        except AppwriteException as e:
            context.error(f"Failed to update account document for user {user_id}: {e}")
            # If updating the arrays fails, we should probably stop and report error
            # The error message below matches the traceback seen previously
            raise Exception(f"Failed to save updated like/dislike status: {e.message}")

        # 6. Update counts on the 'video_counts' collection (same logic as before)
        if like_change != 0 or dislike_change != 0:
            context.log(f"Updating counts in 'video_counts' for video {video_id}...")
            current_likes = 0
            current_dislikes = 0
            counts_doc_exists = False
            try:
                counts_doc = databases.get_document(DATABASE_ID, VIDEO_COUNTS_COLLECTION_ID, video_id)
                current_likes = counts_doc.get('likeCount', 0)
                current_dislikes = counts_doc.get('dislikeCount', 0)
                counts_doc_exists = True
                context.log(f"Found counts document. Current counts: Likes={current_likes}, Dislikes={current_dislikes}")
            except AppwriteException as e:
                if e.code == 404:
                    counts_doc_exists = False
                    context.log(f"Counts document for video {video_id} not found. Will create.")
                else:
                    context.error(f"Error fetching counts document for {video_id}: {e}")
                    # Proceed assuming 0 counts

            new_like_count = max(0, current_likes + like_change)
            new_dislike_count = max(0, current_dislikes + dislike_change)

            try:
                if counts_doc_exists:
                    databases.update_document(
                        database_id=DATABASE_ID, collection_id=VIDEO_COUNTS_COLLECTION_ID, document_id=video_id,
                        data={'likeCount': new_like_count, 'dislikeCount': new_dislike_count}
                    )
                    context.log(f"Updated counts for video {video_id}: Likes={new_like_count}, Dislikes={new_dislike_count}")
                else:
                    databases.create_document(
                        database_id=DATABASE_ID, collection_id=VIDEO_COUNTS_COLLECTION_ID, document_id=video_id,
                        data={'likeCount': new_like_count, 'dislikeCount': new_dislike_count},
                        permissions=[Permission.read(Role.any())] # Allow anyone to read counts
                    )
                    context.log(f"Created counts document for video {video_id}: Likes={new_like_count}, Dislikes={new_dislike_count}")
            except AppwriteException as e:
                context.error(f"Failed to update/create counts document for {video_id}: {e}") # Log error but don't fail the whole request
        else:
            context.log("No count changes required.")

        # === End Core Logic ===

        # 7. Determine final integer status based on updated lists and return success response
        final_integer_status = 0
        if video_id in updated_liked_list:
            final_integer_status = 1
        elif video_id in updated_disliked_list:
            final_integer_status = -1

        success_payload = { "success": "true", "newStatus": final_integer_status }
        context.log(f"Action '{action}' completed successfully. Returning: {success_payload}")
        context.log("--- Likes Manager Invocation End (Success) ---")
        return context.res.json(success_payload) # Return the configured response

    except Exception as e:
        error_message = f"Unexpected error processing like/dislike: {e}"
        context.error(error_message) # Log only the message
        response_payload = {"success": "false", "message": f"Server error: {e}"}
        response_status = 500
        # --- Log Response Before Returning ---
        context.log(f"Exiting with Error - Status: {response_status}, Payload: {response_payload}")
        context.log("--- Likes Manager Invocation End (Error) ---")
        return context.res.json(response_payload, statusCode=response_status) # Return the configured response
