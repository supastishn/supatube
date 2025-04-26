import os
import json
import uuid
from datetime import datetime, timezone
from appwrite.client import Client
from appwrite.services.databases import Databases
from appwrite.query import Query
from appwrite.exception import AppwriteException
from appwrite.permission import Permission
from appwrite.role import Role

# Configuration Constants
DATABASE_ID = "database"
ACCOUNTS_COLLECTION_ID = "accounts"
VIDEO_COUNTS_COLLECTION_ID = "video_counts"
COMMENTS_INTERACTIONS_COLLECTION_ID = "comments-interactions"
MAX_COMMENT_LENGTH = 2000

# --- NEW: Helper function to recursively delete a comment and its replies ---
def delete_comment_recursive(comments_list, comment_id_to_delete, requesting_user_id, context):
    """
    Finds and removes a comment and its replies from a list.
    Returns: A tuple (list_modified, deleted_count)
             list_modified: Boolean indicating if the list was changed.
             deleted_count: Integer count of the comment + its replies removed.
    """
    initial_length = len(comments_list)
    
    item_to_remove = None
    for i, comment in enumerate(comments_list):
        comment_owner_id = comment.get('userId')
        
        if comment.get('commentId') == comment_id_to_delete:
            # --- Authorization Check ---
            if comment_owner_id != requesting_user_id:
                context.error(f"Authorization failed: User {requesting_user_id} cannot delete comment {comment_id_to_delete} owned by {comment_owner_id}.")
                return False, 0 # Indicate no modification, 0 deleted
            
            # Found the comment to delete
            item_to_remove = comment
            del comments_list[i]
            
            # Count the deleted comment + its replies
            replies_count = len(item_to_remove.get('replies', []))
            deleted_count = 1 + replies_count
            context.log(f"Marked comment {comment_id_to_delete} for deletion (owner: {comment_owner_id}). Deleted count: {deleted_count}")
            return True, deleted_count # List modified, return count

        # Recursively search in replies if it's a list
        replies = comment.get('replies', [])
        if isinstance(replies, list) and replies:
            modified, count = delete_comment_recursive(replies, comment_id_to_delete, requesting_user_id, context)
            if modified:
                # If a reply was deleted, update the parent comment's replies list
                comment['replies'] = replies # Not strictly necessary if list is modified in-place, but good practice
                return True, count # Bubble up the result

    return False, 0 # Not found in this list or its children


# Helper function to find and add a reply recursively
def add_reply(comments, parent_id, new_reply):
    for comment in comments:
        if comment.get('commentId') == parent_id:
            # Ensure 'replies' key exists and is a list
            if 'replies' not in comment or not isinstance(comment.get('replies'), list):
                comment['replies'] = []
            comment['replies'].insert(0, new_reply) # Insert new replies at the beginning
            return True
        # Recursively search in existing replies
        if isinstance(comment.get('replies'), list) and add_reply(comment['replies'], parent_id, new_reply):
            return True
    return False

