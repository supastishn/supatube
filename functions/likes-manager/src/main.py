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
        response_payload = {"success": False, "message": "Function configuration error."}
        response_status = 500
        context.log(f"Exiting with Error - Status: {response_status}, Payload: {response_payload}")
        context.log("--- Likes Manager Invocation End (Error) ---")
        context.res.json(response_payload, statusCode=response_status) # Set response details

    # Check for User ID (should be present if execute permission is 'users')
    user_id = context.req.headers.get('x-appwrite-user-id')
    if not user_id:
        error_message = "User not authenticated."
        context.error(error_message)
        response_payload = {"success": False, "message": "Authentication required."}
        response_status = 401
        context.log(f"Exiting with Error - Status: {response_status}, Payload: {response_payload}")
        context.log("--- Likes Manager Invocation End (Error) ---")
        context.res.json(response_payload, statusCode=response_status) # Set response details
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
        response_payload = {"success": False, "message": f"Invalid request: {e}"}
        response_status = 400
        context.log(f"Exiting with Error - Status: {response_status}, Payload: {response_payload}")
        context.log("--- Likes Manager Invocation End (Error) ---")
        context.res.json(response_payload, statusCode=response_status) # Set response details

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
        # === Start Core Logic ===
        context.log(f"Checking existing like status for user {user_id} on video {video_id}...")

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
                context.log(f"Found existing like document: {existing_like_doc['$id']} with type '{existing_like_doc['type']}'")
            else:
                context.log("No existing like document found.")
        except AppwriteException as e:
            if e.code != 404:
                context.error(f"Error querying likes collection: {e}")
                raise Exception(f"Database error checking like status: {e.message}")
            else:
                context.log("'likes' collection query returned 404.")


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
        context.log(f"Determined changes: like_change={like_change}, dislike_change={dislike_change}, new_status={new_status}")

        # 3. Apply changes to the 'likes' collection
        context.log("Applying changes to 'likes' collection...")
        if new_status == 'liked':
            if existing_like_doc and existing_like_doc['type'] == 'dislike':
                 context.log(f"Updating like doc {existing_like_doc['$id']} from dislike to like.")
                 # Update existing dislike to like
                 databases.update_document(
                    database_id=DATABASE_ID,
                    collection_id=LIKES_COLLECTION_ID,
                    document_id=existing_like_doc['$id'],
                    data={'type': 'like'}
                 )
            elif existing_like_doc is None:
                 context.log("Creating new 'like' document.")
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
                 context.log(f"Updating like doc {existing_like_doc['$id']} from like to dislike.")
                 # Update existing like to dislike
                 databases.update_document(
                    database_id=DATABASE_ID,
                    collection_id=LIKES_COLLECTION_ID,
                    document_id=existing_like_doc['$id'],
                    data={'type': 'dislike'}
                 )
            elif existing_like_doc is None:
                 context.log("Creating new 'dislike' document.")
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
            context.log(f"Deleting like doc {existing_like_doc['$id']}.")
            databases.delete_document(
                database_id=DATABASE_ID,
                collection_id=LIKES_COLLECTION_ID,
                document_id=existing_like_doc['$id']
            )
        else:
            context.log("No change needed in 'likes' collection.")

        # 4. Update counts on the 'video_counts' collection if there were changes
        if like_change != 0 or dislike_change != 0:
            context.log(f"Updating counts in 'video_counts' for video {video_id}...")
            current_likes = 0
            current_dislikes = 0
            counts_doc_exists = False

            try:
                # Try to get the existing counts document using videoId as documentId
                counts_doc = databases.get_document(DATABASE_ID, VIDEO_COUNTS_COLLECTION_ID, video_id)
                current_likes = counts_doc.get('likeCount', 0)
                current_dislikes = counts_doc.get('dislikeCount', 0)
                counts_doc_exists = True
                context.log(f"Found counts document. Current counts: Likes={current_likes}, Dislikes={current_dislikes}")
            except AppwriteException as e:
                if e.code == 404:
                    # Document doesn't exist, counts are 0, we need to create it
                    counts_doc_exists = False
                    context.log(f"Counts document for video {video_id} not found. Will create.")
                else:
                    # Other error fetching counts doc, log it but proceed carefully
                    context.error(f"Error fetching counts document for {video_id}: {e}")
                    # Decide if we should stop count update or proceed assuming 0
                    # For robustness, let's try to proceed assuming counts were 0.

            # Calculate new counts
            new_like_count = max(0, current_likes + like_change)
            new_dislike_count = max(0, current_dislikes + dislike_change)

            # Update or Create the counts document
            try:
                if counts_doc_exists:
                    # Update existing document
                    databases.update_document(
                        database_id=DATABASE_ID,
                        collection_id=VIDEO_COUNTS_COLLECTION_ID,
                        document_id=video_id, # Use videoId as document ID
                        data={
                            'likeCount': new_like_count,
                            'dislikeCount': new_dislike_count
                        }
                    )
                    context.log(f"Updated counts for video {video_id}: Likes={new_like_count}, Dislikes={new_dislike_count}")
                else:
                    # Create new document
                    databases.create_document(
                        database_id=DATABASE_ID,
                        collection_id=VIDEO_COUNTS_COLLECTION_ID,
                        document_id=video_id, # Use videoId as document ID
                        data={
                            'likeCount': new_like_count,
                            'dislikeCount': new_dislike_count
                        },
                        # Grant read access to anyone
                        permissions=[Permission.read(Role.any())]
                    )
                    context.log(f"Created counts document for video {video_id}: Likes={new_like_count}, Dislikes={new_dislike_count}")
            except AppwriteException as e:
                # Log error but continue - like/dislike itself succeeded
                context.error(f"Failed to update/create counts document for {video_id}: {e}")
        else:
            context.log("No count changes required.")

        # === End Core Logic ===

        # 5. Return success response
        success_payload = { "success": True, "newStatus": new_status }
        context.log(f"Action '{action}' completed successfully. Returning: {success_payload}")
        context.log("--- Likes Manager Invocation End (Success) ---")
        context.res.json(success_payload) # Set response details (implicitly uses 200 OK)

    except Exception as e:
        error_message = f"Unexpected error processing like/dislike: {e}"
        context.error(error_message, exc_info=True) # Log full traceback
        response_payload = {"success": False, "message": f"Server error: {e}"}
        response_status = 500
        # --- Log Response Before Returning ---
        context.log(f"Exiting with Error - Status: {response_status}, Payload: {response_payload}")
        context.log("--- Likes Manager Invocation End (Error) ---")
        context.res.json(response_payload, statusCode=response_status) # Set response details
