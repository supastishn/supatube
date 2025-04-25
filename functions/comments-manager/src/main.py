import os
import json
import uuid
from datetime import datetime, timezone
from appwrite.client import Client
from appwrite.services.databases import Databases
from appwrite.exception import AppwriteException
from appwrite.permission import Permission
from appwrite.role import Role

# Configuration Constants
DATABASE_ID = "database"
ACCOUNTS_COLLECTION_ID = "accounts"
VIDEO_COUNTS_COLLECTION_ID = "video_counts"
MAX_COMMENT_LENGTH = 2000
# Consider a limit for JSON size check later
# MAX_JSON_SIZE_BYTES = 9 * 1024 * 1024 # Example: 9MB

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

# Helper function to find and add a reply recursively
def add_reply(comments, parent_id, new_reply):
    for comment in comments:
        if comment.get('commentId') == parent_id:
            comment.setdefault('replies', []).insert(0, new_reply) # Insert at beginning
            return True
        if 'replies' in comment and add_reply(comment['replies'], parent_id, new_reply):
            return True
    return False

def main(context):
    context.log("--- Comments Manager Invocation Start ---")

    # Environment & Auth Check (similar to other functions)
    api_endpoint = os.environ.get("APPWRITE_FUNCTION_API_ENDPOINT")
    project_id = os.environ.get("APPWRITE_FUNCTION_PROJECT_ID")
    api_key = context.req.headers.get('x-appwrite-key')
    user_id = context.req.headers.get('x-appwrite-user-id')

    if not all([api_endpoint, project_id, api_key]):
         return context.res.json({"success": "false", "message": "Function config error."}, 500)
    if not user_id:
         return context.res.json({"success": "false", "message": "Authentication required."}, 401)
    context.log(f"Authenticated User ID: {user_id}")

    # Input Parsing & Validation
    video_id = None
    comment_text = None
    parent_comment_id = None
    try:
        payload = json.loads(context.req.body_raw)
        context.log(f"Parsed Payload: {payload}")
        video_id = payload.get('videoId')
        comment_text = payload.get('commentText', '').strip() # Trim whitespace
        parent_comment_id = payload.get('parentCommentId') # Optional

        if not video_id or not comment_text:
            raise ValueError("Missing 'videoId' or 'commentText'.")
        if len(comment_text) > MAX_COMMENT_LENGTH:
            raise ValueError(f"Comment exceeds maximum length of {MAX_COMMENT_LENGTH} characters.")
        context.log(f"Video ID: {video_id}, Parent ID: {parent_comment_id}, Text: '{comment_text[:50]}...'")

        # 3. Validate Parent ID (Ensure it's a top-level comment) - This will be checked later after loading comments_list
        has_parent_comment_id = bool(parent_comment_id)

    except Exception as e:
        return context.res.json({"success": "false", "message": f"Invalid request: {e}"}, 400)

    # Initialize Appwrite Client
    client = Client().set_endpoint(api_endpoint).set_project(project_id).set_key(api_key)
    databases = Databases(client)

    try:
        # 1. Fetch User Details (Name, Avatar)
        user_name = "User"
        user_avatar_url = None
        try:
            account_doc = databases.get_document(DATABASE_ID, ACCOUNTS_COLLECTION_ID, user_id)
            user_name = account_doc.get('name') or user_name
            user_avatar_url = account_doc.get('profileImageUrl') # Can be None
            context.log(f"Fetched user details: Name='{user_name}', Avatar URL='{user_avatar_url}'")
        except AppwriteException as e:
            if e.code == 404:
                context.log(f"Account details not found for user {user_id}, using defaults.")
            else:
                context.log(f"Warning: Could not fetch account details for {user_id}: {e}")

        # 2. Fetch/Initialize Video Counts Document (includes comments)
        comments_list = []
        current_comment_count = 0
        current_like_count = 0      # Needed for create document
        current_dislike_count = 0   # Needed for create document
        create_counts_doc = False
        counts_doc = None
        
        # Now validate parent comment ID if one was provided
        if has_parent_comment_id:
            is_top_level_parent = False
            # This check will happen after loading comments_list
        
        try:
            context.log(f"Fetching video_counts document for video {video_id}...")
            counts_doc = databases.get_document(DATABASE_ID, VIDEO_COUNTS_COLLECTION_ID, video_id)
            comments_json_string = counts_doc.get('commentsJson') or '[]'
            current_comment_count = counts_doc.get('commentCount', 0)
            # Preserve existing like/dislike counts when updating
            current_like_count = counts_doc.get('likeCount', 0)
            current_dislike_count = counts_doc.get('dislikeCount', 0)

            # Explicitly handle potential None values returned by .get() if attribute exists but is null
            current_comment_count = current_comment_count if isinstance(current_comment_count, int) else 0
            current_like_count = current_like_count if isinstance(current_like_count, int) else 0
            current_dislike_count = current_dislike_count if isinstance(current_dislike_count, int) else 0

            try:
                comments_list = json.loads(comments_json_string)
                if not isinstance(comments_list, list):
                    context.log("Warning: commentsJson was not a list, resetting to empty.")
                    comments_list = []
                context.log(f"Parsed {len(comments_list)} existing comments. Current count: {current_comment_count}")
                
                # Now that comments_list is loaded, validate parent_comment_id if needed
                if has_parent_comment_id:
                    is_top_level_parent = False
                    for top_comment in comments_list:
                        if top_comment.get('commentId') == parent_comment_id:
                            is_top_level_parent = True
                            break # Found the top-level parent

                    if not is_top_level_parent:
                        context.log(f"Error: Attempt to reply to a non-top-level comment or invalid parent ID: {parent_comment_id}")
                        return context.res.json({"success": "false", "message": "Replying to replies is not allowed."}, 400)
                    context.log(f"Parent ID {parent_comment_id} confirmed as top-level.")
            except json.JSONDecodeError:
                context.log("Warning: Failed to parse commentsJson, resetting to empty.")
                comments_list = []
                
                # If we had a parent_comment_id but couldn't load comments, it can't be valid
                if has_parent_comment_id:
                    context.log(f"Error: Can't validate parent comment ID {parent_comment_id} with empty comments list")
                    return context.res.json({"success": "false", "message": "Invalid parent comment ID."}, 400)
        except AppwriteException as e:
            if e.code == 404:
                context.log(f"No video_counts document found for {video_id}. Will create.")
                create_counts_doc = True
                comments_list = []
                current_comment_count = 0
                current_like_count = 0 # Initialize counts for creation
                current_dislike_count = 0
            else:
                # Rethrow other DB errors as we can't proceed
                raise Exception(f"Error fetching video counts doc: {e.message}")

        # 3. Create New Comment Object (Same as before)
        comment_id = str(uuid.uuid4())
        timestamp_iso = datetime.now(timezone.utc).isoformat()
        new_comment = {
            "commentId": comment_id,
            "userId": user_id,
            "userName": user_name,
            "userAvatarUrl": user_avatar_url,
            "commentText": comment_text,
            "timestamp": timestamp_iso,
            "replies": []
        }
        context.log(f"Created new comment object with ID: {comment_id}")

        # 4. Add Comment/Reply to the list (Same as before)
        reply_added = False
        if parent_comment_id:
            context.log(f"Attempting to add reply to parent: {parent_comment_id}")
            reply_added = add_reply(comments_list, parent_comment_id, new_comment)
            if not reply_added:
                 context.log(f"Warning: Parent comment {parent_comment_id} not found. Adding as top-level comment.")
                 comments_list.insert(0, new_comment) # Add as top-level if parent not found
            else:
                context.log("Reply added successfully to parent.")
        else:
            comments_list.insert(0, new_comment) # Insert new top-level comments at the beginning
            context.log("Added new top-level comment.")

        # 5. Calculate New Comment Count and Serialize JSON
        new_comment_count = current_comment_count + 1 # Increment count
        updated_comments_json = json.dumps(comments_list)

        # Optional: Add JSON size check here if needed

        # 6. Prepare Data and Update/Create Document
        update_data = {
            "commentsJson": updated_comments_json,
            "commentCount": new_comment_count,
            # Preserve existing like/dislike counts
            "likeCount": current_like_count,
            "dislikeCount": current_dislike_count
        }

        if create_counts_doc:
            context.log(f"Creating video_counts document for {video_id}...")
            databases.create_document(
                database_id=DATABASE_ID,
                collection_id=VIDEO_COUNTS_COLLECTION_ID,
                document_id=video_id,
                data=update_data, # includes all counts initialized
                permissions=[Permission.read(Role.any())]
            )
            context.log("Created video_counts document.")
        else:
            context.log(f"Updating video_counts document for {video_id}...")
            # Only send fields being updated to avoid overwriting potentially concurrent like/dislike updates
            minimal_update_data = {
                 "commentsJson": updated_comments_json,
                 "commentCount": new_comment_count
            }
            databases.update_document(
                database_id=DATABASE_ID,
                collection_id=VIDEO_COUNTS_COLLECTION_ID,
                document_id=video_id,
                data=minimal_update_data
            )
            context.log("Updated video_counts document.")

        # --- Success ---
        context.log(f"Successfully processed comment {comment_id}.")
        context.log("--- Comments Manager Invocation End (Success) ---")
        # Return the comment object that was just added
        return context.res.json({"success": "true", "comment": new_comment})

    except Exception as e:
        context.error(f"Error processing comment: {e}")
        # --- Error ---
        context.log("--- Comments Manager Invocation End (Error) ---")
        return context.res.json({"success": "false", "message": f"Server error: {e}"}, 500)
