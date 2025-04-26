from appwrite.client import Client
from appwrite.services.databases import Databases
from appwrite.exception import AppwriteException
from appwrite.permission import Permission
from appwrite.role import Role
from appwrite.query import Query
from appwrite.id import ID
import os
import json

# Configuration Constants
DATABASE_ID = "database"
ACCOUNTS_COLLECTION_ID = "accounts"
VIDEO_COUNTS_COLLECTION_ID = "video_counts"
VIDEO_INTERACTIONS_COLLECTION_ID = "video_interactions"
USER_VIDEO_STATES_COLLECTION_ID = "user_video_states"

def main(context):
    context.log("--- Likes Manager Batch Job Start ---")

    # --- Environment Variable Check ---
    api_endpoint = os.environ.get("APPWRITE_FUNCTION_API_ENDPOINT")
    project_id = os.environ.get("APPWRITE_FUNCTION_PROJECT_ID")
    # API key comes from header instead of environment variable
    api_key = context.req.headers.get('x-appwrite-key')

    if not all([api_endpoint, project_id]) or not api_key:
        message = "Function configuration error: Missing endpoint, project ID in env, or x-appwrite-key header."
        context.error(message)
        return context.res.json({"success": False, "message": message}, 500)

    # --- Initialize Appwrite Client (using API Key from header) ---
    client = Client()
    client.set_endpoint(api_endpoint).set_project(project_id).set_key(api_key)
    databases = Databases(client)

    try:
        context.log("Fetching video interaction documents...")
        # Fetch documents, limit to 100 per run
        interaction_response = databases.list_documents(
            DATABASE_ID,
            VIDEO_INTERACTIONS_COLLECTION_ID,
            [Query.limit(100)]
        )
        interactions = interaction_response['documents']
        total_fetched = len(interactions)
        context.log(f"Fetched {total_fetched} interactions to process.")

        if total_fetched == 0:
            context.log("No interactions to process.")
            context.log("--- Likes Manager Batch Job End (No Work) ---")
            return context.res.json({"success": True, "message": "No interactions found."})

        processed_count = 0
        failed_count = 0

        # Process each interaction
        for interaction_doc in interactions:
            try:
                interaction_id = interaction_doc["$id"]
                context.log(f"Processing interaction {interaction_id}...")

                # Extract basic info
                video_id = interaction_doc.get('videoId')
                interaction_type = interaction_doc.get('type')
                
                if not video_id or interaction_type not in ['like', 'dislike']:
                    context.error(f"Missing videoId or invalid type ('{interaction_type}') in interaction doc {interaction_id}.")
                    failed_count += 1
                    continue

                # --- Identify User ID from Permissions ---
                user_id = None
                doc_permissions = interaction_doc.get('$permissions', [])
                
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
                    context.error(f"Could not determine user ID from permissions on interaction doc {interaction_id}. Permissions: {doc_permissions}")
                    failed_count += 1
                    continue

                context.log(f"Processing interaction by User ID: {user_id} for Video ID: {video_id}, Type: {interaction_type}")

                # --- Query Current User State ---
                current_state = 'neutral'
                state_doc_id = None # To store the ID if found, for update/delete
                try:
                    state_response = databases.list_documents(
                        DATABASE_ID,
                        USER_VIDEO_STATES_COLLECTION_ID,
                        [
                            Query.equal('userId', user_id),
                            Query.equal('videoId', video_id),
                            Query.limit(1)
                        ]
                    )
                    if state_response['total'] > 0:
                        state_doc = state_response['documents'][0]
                        current_state = state_doc.get('state')
                        state_doc_id = state_doc['$id']
                        context.log(f"Found existing state '{current_state}' for user {user_id}, video {video_id} (Doc ID: {state_doc_id})")
                    else:
                        context.log(f"No existing state found for user {user_id}, video {video_id}. Current state is 'neutral'.")
                except AppwriteException as e:
                    context.error(f"Error querying user_video_states for user {user_id}, video {video_id}: {e}. Assuming 'neutral'.")
                    # Decide if you should continue or skip this interaction
                    failed_count += 1
                    continue # Skip this interaction if state query fails

                # --- Calculate Count Changes and New State ---
                like_change = 0
                dislike_change = 0
                new_state = current_state # Start with the current state

                if interaction_type == 'like':
                    if current_state == 'liked': # Toggle off
                        new_state = 'neutral'
                        like_change = -1
                        context.log(f"Interaction {interaction_id} (like) toggles OFF existing 'liked' state. like_change={like_change}")
                    elif current_state == 'disliked': # Change from dislike to like
                        new_state = 'liked'
                        like_change = 1
                        dislike_change = -1 # Decrement dislike count
                        context.log(f"Interaction {interaction_id} (like) changes 'disliked' to 'liked'. like_change={like_change}, dislike_change={dislike_change}")
                    else: # current_state == 'neutral'
                        new_state = 'liked'
                        like_change = 1
                        context.log(f"Interaction {interaction_id} (like) sets 'neutral' to 'liked'. like_change={like_change}")

                elif interaction_type == 'dislike':
                    if current_state == 'disliked': # Toggle off
                        new_state = 'neutral'
                        dislike_change = -1
                        context.log(f"Interaction {interaction_id} (dislike) toggles OFF existing 'disliked' state. dislike_change={dislike_change}")
                    elif current_state == 'liked': # Change from like to dislike
                        new_state = 'disliked'
                        dislike_change = 1
                        like_change = -1 # Decrement like count
                        context.log(f"Interaction {interaction_id} (dislike) changes 'liked' to 'disliked'. dislike_change={dislike_change}, like_change={like_change}")
                    else: # current_state == 'neutral'
                        new_state = 'disliked'
                        dislike_change = 1
                        context.log(f"Interaction {interaction_id} (dislike) sets 'neutral' to 'disliked'. dislike_change={dislike_change}")
                else:
                    context.error(f"Unknown interaction type '{interaction_type}' for interaction {interaction_id}. Skipping.")
                    failed_count += 1
                    continue # Skip unknown types

                # --- Update video_counts ---
                if like_change != 0 or dislike_change != 0:
                    try:
                        # Fetch or initialize counts_doc
                        counts_doc = None
                        try:
                            counts_doc = databases.get_document(DATABASE_ID, VIDEO_COUNTS_COLLECTION_ID, video_id)
                            current_likes = counts_doc.get('likeCount', 0)
                            current_dislikes = counts_doc.get('dislikeCount', 0)
                            # Preserve comment info
                            current_comments_json = counts_doc.get('commentsJson', '[]')
                            current_comment_count = counts_doc.get('commentCount', 0)
                        except AppwriteException as e:
                            if e.code == 404:
                                current_likes = 0
                                current_dislikes = 0
                                current_comments_json = '[]'
                                current_comment_count = 0
                                context.log(f"Counts doc for {video_id} not found, initializing counts.")
                            else:
                                raise # Re-throw other DB errors during fetch

                        new_like_count = max(0, current_likes + like_change)
                        new_dislike_count = max(0, current_dislikes + dislike_change)

                        counts_update_data = {
                            'likeCount': new_like_count,
                            'dislikeCount': new_dislike_count
                        }

                        if counts_doc: # Update existing
                            databases.update_document(
                                database_id=DATABASE_ID, collection_id=VIDEO_COUNTS_COLLECTION_ID, document_id=video_id,
                                data=counts_update_data
                            )
                            context.log(f"Updated counts for video {video_id}: Likes={new_like_count}, Dislikes={new_dislike_count}")
                        else: # Create new
                            counts_create_data = {
                                **counts_update_data,
                                'commentsJson': current_comments_json,
                                'commentCount': current_comment_count
                            }
                            databases.create_document(
                                database_id=DATABASE_ID, collection_id=VIDEO_COUNTS_COLLECTION_ID, document_id=video_id,
                                data=counts_create_data,
                                permissions=[Permission.read(Role.any())]
                            )
                            context.log(f"Created counts document for video {video_id}: Likes={new_like_count}, Dislikes={new_dislike_count}")

                    except AppwriteException as e:
                        context.error(f"Failed to update/create counts for video {video_id} (Interaction: {interaction_id}): {e}. Skipping count update.")
                    except Exception as e:
                        context.error(f"Unexpected error updating/creating counts for video {video_id} (Interaction: {interaction_id}): {e}. Skipping count update.")
                else:
                    context.log(f"No count change needed for interaction {interaction_id}.")

                # --- Update user_video_states Collection ---
                try:
                    if new_state == 'neutral':
                        if state_doc_id: # Only delete if a document existed
                            context.log(f"New state is 'neutral', deleting state doc {state_doc_id}...")
                            databases.delete_document(DATABASE_ID, USER_VIDEO_STATES_COLLECTION_ID, state_doc_id)
                            context.log(f"Deleted state doc {state_doc_id}.")
                        else:
                             context.log("New state is 'neutral', no existing doc to delete.")
                    elif new_state == 'liked' or new_state == 'disliked':
                        state_data = {
                            'userId': user_id,
                            'videoId': video_id,
                            'state': new_state
                        }
                        # Define permissions for the state document - only the user can read/manage it
                        state_permissions = [
                            Permission.read(Role.user(user_id)),
                            Permission.update(Role.user(user_id)),
                            Permission.delete(Role.user(user_id))
                        ]

                        if state_doc_id: # Update existing document
                            context.log(f"Updating state doc {state_doc_id} to '{new_state}'...")
                            databases.update_document(
                                DATABASE_ID,
                                USER_VIDEO_STATES_COLLECTION_ID,
                                state_doc_id,
                                {'state': new_state} # Only update the state field
                            )
                            context.log(f"Updated state doc {state_doc_id}.")
                        else: # Create new document
                            context.log(f"Creating new state doc with state '{new_state}'...")
                            new_state_doc = databases.create_document(
                                DATABASE_ID,
                                USER_VIDEO_STATES_COLLECTION_ID,
                                ID.unique(), # Use unique ID
                                state_data,
                                state_permissions # Apply permissions on creation
                            )
                            context.log(f"Created new state doc {new_state_doc['$id']}.")
                    else:
                        context.log(f"Warning: Unexpected new_state '{new_state}' - no action taken on user_video_states.")
                    state_update_successful = True # Flag success
                except AppwriteException as e:
                    context.error(f"Failed to update user_video_states for user {user_id}, video {video_id}: {e}. Interaction {interaction_id} will NOT be deleted or cleaned up.")
                    failed_count += 1
                    state_update_successful = False # Flag failure
                    continue # Skip cleanup and deletion for this interaction

                # --- Fetch User's Account Document ---
                account_doc = None
                current_account_liked = []
                current_account_disliked = []
                try:
                    account_doc = databases.get_document(DATABASE_ID, ACCOUNTS_COLLECTION_ID, user_id)
                    current_account_liked = account_doc.get('videosLiked', []) or [] # Default to empty list if null/missing
                    current_account_disliked = account_doc.get('videosDisliked', []) or []
                    context.log(f"Fetched account doc {user_id}. Current array sizes: Liked({len(current_account_liked)}), Disliked({len(current_account_disliked)})")
                except AppwriteException as e:
                    if e.code == 404:
                         context.log(f"Account doc {user_id} not found. Cannot clean up arrays, but proceeding with counts/state.")
                         # account_doc remains None, cleanup will be skipped later
                    else:
                         context.error(f"Error fetching account doc {user_id}: {e}. Skipping interaction {interaction_id}.")
                         failed_count += 1
                         continue # Skip this interaction if we can't fetch the account doc (other than 404)

                # --- Cleanup Account Arrays (Only if state update was successful) ---
                if state_update_successful and account_doc: # Check if account_doc was fetched successfully
                    try:
                        # Remove the video_id from both lists, regardless of interaction type
                        needs_update = False
                        cleaned_liked = [vid for vid in current_account_liked if vid != video_id]
                        cleaned_disliked = [vid for vid in current_account_disliked if vid != video_id]

                        if len(cleaned_liked) != len(current_account_liked) or len(cleaned_disliked) != len(current_account_disliked):
                            needs_update = True
                            context.log(f"Video ID {video_id} found in account arrays, preparing cleanup.")
                        else:
                            context.log(f"Video ID {video_id} not found in account arrays, no cleanup needed.")

                        if needs_update:
                            databases.update_document(
                                database_id=DATABASE_ID,
                                collection_id=ACCOUNTS_COLLECTION_ID,
                                document_id=user_id,
                                data={
                                    'videosLiked': cleaned_liked,
                                    'videosDisliked': cleaned_disliked
                                }
                            )
                            context.log(f"Cleaned up account arrays for user {user_id}, video {video_id}.")
                        cleanup_successful = True # Flag success
                    except AppwriteException as e:
                         context.error(f"Failed to clean up account arrays for user {user_id}, video {video_id}: {e}. Interaction {interaction_id} will NOT be deleted.")
                         failed_count += 1
                         cleanup_successful = False # Flag failure
                         continue # Skip interaction deletion if cleanup fails
                elif not account_doc:
                     context.log(f"Skipping account array cleanup for interaction {interaction_id} as account doc was not found.")
                     cleanup_successful = True # Consider it "successful" for flow control as there was nothing to clean
                else:
                    # This branch is entered if state_update_successful was false
                    cleanup_successful = False

                # --- Delete Interaction (Only if state update AND cleanup were successful) ---
                if state_update_successful and cleanup_successful:
                    try:
                        databases.delete_document(
                            DATABASE_ID,
                            VIDEO_INTERACTIONS_COLLECTION_ID,
                            interaction_id
                        )
                        context.log(f"Deleted interaction {interaction_id}.")
                        processed_count += 1
                    except AppwriteException as e:
                        context.error(f"Failed to delete interaction {interaction_id} after processing: {e}.")
                        failed_count += 1
                else:
                    context.log(f"Skipping deletion of interaction {interaction_id} due to prior failure.")

            except Exception as e:
                context.error(f"Unexpected error processing interaction: {e}")
                import traceback
                context.error(traceback.format_exc())
                failed_count += 1

        # --- Summary ---
        summary = {
            "success": True,
            "processed": processed_count,
            "failed": failed_count,
            "total": total_fetched
        }
        context.log(f"Processing complete: {processed_count} processed, {failed_count} failed.")
        context.log("--- Likes Manager Batch Job End (Success) ---")
        return context.res.json(summary)

    except AppwriteException as e:
        context.error(f"Appwrite Error during processing: {e.message} (Code: {e.code})")
        context.log("--- Likes Manager Batch Job End (Appwrite Error) ---")
        return context.res.json({
            "success": False, 
            "message": f"Appwrite Error: {e.message}", 
            "code": e.code
        }, 500)
    except Exception as e:
        context.error(f"Unexpected Error: {e}")
        import traceback
        context.error(traceback.format_exc())
        context.log("--- Likes Manager Batch Job End (Unexpected Error) ---")
        return context.res.json({
            "success": False,
            "message": f"Unexpected Server Error: {str(e)}"
        }, 500)
