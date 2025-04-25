from appwrite.client import Client
from appwrite.services.databases import Databases
from appwrite.exception import AppwriteException
from appwrite.permission import Permission
from appwrite.role import Role
from appwrite.query import Query
import os
import json

# Configuration Constants
DATABASE_ID = "database"
ACCOUNTS_COLLECTION_ID = "accounts"
VIDEO_COUNTS_COLLECTION_ID = "video_counts"
VIDEO_INTERACTIONS_COLLECTION_ID = "video_interactions"

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
        interactions = interaction_response.documents
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

                # --- Fetch User Account ---
                try:
                    account_doc = databases.get_document(DATABASE_ID, ACCOUNTS_COLLECTION_ID, user_id)
                    liked_set = set(account_doc.get('videosLiked', []) or [])
                    disliked_set = set(account_doc.get('videosDisliked', []) or [])
                    context.log(f"Fetched account for user {user_id}. Current likes: {len(liked_set)}, dislikes: {len(disliked_set)}")
                except AppwriteException as e:
                    if e.code == 404:
                        context.error(f"Account document {user_id} not found for interaction {interaction_id}. Skipping.")
                    else:
                        context.error(f"Error fetching account doc {user_id} for interaction {interaction_id}: {e}. Skipping.")
                    failed_count += 1
                    continue # Skip this interaction

                # --- Initialize Changes ---
                like_change = 0
                dislike_change = 0
                update_user_account = False

                # --- Reconciliation Logic ---
                video_is_liked_in_account = video_id in liked_set
                video_is_disliked_in_account = video_id in disliked_set

                if interaction_type == 'like':
                    if video_is_liked_in_account: # Interaction matches current user state
                        like_change = 1
                        liked_set.discard(video_id) # Consume the state from user doc
                        update_user_account = True
                        context.log(f"Interaction {interaction_id} (like) matches user state. like_change=1, removing from user doc.")
                    else: # Interaction is stale (user unliked or disliked later)
                        like_change = -1
                        context.log(f"Interaction {interaction_id} (like) is stale. like_change=-1.")
                        # Do not modify user account

                elif interaction_type == 'dislike':
                    if video_is_disliked_in_account: # Interaction matches current user state
                        dislike_change = 1
                        disliked_set.discard(video_id) # Consume the state from user doc
                        update_user_account = True
                        context.log(f"Interaction {interaction_id} (dislike) matches user state. dislike_change=1, removing from user doc.")
                    else: # Interaction is stale (user undisliked or liked later)
                        dislike_change = -1
                        context.log(f"Interaction {interaction_id} (dislike) is stale. dislike_change=-1.")
                        # Do not modify user account
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

                # --- Update User Account (if needed) ---
                if update_user_account:
                    try:
                        user_update_data = {
                            'videosLiked': list(liked_set),
                            'videosDisliked': list(disliked_set)
                        }
                        databases.update_document(DATABASE_ID, ACCOUNTS_COLLECTION_ID, user_id, user_update_data)
                        context.log(f"Updated account doc {user_id} after interaction {interaction_id}.")
                    except AppwriteException as e:
                        context.error(f"Failed to update account {user_id} after interaction {interaction_id}: {e}. Counts may have been updated, but interaction won't be deleted.")
                        failed_count += 1
                        continue # Skip deletion if user update fails

                # --- Delete Interaction ---
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
