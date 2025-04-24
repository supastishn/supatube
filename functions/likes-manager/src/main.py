from appwrite.client import Client
from appwrite.services.databases import Databases
from appwrite.exception import AppwriteException
from appwrite.query import Query
from appwrite.permission import Permission
from appwrite.role import Role
import os
import json

DATABASE_ID = os.environ.get("APPWRITE_DATABASE_ID", "database")
VIDEOS_COLLECTION_ID = os.environ.get("APPWRITE_VIDEOS_COLLECTION_ID", "videos")
LIKES_COLLECTION_ID = os.environ.get("APPWRITE_LIKES_COLLECTION_ID", "likes")

# This is executed when the function is triggered
def main(context):
    # Ensure environment variables are set
    api_endpoint = os.environ.get("APPWRITE_FUNCTION_API_ENDPOINT")
    project_id = os.environ.get("APPWRITE_FUNCTION_PROJECT_ID")
    api_key = context.req.headers.get('x-appwrite-key')

    if not all([api_endpoint, project_id, api_key]):
        context.error("Missing required environment variables (ENDPOINT, PROJECT_ID, API_KEY).")
        return context.res.status(500).json({"success": False, "message": "Function configuration error."})

    # Check for User ID (should be present if execute permission is 'users')
    user_id = context.req.headers.get('x-appwrite-user-id')
    if not user_id:
        context.error("User not authenticated.")
        return context.res.status(401).json({"success": False, "message": "Authentication required."})

    # Parse request body
    try:
        payload = json.loads(context.req.body)
        video_id = payload.get('videoId')
        action = payload.get('action') # 'like' or 'dislike'

        if not video_id or action not in ['like', 'dislike']:
            raise ValueError("Missing 'videoId' or invalid 'action' in request body.")
    except Exception as e:
        context.error(f"Invalid request payload: {e}")
        return context.res.status(400).json({"success": False, "message": f"Invalid request: {e}"})

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
        # 1. Find existing like/dislike by the user for this video
        existing_like_doc = None
        try:
            response = databases.list_documents(
                database_id=DATABASE_ID,
                collection_id=LIKES_COLLECTION_ID,
                queries=[
                    Query.equal("userId", user_id),
                    Query.equal("videoId", video_id),
                    Query.limit(1)
                ]
            )
            if response['total'] > 0:
                existing_like_doc = response['documents'][0]
        except AppwriteException as e:
            # Ignore 404 if collection doesn't exist yet during initial setup
            if e.code != 404:
                context.error(f"Error querying likes collection: {e}")
                raise Exception(f"Database error checking like status: {e.message}")


        # 2. Determine changes based on action and current state
        if action == 'like':
            if existing_like_doc is None:
                # Create new 'like'
                like_change = 1
                new_status = 'liked'
            elif existing_like_doc['type'] == 'dislike':
                # Change 'dislike' to 'like'
                like_change = 1
                dislike_change = -1
                new_status = 'liked'
            else: # type == 'like'
                # Remove 'like' (toggle off)
                like_change = -1
                new_status = None
        else: # action == 'dislike'
            if existing_like_doc is None:
                # Create new 'dislike'
                dislike_change = 1
                new_status = 'disliked'
            elif existing_like_doc['type'] == 'like':
                # Change 'like' to 'dislike'
                like_change = -1
                dislike_change = 1
                new_status = 'disliked'
            else: # type == 'dislike'
                # Remove 'dislike' (toggle off)
                dislike_change = -1
                new_status = None

        # 3. Apply changes to the 'likes' collection
        if new_status == 'liked':
            if existing_like_doc and existing_like_doc['type'] == 'dislike':
                 # Update existing dislike to like
                 databases.update_document(
                    database_id=DATABASE_ID,
                    collection_id=LIKES_COLLECTION_ID,
                    document_id=existing_like_doc['$id'],
                    data={'type': 'like'}
                 )
            elif existing_like_doc is None:
                 # Create new like document
                 databases.create_document(
                    database_id=DATABASE_ID,
                    collection_id=LIKES_COLLECTION_ID,
                    document_id='unique()', # Let Appwrite generate ID
                    data={'userId': user_id, 'videoId': video_id, 'type': 'like'},
                    permissions=[
                        Permission.read(Role.user(user_id)),
                        Permission.update(Role.user(user_id)),
                        Permission.delete(Role.user(user_id))
                    ]
                 )
        elif new_status == 'disliked':
            if existing_like_doc and existing_like_doc['type'] == 'like':
                 # Update existing like to dislike
                 databases.update_document(
                    database_id=DATABASE_ID,
                    collection_id=LIKES_COLLECTION_ID,
                    document_id=existing_like_doc['$id'],
                    data={'type': 'dislike'}
                 )
            elif existing_like_doc is None:
                 # Create new dislike document
                 databases.create_document(
                    database_id=DATABASE_ID,
                    collection_id=LIKES_COLLECTION_ID,
                    document_id='unique()',
                    data={'userId': user_id, 'videoId': video_id, 'type': 'dislike'},
                     permissions=[
                        Permission.read(Role.user(user_id)),
                        Permission.update(Role.user(user_id)),
                        Permission.delete(Role.user(user_id))
                    ]
                 )
        elif new_status is None and existing_like_doc:
            # Delete existing like/dislike document
            databases.delete_document(
                database_id=DATABASE_ID,
                collection_id=LIKES_COLLECTION_ID,
                document_id=existing_like_doc['$id']
            )

        # 4. Update counts on the 'videos' collection if there were changes
        if like_change != 0 or dislike_change != 0:
            try:
                 # Fetch the current video doc to get current counts (necessary if not using atomic increment)
                 # NOTE: Appwrite Python SDK might not have atomic increment directly in update_document payload yet.
                 # This read-modify-write approach has a small chance of race conditions under heavy load.
                 # If atomic operations become available, use them.

                 video_doc = databases.get_document(DATABASE_ID, VIDEOS_COLLECTION_ID, video_id)
                 
                 # Get values, might be None
                 current_likes = video_doc.get('likeCount') 
                 current_dislikes = video_doc.get('dislikeCount')
                 
                 # Default to 0 if None or missing
                 current_likes = current_likes if current_likes is not None else 0
                 current_dislikes = current_dislikes if current_dislikes is not None else 0

                 new_like_count = max(0, current_likes + like_change)
                 new_dislike_count = max(0, current_dislikes + dislike_change)

                 databases.update_document(
                    database_id=DATABASE_ID,
                    collection_id=VIDEOS_COLLECTION_ID,
                    document_id=video_id,
                    data={
                        'likeCount': new_like_count,
                        'dislikeCount': new_dislike_count
                    }
                 )
            except AppwriteException as e:
                 # Log error but continue - like/dislike itself succeeded
                 context.error(f"Failed to update video counts for {video_id}: {e}")
                 # Don't fail the whole operation just because counts didn't update
                 # Optionally, you could try to revert the like/dislike change here for consistency

        # 5. Return success response
        context.log(f"Action '{action}' completed for user '{user_id}' on video '{video_id}'. New status: {new_status}")
        return context.res.json({
            "success": True,
            "newStatus": new_status,
            # Optionally return new counts if needed by frontend (requires refetching after update)
            # "likeCount": new_like_count,
            # "dislikeCount": new_dislike_count
        })

    except Exception as e:
        context.error(f"Error processing like/dislike: {e}")
        return context.res.json({"success": False, "message": f"Server error: {e}"}, statusCode=500)
