from appwrite.client import Client
from appwrite.services.databases import Databases
from appwrite.services.storage import Storage
from appwrite.exception import AppwriteException
from appwrite.permission import Permission
from appwrite.role import Role
import os
import json

# Configuration Constants (Match your project)
DATABASE_ID = "database"
VIDEOS_COLLECTION_ID = "videos"
STORAGE_VIDEOS_BUCKET_ID = "videos"

def main(context):
    context.log("--- Video Deletion Manager Invocation Start ---")

    # --- Environment & Auth Check ---
    api_endpoint = os.environ.get("APPWRITE_FUNCTION_API_ENDPOINT")
    project_id = os.environ.get("APPWRITE_FUNCTION_PROJECT_ID")
    api_key = context.req.headers.get('x-appwrite-key') # Function uses API key for elevated access
    user_id = context.req.headers.get('x-appwrite-user-id') # User triggering the function

    if not all([api_endpoint, project_id, api_key]):
        message = "Function configuration error (missing env vars)."
        context.error(message)
        return context.res.json({"success": False, "message": message}, 500) # Use False boolean

    if not user_id:
        message = "Authentication required."
        context.error(message)
        return context.res.json({"success": False, "message": message}, 401)
    context.log(f"Authenticated User ID: {user_id}")

    # --- Input Parsing ---
    video_id_to_delete = None
    try:
        payload = json.loads(context.req.body_raw)
        video_id_to_delete = payload.get('videoId')
        if not video_id_to_delete:
            raise ValueError("'videoId' is required in the request body.")
        context.log(f"Requested deletion for Video ID: {video_id_to_delete}")

    except Exception as e:
        message = f"Invalid request payload: {e}. Raw: '{context.req.body_raw}'"
        context.error(message)
        return context.res.json({"success": False, "message": str(e)}, 400)

    # --- Initialize Appwrite Client ---
    client = Client()
    client.set_endpoint(api_endpoint).set_project(project_id).set_key(api_key)
    databases = Databases(client)
    storage = Storage(client)

    try:
        # --- Fetch Video Document ---
        context.log(f"Fetching video document: {video_id_to_delete}")
        video_doc = databases.get_document(DATABASE_ID, VIDEOS_COLLECTION_ID, video_id_to_delete)
        context.log(f"Video document fetched successfully.")

        # --- Authorization Check ---
        permissions = video_doc.get('$permissions', [])
        required_permission = f'update("user:{user_id}")' # Check for update permission

        if required_permission not in permissions:
            message = f"User {user_id} does not have permission to delete video {video_id_to_delete}."
            context.error(message)
            return context.res.json({"success": False, "message": "Forbidden: You do not own this video."}, 403)
        context.log(f"User {user_id} authorized to delete video {video_id_to_delete}.")

        # --- Get File IDs ---
        video_file_id = video_doc.get('video_id')
        thumbnail_file_id = video_doc.get('thumbnail_id')
        context.log(f"Video File ID: {video_file_id}, Thumbnail File ID: {thumbnail_file_id}")

        # --- Delete Storage Files (Attempt both, log errors but continue) ---
        # Delete Video File
        if video_file_id:
            try:
                context.log(f"Attempting to delete video file: {video_file_id}")
                storage.delete_file(STORAGE_VIDEOS_BUCKET_ID, video_file_id)
                context.log(f"Successfully deleted video file: {video_file_id}")
            except AppwriteException as e:
                context.log(f"Warning: Failed to delete video file {video_file_id}. Code: {e.code}, Message: {e.message}. Continuing...")
        else:
            context.log("No video file ID found in document.")

        # Delete Thumbnail File
        if thumbnail_file_id:
            try:
                context.log(f"Attempting to delete thumbnail file: {thumbnail_file_id}")
                storage.delete_file(STORAGE_VIDEOS_BUCKET_ID, thumbnail_file_id)
                context.log(f"Successfully deleted thumbnail file: {thumbnail_file_id}")
            except AppwriteException as e:
                context.log(f"Warning: Failed to delete thumbnail file {thumbnail_file_id}. Code: {e.code}, Message: {e.message}. Continuing...")
        else:
            context.log("No thumbnail file ID found in document.")

        # --- Delete Database Document ---
        context.log(f"Attempting to delete video document: {video_id_to_delete}")
        databases.delete_document(DATABASE_ID, VIDEOS_COLLECTION_ID, video_id_to_delete)
        context.log(f"Successfully deleted video document: {video_id_to_delete}")

        # --- Success Response ---
        response_payload = {"success": True, "message": "Video deleted successfully."} # Use True boolean
        context.log(f"Operation successful. Returning: {response_payload}")
        context.log("--- Video Deletion Manager Invocation End (Success) ---")
        return context.res.json(response_payload)

    except AppwriteException as e:
        # Handle specific errors like document not found
        if e.code == 404:
             message = f"Video document {video_id_to_delete} not found."
             context.error(message)
             return context.res.json({"success": False, "message": message}, 404)
        else:
             message = f"Appwrite error during deletion: {e.message}"
             context.error(message)
             return context.res.json({"success": False, "message": message}, e.code if e.code >= 400 else 500)
    except Exception as e:
        # Catch any other unexpected errors
        message = f"Unexpected server error: {e}"
        context.error(message)
        context.log("--- Video Deletion Manager Invocation End (Error) ---")
        return context.res.json({"success": False, "message": message}, 500)