def main(context):
    context.log("--- Comments Manager Batch Job Start ---")

    # --- Environment Variable Check ---
    api_endpoint = os.environ.get("APPWRITE_FUNCTION_API_ENDPOINT")
    project_id = os.environ.get("APPWRITE_FUNCTION_PROJECT_ID")
    # API key comes from header instead of environment variable
    api_key = context.req.headers.get('x-appwrite-key')

    if not all([api_endpoint, project_id]) or not api_key:
        message = "Function configuration error: Missing endpoint, project ID in env, or x-appwrite-key header."
        context.error(message)
        return context.res.json({"success": False, "message": message}, 500)

    # --- Initialize Appwrite Client ---
    client = Client()
    client.set_endpoint(api_endpoint).set_project(project_id).set_key(api_key)
    databases = Databases(client)

    try:
        context.log("Fetching comment interaction documents...")
        # Fetch documents, limit to 100 per run for performance
        interaction_response = databases.list_documents(
            DATABASE_ID,
            COMMENTS_INTERACTIONS_COLLECTION_ID,
            [Query.limit(100)]
        )
        interactions = interaction_response.get('documents', [])
        total_fetched = len(interactions)
        context.log(f"Fetched {total_fetched} comment interactions to process.")

        if total_fetched == 0:
            context.log("No comment interactions to process.")
            context.log("--- Comments Manager Batch Job End (No Work) ---")
            return context.res.json({"success": True, "message": "No comment interactions found."})

        processed_count = 0
        failed_count = 0

        # --- Process each interaction ---
        for interaction_doc in interactions:
            try:
                interaction_id = interaction_doc["$id"]
                context.log(f"Processing interaction {interaction_id}...")

                # --- Extract Common Data ---
                video_id = interaction_doc.get('videoId')
                interaction_type = interaction_doc.get('type', 'create') # Default to 'create' if missing

                if not video_id:
                    context.error(f"Missing videoId in interaction {interaction_id}. Skipping.")
                    failed_count += 1
                    continue

                # --- Identify User ID from Permissions ---
                user_id = None
                doc_permissions = interaction_doc.get('$permissions', [])
                
                # Look for update permission to determine the creator
                update_permission_prefix = 'update("user:'
                for perm in doc_permissions:
                    if perm.startswith(update_permission_prefix):
                        start_index = len(update_permission_prefix)
                        end_index = perm.find('")', start_index)
                        if end_index != -1:
                            user_id = perm[start_index:end_index]
                            break # Found the user ID

                if not user_id:
                    context.error(f"Could not determine user ID from permissions on interaction doc {interaction_id}.")
                    failed_count += 1
                    continue

                context.log(f"Processing comment by User ID: {user_id} for Video ID: {video_id}")

                # --- Fetch User Details ---
                user_name = "User"
                user_avatar_url = None
                try:
                    account_doc = databases.get_document(DATABASE_ID, ACCOUNTS_COLLECTION_ID, user_id)
                    user_name = account_doc.get('name') or user_name
                    user_avatar_url = account_doc.get('profileImageUrl')
                except AppwriteException as e:
                    if e.code == 404:
                        context.log(f"Account details not found for user {user_id}, using default name.")
                    else:
                        context.log(f"Warning: Error fetching account details for {user_id}: {e}. Using default name.")

                # --- Fetch/Initialize Video Counts Document ---
                comments_list = []
                current_comment_count = 0
                current_like_count = 0
                current_dislike_count = 0
                create_counts_doc = False
                
                # Check if parent comment is valid if one was provided
                has_parent_comment_id = bool(parent_comment_id)
                is_top_level_parent = False
                
                try:
                    context.log(f"Fetching video_counts document for video {video_id}...")
                    counts_doc = databases.get_document(DATABASE_ID, VIDEO_COUNTS_COLLECTION_ID, video_id)
                    comments_json_string = counts_doc.get('commentsJson') or '[]'
                    current_comment_count = counts_doc.get('commentCount', 0) or 0
                    current_like_count = counts_doc.get('likeCount', 0) or 0
                    current_dislike_count = counts_doc.get('dislikeCount', 0) or 0

                    try:
                        comments_list = json.loads(comments_json_string)
                        if not isinstance(comments_list, list):
                            context.log(f"Warning: commentsJson for video {video_id} is not a list. Resetting to empty.")
                            comments_list = []
                        
                        # Validate parent comment ID if needed
                        if has_parent_comment_id:
                            # Check if it exists as a top-level comment
                            for top_comment in comments_list:
                                if top_comment.get('commentId') == parent_comment_id:
                                    is_top_level_parent = True
                                    break
                            
                            if not is_top_level_parent:
                                context.log(f"Error: Parent comment ID {parent_comment_id} not found or not top-level.")
                                # Handle as a top-level comment instead
                                parent_comment_id = None
                                has_parent_comment_id = False
                    except json.JSONDecodeError:
                        context.log(f"Warning: Failed to parse commentsJson for video {video_id}. Resetting to empty.")
                        comments_list = []
                        # Reset parent comment reference if JSON is invalid
                        parent_comment_id = None
                        has_parent_comment_id = False
                        
                except AppwriteException as e:
                    if e.code == 404:
                        context.log(f"No video_counts document found for {video_id}. Will create.")
                        create_counts_doc = True
                        comments_list = []
                        current_comment_count = 0
                        current_like_count = 0
                        current_dislike_count = 0
                        # Cannot have a parent comment if there's no document
                        parent_comment_id = None
                        has_parent_comment_id = False
                    else:
                        raise Exception(f"Error fetching video_counts doc for {video_id}: {e}")

                # --- Create New Comment Object ---
                comment_id = str(uuid.uuid4())
                timestamp_iso = datetime.now(timezone.utc).isoformat()
                new_comment = {
                    "commentId": comment_id,
                    "userId": user_id,
                    "userName": user_name,
                    "userAvatarUrl": user_avatar_url,
                    "commentText": comment_text,
                    "timestamp": timestamp_iso,
                    "temporaryClientId": temporary_client_id,
                    "replies": []
                }
                context.log(f"Created new comment object with ID: {comment_id}")

                # --- Add Comment to the List ---
                reply_added = False
                if has_parent_comment_id:
                    context.log(f"Attempting to add reply to parent: {parent_comment_id}")
                    reply_added = add_reply(comments_list, parent_comment_id, new_comment)
                    if not reply_added:
                        context.log(f"Warning: Parent comment {parent_comment_id} not found. Adding as top-level comment.")
                        comments_list.insert(0, new_comment)
                    else:
                        context.log("Reply added successfully to parent.")
                else:
                    comments_list.insert(0, new_comment) # Insert at beginning
                    context.log("Added new top-level comment.")

                # --- Update Video Counts Document ---
                new_comment_count = current_comment_count + 1
                updated_comments_json = json.dumps(comments_list)
                
                update_data = {
                    "commentsJson": updated_comments_json,
                    "commentCount": new_comment_count,
                    "likeCount": current_like_count,
                    "dislikeCount": current_dislike_count
                }

                if create_counts_doc:
                    context.log(f"Creating video_counts document for {video_id}...")
                    databases.create_document(
                        database_id=DATABASE_ID,
                        collection_id=VIDEO_COUNTS_COLLECTION_ID,
                        document_id=video_id,
                        data=update_data,
                        permissions=[Permission.read(Role.any())]
                    )
                    context.log(f"Created video_counts document for {video_id}.")
                else:
                    context.log(f"Updating video_counts document for {video_id}...")
                    databases.update_document(
                        database_id=DATABASE_ID,
                        collection_id=VIDEO_COUNTS_COLLECTION_ID,
                        document_id=video_id,
                        data={
                            "commentsJson": updated_comments_json,
                            "commentCount": new_comment_count
                        }
                    )
                    context.log(f"Updated video_counts document for {video_id}.")
            
            elif interaction_type == 'delete':
                    # --- DELETE LOGIC ---
                    context.log(f"Processing DELETE interaction {interaction_id}")
                    
                    comment_id_to_delete = interaction_doc.get('commentIdToDelete')

                    if not comment_id_to_delete:
                        context.error(f"Missing commentIdToDelete in DELETE interaction {interaction_id}. Skipping.")
                        failed_count += 1
                        continue
                    
                    # --- Fetch Video Counts Document ---
                    comments_list = []
                    current_comment_count = 0
                    
                    try:
                        counts_doc = databases.get_document(DATABASE_ID, VIDEO_COUNTS_COLLECTION_ID, video_id)
                        comments_json_string = counts_doc.get('commentsJson') or '[]'
                        current_comment_count = counts_doc.get('commentCount', 0) or 0

                        try:
                            comments_list = json.loads(comments_json_string)
                            if not isinstance(comments_list, list):
                                context.log(f"Warning: commentsJson for video {video_id} is not a list during delete. Skipping.")
                                failed_count += 1
                                continue
                        except json.JSONDecodeError:
                            context.log(f"Warning: Failed to parse commentsJson for video {video_id} during delete. Skipping.")
                            failed_count += 1
                            continue
                            
                    except AppwriteException as e:
                        if e.code == 404:
                            context.log(f"No video_counts document found for {video_id} during delete. Cannot delete comment {comment_id_to_delete}. Skipping.")
                            failed_count += 1
                            continue
                        else:
                            context.error(f"Error fetching video_counts doc for {video_id} during delete: {e}. Skipping.")
                            failed_count += 1
                            continue
                            
                    # --- Find and Remove Comment (with Auth Check) ---
                    modified, deleted_count = delete_comment_recursive(comments_list, comment_id_to_delete, user_id, context)

                    if not modified:
                        context.log(f"Comment {comment_id_to_delete} not found or user {user_id} not authorized. Skipping update for interaction {interaction_id}.")
                        # Don't increment failed_count here, could be legitimate (already deleted) or auth failure
                    else:
                        # --- Update Video Counts Document ---
                        new_comment_count = max(0, current_comment_count - deleted_count)
                        updated_comments_json = json.dumps(comments_list)
                        
                        context.log(f"Updating video_counts document for {video_id} after deletion...")
                        databases.update_document(
                            database_id=DATABASE_ID,
                            collection_id=VIDEO_COUNTS_COLLECTION_ID,
                            document_id=video_id,
                            data={ # Only update comment fields
                                "commentsJson": updated_comments_json,
                                "commentCount": new_comment_count
                            }
                        )
                        context.log(f"Updated video_counts document for {video_id}. New count: {new_comment_count}")
                
        else:
            context.error(f"Unknown interaction type '{interaction_type}' for interaction {interaction_id}. Skipping.")
            failed_count += 1
            continue
                    
            # --- Delete Interaction Document (Common for successful create/delete) ---
            context.log(f"Deleting interaction document {interaction_id}...")
            databases.delete_document(
                DATABASE_ID,
                COMMENTS_INTERACTIONS_COLLECTION_ID,
                interaction_id
            )
            context.log(f"Deleted interaction document {interaction_id}.")
            
            processed_count += 1

            except Exception as e:
                context.error(f"Error processing interaction {interaction_doc.get('$id', 'unknown')}: {e}")
                failed_count += 1

        # --- Summary ---
        context.log(f"Processed {processed_count} comment interactions, {failed_count} failed.")
        context.log("--- Comments Manager Batch Job End (Success) ---")
        return context.res.json({
            "success": True,
            "processed": processed_count, 
            "failed": failed_count,
            "total": total_fetched
        })

    except Exception as e:
        context.error(f"Unexpected error in Comments Manager: {e}")
        context.log("--- Comments Manager Batch Job End (Error) ---")
        return context.res.json({"success": False, "message": str(e)}, 500)
