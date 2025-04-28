from appwrite.client import Client
from appwrite.services.databases import Databases
from appwrite.query import Query
from appwrite.permission import Permission
from appwrite.role import Role
from appwrite.exception import AppwriteException
import os
import traceback
import collections

# Configuration Constants
DATABASE_ID = "database"
PENDING_VIEWS_COLLECTION_ID = "pending_views"
VIDEO_COUNTS_COLLECTION_ID = "video_counts"
MAX_DOCS_PER_RUN = 500 # Process up to 500 pending views per run

# Helper to extract user ID from permissions
def get_user_id_from_permissions(permissions):
    update_permission_prefix = 'update("user:'
    for perm in permissions:
        if perm.startswith(update_permission_prefix):
            start_index = len(update_permission_prefix)
            end_index = perm.find('")', start_index)
            if end_index != -1:
                return perm[start_index:end_index]
    return None

def main(context):
    context.log("--- View Manager Function Start ---")

    # --- Environment & Auth Check ---
    api_endpoint = os.environ.get("APPWRITE_FUNCTION_API_ENDPOINT")
    project_id = os.environ.get("APPWRITE_FUNCTION_PROJECT_ID")
    api_key = context.req.headers.get('x-appwrite-key')

    if not all([api_endpoint, project_id, api_key]):
        message = "Function configuration error: Missing endpoint, project ID, or API key."
        context.error(message)
        return context.res.json({"success": False, "message": message}, 500)

    # --- Initialize Appwrite Client ---
    client = Client()
    client.set_endpoint(api_endpoint).set_project(project_id).set_key(api_key)
    databases = Databases(client)

    total_processed_successfully = 0
    total_failed_to_update = 0
    total_deleted = 0
    total_delete_failures = 0

    try:
        # --- Fetch Pending Views ---
        context.log(f"Fetching up to {MAX_DOCS_PER_RUN} pending views...")
        pending_response = databases.list_documents(
            DATABASE_ID,
            PENDING_VIEWS_COLLECTION_ID,
            [Query.limit(MAX_DOCS_PER_RUN)]
        )
        pending_docs = pending_response.get('documents', [])
        total_fetched = len(pending_docs)
        context.log(f"Fetched {total_fetched} pending view documents.")

        if total_fetched == 0:
            context.log("No pending views to process.")
            return context.res.json({"success": True, "message": "No pending views."})

        # --- Group by Video ID ---
        views_by_video = collections.defaultdict(list)
        doc_ids_to_process = {} # Map videoId -> list of pendingDocIds

        context.log("Grouping pending views by video ID and user...")
        for doc in pending_docs:
            video_id = doc.get('videoId')
            doc_id = doc['$id']
            permissions = doc.get('$permissions', [])
            user_id = get_user_id_from_permissions(permissions)

            if not video_id:
                context.log(f"Warning: Pending view doc {doc_id} missing videoId. Skipping.")
                # Consider deleting this invalid doc immediately
                try:
                   databases.delete_document(DATABASE_ID, PENDING_VIEWS_COLLECTION_ID, doc_id)
                except Exception as del_err:
                   context.log(f"Warning: Failed to delete invalid pending view doc {doc_id}: {del_err}")
                continue
            if not user_id:
                context.log(f"Warning: Could not extract userId from permissions for pending view doc {doc_id}. Skipping.")
                # Consider deleting this invalid doc immediately
                try:
                   databases.delete_document(DATABASE_ID, PENDING_VIEWS_COLLECTION_ID, doc_id)
                except Exception as del_err:
                   context.log(f"Warning: Failed to delete invalid pending view doc {doc_id}: {del_err}")
                continue

            views_by_video[video_id].append(user_id)
            if video_id not in doc_ids_to_process:
                doc_ids_to_process[video_id] = []
            doc_ids_to_process[video_id].append(doc_id)

        context.log(f"Grouped views for {len(views_by_video)} unique videos.")

        # --- Process Each Video Group ---
        for video_id, user_ids in views_by_video.items():
            update_successful = False
            try:
                unique_user_ids_set = set(user_ids)
                unique_views_count = len(unique_user_ids_set)
                context.log(f"Processing Video ID: {video_id}. Found {unique_views_count} unique views in this batch.")

                # --- Update video_counts ---
                current_view_count = 0
                counts_doc_exists = False
                try:
                    counts_doc = databases.get_document(DATABASE_ID, VIDEO_COUNTS_COLLECTION_ID, video_id)
                    current_view_count = counts_doc.get('viewCount', 0) or 0
                    counts_doc_exists = True
                except AppwriteException as e:
                    if e.code == 404:
                        context.log(f"No counts document found for {video_id}. Will create.")
                        current_view_count = 0
                        counts_doc_exists = False
                    else:
                        # Re-throw other errors during fetch
                        raise Exception(f"Error fetching counts doc {video_id}: {e}")

                new_view_count = current_view_count + unique_views_count
                update_data = {'viewCount': new_view_count}

                if counts_doc_exists:
                    context.log(f"Updating counts for {video_id}: {current_view_count} -> {new_view_count}")
                    databases.update_document(
                        database_id=DATABASE_ID,
                        collection_id=VIDEO_COUNTS_COLLECTION_ID,
                        document_id=video_id,
                        data=update_data
                    )
                    context.log(f"Successfully updated counts for {video_id}.")
                else:
                    context.log(f"Creating counts for {video_id} with initial count: {new_view_count}")
                    # Include other default counts when creating
                    create_data = {
                        'viewCount': new_view_count,
                        'likeCount': 0,
                        'dislikeCount': 0,
                        'commentCount': 0,
                        'commentsJson': '[]'
                    }
                    databases.create_document(
                        database_id=DATABASE_ID,
                        collection_id=VIDEO_COUNTS_COLLECTION_ID,
                        document_id=video_id,
                        data=create_data,
                        permissions=[Permission.read(Role.any())] # Public read access
                    )
                    context.log(f"Successfully created counts document for {video_id}.")

                update_successful = True
                total_processed_successfully += 1

            except Exception as update_err:
                context.error(f"Failed to update/create counts for Video ID {video_id}: {update_err}")
                context.error(traceback.format_exc())
                total_failed_to_update += 1
                update_successful = False
                # DO NOT delete pending docs if update failed

            # --- Delete Processed Pending Views (if update succeeded) ---
            if update_successful:
                pending_docs_for_video = doc_ids_to_process.get(video_id, [])
                context.log(f"Update successful for {video_id}. Deleting {len(pending_docs_for_video)} related pending views...")
                for doc_id in pending_docs_for_video:
                    try:
                        databases.delete_document(DATABASE_ID, PENDING_VIEWS_COLLECTION_ID, doc_id)
                        total_deleted += 1
                    except Exception as delete_err:
                        context.error(f"Failed to delete pending view doc {doc_id} for video {video_id}: {delete_err}")
                        total_delete_failures += 1
                context.log(f"Finished deletion attempt for {video_id}.")

        # --- End of loop ---
        context.log(f"Batch processing finished. Successful updates: {total_processed_successfully}, Failed updates: {total_failed_to_update}, Docs deleted: {total_deleted}, Deletion failures: {total_delete_failures}")
        return context.res.json({
            "success": True,
            "processedVideoGroups": total_processed_successfully,
            "failedVideoGroups": total_failed_to_update,
            "pendingDocsDeleted": total_deleted,
            "pendingDocsDeleteFailures": total_delete_failures,
            "totalFetched": total_fetched
        })

    except Exception as e:
        context.error(f"An unexpected error occurred during main processing: {e}")
        context.error(traceback.format_exc())
        return context.res.json({"success": False, "message": f"Unexpected Error: {str(e)}"}, 500)
    finally:
        context.log("--- View Manager Function End ---")
