from appwrite.client import Client
from appwrite.services.databases import Databases
from appwrite.exception import AppwriteException
from appwrite.permission import Permission
from appwrite.role import Role
import os
import json

# Configuration Constants
DATABASE_ID = "database"
ACCOUNTS_COLLECTION_ID = "accounts"
VIDEO_COUNTS_COLLECTION_ID = "video_counts"
# VIDEO_INTERACTIONS_COLLECTION_ID = "video_interactions" # Not directly needed in function logic

def main(context):
    context.log("--- Likes Manager (Event Triggered) Invocation Start ---")

    # --- Environment Variable Check ---
    api_endpoint = os.environ.get("APPWRITE_FUNCTION_API_ENDPOINT")
    project_id = os.environ.get("APPWRITE_FUNCTION_PROJECT_ID")
    # API Key is crucial for event-triggered functions needing broad access
    api_key = os.environ.get("APPWRITE_FUNCTION_API_KEY")

    if not all([api_endpoint, project_id, api_key]):
        message = "Function configuration error: Missing endpoint, project ID, or API key."
        context.error(message)
        # Event functions usually just log errors or return non-2xx status
        # For simplicity, returning text which might appear in function logs.
        return context.res.text(message, 500)

    # --- Parse Event Payload ---
    interaction_doc = None
    try:
        # The created document data is the event payload
        interaction_doc = json.loads(context.req.body_raw)
        context.log(f"Received interaction document payload: {json.dumps(interaction_doc)}")
    except json.JSONDecodeError as e:
        context.error(f"Failed to parse event payload (interaction document): {e}. Raw: '{context.req.body_raw}'")
        return context.res.text("Invalid event payload", 400)

    # --- Extract Data from Interaction Document ---
    video_id = interaction_doc.get('videoId')
    interaction_type = interaction_doc.get('type')
    doc_permissions = interaction_doc.get('$permissions', [])
    interaction_doc_id = interaction_doc.get('$id', 'unknown') # For logging

    if not video_id or interaction_type not in ['like', 'dislike']:
        context.error(f"Missing videoId or invalid type ('{interaction_type}') in interaction doc {interaction_doc_id}.")
        return context.res.text("Invalid interaction data", 400)

    # --- Identify User ID from Permissions ---
    user_id = None
    # Look for update permission, assuming only the creator has it on the interaction doc
    update_permission_prefix = 'update("user:'
    for perm in doc_permissions:
        if perm.startswith(update_permission_prefix):
            # Extract the user ID between 'user:' and '")'
            start_index = len(update_permission_prefix)
            end_index = perm.find('")', start_index)
            if end_index != -1:
                 user_id = perm[start_index:end_index]
                 break # Found the user ID

    if not user_id:
        context.error(f"Could not determine user ID from permissions on interaction doc {interaction_doc_id}. Permissions: {doc_permissions}")
        return context.res.text("Could not identify user from interaction document", 500)

    context.log(f"Processing interaction by User ID: {user_id} for Video ID: {video_id}, Type: {interaction_type}")

    # --- Initialize Appwrite Client (using API Key) ---
    client = Client()
    client.set_endpoint(api_endpoint).set_project(project_id).set_key(api_key)
    databases = Databases(client)

    try:
        # --- Core Logic ---

        # 1. Get user's account document
        try:
            account_doc = databases.get_document(DATABASE_ID, ACCOUNTS_COLLECTION_ID, user_id)
            videos_liked = account_doc.get('videosLiked', []) or []
            videos_disliked = account_doc.get('videosDisliked', []) or []
            context.log(f"User {user_id}: Likes {len(videos_liked)}, Dislikes {len(videos_disliked)}")
        except AppwriteException as e:
             if e.code == 404:
                context.error(f"CRITICAL: Account document not found for user {user_id} who created interaction {interaction_doc_id}.")
                # Depending on requirements, might try to create the doc here, but failing is safer for now.
                return context.res.text(f"Account document missing for user {user_id}", 500)
             else:
                context.error(f"Error fetching account doc for {user_id}: {e}")
                raise # Rethrow other DB errors

        # 2. Determine current status based on arrays
        current_status = None
        if video_id in videos_liked:
            current_status = 'liked'
        elif video_id in videos_disliked:
            current_status = 'disliked'
        context.log(f"Video {video_id} current status for user {user_id}: {current_status}")

        # 3. Determine changes needed based on the interaction type and current status
        like_change = 0         # Delta for video_counts likeCount
        dislike_change = 0      # Delta for video_counts dislikeCount
        perform_user_update = False # Flag to update user's account doc

        liked_set = set(videos_liked)
        disliked_set = set(videos_disliked)

        if interaction_type == 'like':
            if current_status == 'liked':       # User clicked 'like' again - toggle OFF
                like_change = -1
                liked_set.discard(video_id)
                perform_user_update = True
            elif current_status == 'disliked':  # User clicked 'like' but had disliked - switch to LIKE
                like_change = 1
                dislike_change = -1
                liked_set.add(video_id)
                disliked_set.discard(video_id)
                perform_user_update = True
            else:                               # User clicked 'like' (was neutral) - add LIKE
                like_change = 1
                liked_set.add(video_id)
                perform_user_update = True
        elif interaction_type == 'dislike':
            if current_status == 'disliked':    # User clicked 'dislike' again - toggle OFF
                dislike_change = -1
                disliked_set.discard(video_id)
                perform_user_update = True
            elif current_status == 'liked':     # User clicked 'dislike' but had liked - switch to DISLIKE
                like_change = -1
                dislike_change = 1
                disliked_set.add(video_id)
                liked_set.discard(video_id)
                perform_user_update = True
            else:                               # User clicked 'dislike' (was neutral) - add DISLIKE
                dislike_change = 1
                disliked_set.add(video_id)
                perform_user_update = True

        context.log(f"Changes calculated: like_change={like_change}, dislike_change={dislike_change}, perform_user_update={perform_user_update}")

        # Exit early if no actual change occurred
        if not perform_user_update:
            context.log(f"No state change needed for user {user_id}, video {video_id}, type {interaction_type}. Interaction was redundant.")
            context.log("--- Likes Manager Invocation End (No Change) ---")
            return context.res.text("No change", 200) # 200 OK is fine for event functions

        # 4. Update user's account document IF needed
        if perform_user_update:
            updated_liked_list = list(liked_set)
            updated_disliked_list = list(disliked_set)
            account_update_data = {
                'videosLiked': updated_liked_list,
                'videosDisliked': updated_disliked_list
            }
            databases.update_document(DATABASE_ID, ACCOUNTS_COLLECTION_ID, user_id, account_update_data)
            context.log(f"Updated account doc for user {user_id}. New counts: Likes={len(updated_liked_list)}, Dislikes={len(updated_disliked_list)}")

        # 5. Update counts on 'video_counts' collection (if counts changed)
        if like_change != 0 or dislike_change != 0:
            context.log(f"Updating counts in 'video_counts' for video {video_id}...")
            current_likes = 0
            current_dislikes = 0
            current_comments_json = '[]' # Need these for potential creation
            current_comment_count = 0
            counts_doc_exists = False
            try:
                counts_doc = databases.get_document(DATABASE_ID, VIDEO_COUNTS_COLLECTION_ID, video_id)
                current_likes = counts_doc.get('likeCount', 0)
                current_dislikes = counts_doc.get('dislikeCount', 0)
                # Preserve comment info if doc exists
                current_comments_json = counts_doc.get('commentsJson', '[]')
                current_comment_count = counts_doc.get('commentCount', 0)
                counts_doc_exists = True
                context.log(f"Found counts document. Current counts: Likes={current_likes}, Dislikes={current_dislikes}")
            except AppwriteException as e:
                if e.code == 404:
                    counts_doc_exists = False
                    context.log(f"Counts document for video {video_id} not found. Will create.")
                else:
                    context.error(f"Error fetching counts document for {video_id}: {e}. Assuming counts=0.")
                    # Continue assuming 0 counts, but log the error

            new_like_count = max(0, current_likes + like_change)
            new_dislike_count = max(0, current_dislikes + dislike_change)

            try:
                if counts_doc_exists:
                    counts_update_data = {'likeCount': new_like_count, 'dislikeCount': new_dislike_count}
                    databases.update_document(
                        database_id=DATABASE_ID, collection_id=VIDEO_COUNTS_COLLECTION_ID, document_id=video_id,
                        data=counts_update_data
                    )
                    context.log(f"Updated counts for video {video_id}: Likes={new_like_count}, Dislikes={new_dislike_count}")
                else:
                    counts_create_data = {
                        'likeCount': new_like_count,
                        'dislikeCount': new_dislike_count,
                        'commentsJson': current_comments_json, # Initialize comment fields
                        'commentCount': current_comment_count
                    }
                    databases.create_document(
                        database_id=DATABASE_ID, collection_id=VIDEO_COUNTS_COLLECTION_ID, document_id=video_id,
                        data=counts_create_data,
                        permissions=[Permission.read(Role.any())] # Allow anyone to read counts
                    )
                    context.log(f"Created counts document for video {video_id}: Likes={new_like_count}, Dislikes={new_dislike_count}")
            except AppwriteException as e:
                # Log error updating/creating counts, but don't fail the whole function
                # The user's state was updated, which is the primary goal here.
                context.error(f"Failed to update/create counts document for {video_id}: {e}")
        else:
            context.log("No count changes required for video_counts.")

        # --- Success ---
        context.log(f"Successfully processed interaction {interaction_doc_id} of type '{interaction_type}'")
        context.log("--- Likes Manager Invocation End (Success) ---")
        return context.res.text("Processed interaction", 200)

    except AppwriteException as e:
        context.error(f"Appwrite Error during processing: {e.message} (Code: {e.code})")
        context.log("--- Likes Manager Invocation End (Appwrite Error) ---")
        return context.res.text(f"Appwrite Error: {e.message}", 500) # Internal Server Error for function context
    except Exception as e:
        context.error(f"Unexpected Error: {e}")
        import traceback
        context.error(traceback.format_exc()) # Log full traceback for unexpected errors
        context.log("--- Likes Manager Invocation End (Unexpected Error) ---")
        return context.res.text(f"Unexpected Server Error: {e}", 500)
