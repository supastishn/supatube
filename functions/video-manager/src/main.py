from appwrite.client import Client
from appwrite.services.databases import Databases
from appwrite.services.storage import Storage
from appwrite.exception import AppwriteException
from appwrite.permission import Permission
from appwrite.role import Role
from appwrite.input_file import InputFile
from appwrite.query import Query
import os
import glob # For finding the apk file
import subprocess # For running FFmpeg
import traceback # For detailed error logging
import json # For handling JSON data

# --- Configuration ---
DATABASE_ID = "database"
VIDEO_PROCESSING_COLLECTION_ID = "video-processing"
VIDEOS_COLLECTION_ID = "videos"
VIDEOS_UNCOMPRESSED_BUCKET_ID = "videos-uncompressed"
VIDEOS_BUCKET_ID = "videos" # Bucket for compressed videos and thumbnails
MAX_PROCESSING_LIMIT = 5 # Number of videos to process per run

# FFmpeg settings (adjust as needed)
FFMPEG_OUTPUT_FORMAT = 'mp4'
FFMPEG_RESOLUTION = '480' # Target height
FFMPEG_FRAMERATE = '24'
FFMPEG_VCODEC = 'libx264' # Good balance of quality/compatibility
FFMPEG_CRF = '23' # Constant Rate Factor (lower means better quality, larger file)
FFMPEG_PRESET = 'medium' # Encoding speed vs compression efficiency
FFMPEG_ACODEC = 'aac' # Common audio codec
FFMPEG_ABITRATE = '128k' # Audio bitrate

# Temporary file paths within the function's execution environment
TMP_INPUT_DIR = '/tmp/input'
TMP_OUTPUT_DIR = '/tmp/output'

def get_video_duration_ffmpeg(file_path, context):
    """Gets video duration using ffprobe."""
    ffprobe_path = 'ffprobe' # Assume ffprobe is in PATH after runtime installation
    ffprobe_command = [
        ffprobe_path,
        '-v', 'error',                     # Only show errors
        '-show_entries', 'format=duration', # Get duration from format section
        '-of', 'default=noprint_wrappers=1:nokey=1', # Output only the value
        file_path
    ]
    context.log(f"Executing ffprobe command: {' '.join(ffprobe_command)}")
    try:
        result = subprocess.run(ffprobe_command, check=True, capture_output=True, text=True, timeout=30) # Added timeout
        duration_str = result.stdout.strip()
        context.log(f"ffprobe result: '{duration_str}'")
        if not duration_str:
             raise ValueError("ffprobe returned empty output.")
        duration_float = float(duration_str)
        duration_int = int(round(duration_float)) # Round to nearest second
        if duration_int <= 0:
            raise ValueError(f"ffprobe returned invalid duration: {duration_int}")
        context.log(f"Calculated duration: {duration_int} seconds")
        return duration_int
    except FileNotFoundError:
        context.error(f"ffprobe command not found at '{ffprobe_path}'. Was it installed correctly at runtime?")
        raise
    except subprocess.CalledProcessError as e:
        context.error(f"ffprobe failed with exit code {e.returncode}.")
        context.error(f"ffprobe stdout: {e.stdout}")
        context.error(f"ffprobe stderr: {e.stderr}")
        raise ValueError(f"ffprobe failed: {e.stderr}")
    except ValueError as e:
        context.error(f"Error parsing ffprobe duration output '{duration_str}': {e}")
        raise ValueError(f"Could not parse duration from ffprobe: {e}")
    except Exception as e:
        context.error(f"An unexpected error occurred during ffprobe execution: {e}")
        context.error(traceback.format_exc())
        raise

def run_ffmpeg(input_path, output_path, context):
    """Runs the FFmpeg compression command."""
    ffmpeg_path = 'ffmpeg' # Assume ffmpeg is in PATH after runtime installation
    context.log(f"Starting FFmpeg compression: {input_path} -> {output_path}")
    # Scale: -2 means calculate width automatically to maintain aspect ratio for the given height
    ffmpeg_command = [
        ffmpeg_path,
        '-i', input_path,
        '-vf', f"scale=-2:{FFMPEG_RESOLUTION}", # Scale to target height
        '-r', FFMPEG_FRAMERATE,                 # Set frame rate
        '-c:v', FFMPEG_VCODEC,                  # Video codec
        '-crf', FFMPEG_CRF,                     # Video quality
        '-preset', FFMPEG_PRESET,               # Encoding speed/efficiency
        '-c:a', FFMPEG_ACODEC,                  # Audio codec
        '-b:a', FFMPEG_ABITRATE,                # Audio bitrate
        '-y',                                  # Overwrite output file if exists
        output_path
    ]
    context.log(f"Executing FFmpeg command: {' '.join(ffmpeg_command)}")
    try:
        result = subprocess.run(ffmpeg_command, check=True, capture_output=True, text=True)
        context.log("FFmpeg compression successful.")
        context.log(f"FFmpeg stdout: {result.stdout[-500:]}") # Log last part of stdout
        context.log(f"FFmpeg stderr: {result.stderr[-500:]}") # Log last part of stderr
        return True
    except FileNotFoundError:
        context.error(f"ffmpeg command not found at '{ffmpeg_path}'. Was it installed correctly at runtime?")
        return False
    except subprocess.CalledProcessError as e:
        context.error(f"FFmpeg failed with exit code {e.returncode}.")
        context.error(f"FFmpeg stdout: {e.stdout}")
        context.error(f"FFmpeg stderr: {e.stderr}")
        return False
    except Exception as e:
        context.error(f"An unexpected error occurred during FFmpeg execution: {e}")
        context.error(traceback.format_exc())
        return False


def main(context):
    context.log("--- Video Manager Processing Start ---")

    # --- Dynamically install ffmpeg using apk add at runtime ---
    try:
        # Update package list first (good practice)
        apk_update_command = ['apk', 'update']
        context.log(f"Executing apk command: {' '.join(apk_update_command)}")
        update_result = subprocess.run(apk_update_command, check=True, capture_output=True, text=True)
        context.log("APK package list updated.")

        # Install ffmpeg
        apk_command = ['apk', 'add', 'ffmpeg']
        context.log(f"Executing apk command: {' '.join(apk_command)}")
        install_result = subprocess.run(apk_command, check=True, capture_output=True, text=True)
        context.log("ffmpeg installed successfully via apk add.")
        context.log(f"apk stdout: {install_result.stdout}")
        if install_result.stderr: # Log stderr only if it's not empty
            context.log(f"apk stderr: {install_result.stderr}")

    except FileNotFoundError as e:
        context.error(f"FFmpeg installation failed: {e}")
        return context.res.json({"success": False, "message": str(e)}, 500)
    except subprocess.CalledProcessError as e:
        context.error(f"apk command failed with exit code {e.returncode}.")
        context.error(f"apk stdout: {e.stdout}")
        context.error(f"apk stderr: {e.stderr}")
        return context.res.json({"success": False, "message": f"Failed to install ffmpeg via apk: {e.stderr}"}, 500)
    except Exception as e:
        context.error(f"An unexpected error occurred during ffmpeg installation: {e}")
        context.error(traceback.format_exc())
        return context.res.json({"success": False, "message": f"Unexpected error installing ffmpeg: {str(e)}"}, 500)

    # --- Environment & Auth Check ---
    api_endpoint = os.environ.get("APPWRITE_FUNCTION_API_ENDPOINT")
    project_id = os.environ.get("APPWRITE_FUNCTION_PROJECT_ID")
    api_key = context.req.headers.get('x-appwrite-key') # API key set by Appwrite

    if not all([api_endpoint, project_id, api_key]):
        message = "Function configuration error: Missing env vars or API key."
        context.error(message)
        return context.res.json({"success": False, "message": message}, 500)

    # --- Initialize Appwrite Client ---
    client = Client()
    client.set_endpoint(api_endpoint).set_project(project_id).set_key(api_key)
    databases = Databases(client)
    storage = Storage(client)

    # --- Create temporary directories if they don't exist ---
    os.makedirs(TMP_INPUT_DIR, exist_ok=True)
    os.makedirs(TMP_OUTPUT_DIR, exist_ok=True)

    processed_count = 0
    failed_count = 0
    skipped_count = 0

    try:
        # --- Fetch Pending Processing Documents ---
        context.log("Fetching pending video processing documents...")
        pending_response = databases.list_documents(
            DATABASE_ID,
            VIDEO_PROCESSING_COLLECTION_ID,
            [
                Query.equal('status', 'pending'),
                Query.limit(MAX_PROCESSING_LIMIT) # Process in batches
            ]
        )
        pending_docs = pending_response.get('documents', [])
        total_fetched = len(pending_docs)
        context.log(f"Found {total_fetched} pending documents.")

        if total_fetched == 0:
            context.log("No pending videos to process.")
            context.log("--- Video Manager Processing End (No Work) ---")
            return context.res.json({"success": True, "message": "No pending videos."})

        # --- Process Each Pending Document ---
        for processing_doc in pending_docs:
            processing_doc_id = processing_doc['$id']
            uncompressed_file_id = processing_doc.get('uncompressedFileId')
            thumbnail_id = processing_doc.get('thumbnailId')
            title = processing_doc.get('title')
            description = processing_doc.get('description')
            input_file_path = None
            output_file_path = None

            context.log(f"--- Processing document: {processing_doc_id} for file: {uncompressed_file_id} ---")

            if not all([uncompressed_file_id, thumbnail_id, title]):
                context.error(f"Skipping {processing_doc_id}: Missing required data (file IDs or title).")
                try:
                    databases.update_document(
                        DATABASE_ID, VIDEO_PROCESSING_COLLECTION_ID, processing_doc_id,
                        {'status': 'failed', 'errorMessage': 'Missing required metadata.'}
                    )
                except Exception as update_err:
                    context.error(f"Failed to update status for skipped doc {processing_doc_id}: {update_err}")
                skipped_count += 1
                continue

            # --- 1. Mark as Processing ---
            try:
                context.log(f"Updating status to 'processing' for {processing_doc_id}...")
                databases.update_document(
                    DATABASE_ID, VIDEO_PROCESSING_COLLECTION_ID, processing_doc_id,
                    {'status': 'processing', 'errorMessage': None} # Clear previous error
                )
            except Exception as e:
                context.error(f"Failed to update status to 'processing' for {processing_doc_id}: {e}. Skipping this item.")
                failed_count += 1
                continue # Skip if we can't even mark it as processing

            # --- 2. Extract Creator ID ---
            creator_id = None
            doc_permissions = processing_doc.get('$permissions', [])
            delete_permission_prefix = 'delete("user:'
            for perm in doc_permissions:
                if perm.startswith(delete_permission_prefix):
                    start_index = len(delete_permission_prefix)
                    end_index = perm.find('")', start_index)
                    if end_index != -1:
                        creator_id = perm[start_index:end_index]
                        break
            if not creator_id:
                 context.error(f"Could not determine creator ID for {processing_doc_id}. Permissions: {doc_permissions}")
                 # Update status to failed and continue
                 try:
                    databases.update_document(
                        DATABASE_ID, VIDEO_PROCESSING_COLLECTION_ID, processing_doc_id,
                        {'status': 'failed', 'errorMessage': 'Could not determine owner.'}
                    )
                 except Exception as update_err:
                    context.error(f"Failed to update status for failed creator ID fetch {processing_doc_id}: {update_err}")
                 failed_count += 1
                 continue

            context.log(f"Creator ID identified as: {creator_id}")

            # --- 3. Download Uncompressed Video ---
            try:
                context.log(f"Downloading file {uncompressed_file_id} from bucket {VIDEOS_UNCOMPRESSED_BUCKET_ID}...")
                # Construct input path making sure it's unique enough or cleaned up
                input_file_path = os.path.join(TMP_INPUT_DIR, uncompressed_file_id) # Use file ID as name
                file_data = storage.get_file_download(VIDEOS_UNCOMPRESSED_BUCKET_ID, uncompressed_file_id)
                with open(input_file_path, 'wb') as f:
                    f.write(file_data)
                context.log(f"File downloaded successfully to {input_file_path}")
                
                # --- 3b. Calculate Video Duration ---
                calculated_duration = None
                try:
                    calculated_duration = get_video_duration_ffmpeg(input_file_path, context)
                    if calculated_duration is None or calculated_duration <= 0:
                         raise ValueError("Invalid duration calculated.")
                except Exception as e:
                    error_message = f"Failed to calculate duration for {uncompressed_file_id}: {e}"
                    context.error(error_message)
                    try:
                        databases.update_document(
                            DATABASE_ID, VIDEO_PROCESSING_COLLECTION_ID, processing_doc_id,
                            {'status': 'failed', 'errorMessage': error_message}
                        )
                    except Exception as update_err:
                        context.error(f"Failed to update status for failed duration calc {processing_doc_id}: {update_err}")
                    failed_count += 1
                    # Cleanup downloaded file
                    if input_file_path and os.path.exists(input_file_path):
                         os.remove(input_file_path)
                    continue # Move to next document
            except Exception as e:
                error_message = f"Failed to download file {uncompressed_file_id}: {e}"
                context.error(error_message)
                try:
                    databases.update_document(
                        DATABASE_ID, VIDEO_PROCESSING_COLLECTION_ID, processing_doc_id,
                        {'status': 'failed', 'errorMessage': error_message}
                    )
                except Exception as update_err:
                    context.error(f"Failed to update status for failed download {processing_doc_id}: {update_err}")
                failed_count += 1
                # Cleanup potentially partially downloaded file
                if input_file_path and os.path.exists(input_file_path):
                     os.remove(input_file_path)
                continue # Move to next document

            # --- 4. Compress Video using FFmpeg ---
            final_thumbnail_id = None # Initialize final thumbnail ID
            try:
                output_file_name = f"{uncompressed_file_id}.{FFMPEG_OUTPUT_FORMAT}" # Use original ID + new extension
                output_file_path = os.path.join(TMP_OUTPUT_DIR, output_file_name)
                compression_success = run_ffmpeg(input_file_path, output_file_path, context)
                if not compression_success:
                    raise Exception("FFmpeg compression command failed.")
            except Exception as e:
                error_message = f"FFmpeg compression failed for {uncompressed_file_id}: {e}"
                context.error(error_message)
                try:
                    databases.update_document(
                        DATABASE_ID, VIDEO_PROCESSING_COLLECTION_ID, processing_doc_id,
                        {'status': 'failed', 'errorMessage': error_message}
                    )
                except Exception as update_err:
                    context.error(f"Failed to update status for failed compression {processing_doc_id}: {update_err}")
                failed_count += 1
                # Cleanup temporary files
                if input_file_path and os.path.exists(input_file_path): os.remove(input_file_path)
                if output_file_path and os.path.exists(output_file_path): os.remove(output_file_path)
                # thumbnail_input_path doesn't exist at this point in the code
                continue # Move to next document

            # --- 5. Transfer Thumbnail from Uncompressed to Compressed Bucket ---
            thumbnail_input_path = None
            try:
                context.log(f"Downloading original thumbnail {thumbnail_id} from {VIDEOS_UNCOMPRESSED_BUCKET_ID}...")
                thumbnail_input_path = os.path.join(TMP_INPUT_DIR, f"thumb_{thumbnail_id}") # Temp path for thumbnail
                thumb_data = storage.get_file_download(VIDEOS_UNCOMPRESSED_BUCKET_ID, thumbnail_id)
                with open(thumbnail_input_path, 'wb') as f:
                    f.write(thumb_data)
                context.log(f"Thumbnail downloaded to {thumbnail_input_path}")

                context.log(f"Uploading thumbnail {thumbnail_input_path} to final bucket {VIDEOS_BUCKET_ID}...")
                thumb_input_file = InputFile.from_path(thumbnail_input_path)
                thumb_upload_response = storage.create_file(
                    VIDEOS_BUCKET_ID,
                    'unique()', # New ID for thumbnail in final bucket
                    thumb_input_file,
                    [ # Permissions for the final thumbnail
                        Permission.read(Role.any()),      # Publicly readable thumbnail
                        Permission.delete(Role.user(creator_id)) # Owner can delete
                    ]
                )
                final_thumbnail_id = thumb_upload_response['$id']
                context.log(f"Thumbnail transferred successfully. Final Thumbnail ID: {final_thumbnail_id}")

            except Exception as e:
                error_message = f"Failed to transfer thumbnail {thumbnail_id}: {e}"
                context.error(error_message)
                try:
                    databases.update_document(
                        DATABASE_ID, VIDEO_PROCESSING_COLLECTION_ID, processing_doc_id,
                        {'status': 'failed', 'errorMessage': error_message}
                    )
                except Exception as update_err:
                    context.error(f"Failed to update status for failed thumbnail transfer {processing_doc_id}: {update_err}")
                failed_count += 1
                # Cleanup potential temporary files
                if input_file_path and os.path.exists(input_file_path): os.remove(input_file_path)
                if output_file_path and os.path.exists(output_file_path): os.remove(output_file_path)
                if thumbnail_input_path and os.path.exists(thumbnail_input_path): os.remove(thumbnail_input_path)
                continue # Move to next document

            # --- 6. Upload Compressed Video ---
            compressed_file_id = None
            try:
                context.log(f"Uploading compressed video {output_file_path} to bucket {VIDEOS_BUCKET_ID}...")
                with open(output_file_path, 'rb') as video_file_handle:
                    compressed_file_for_upload = InputFile.from_bytes(video_file_handle.read(), filename=os.path.basename(output_file_path))
                    upload_response = storage.create_file(
                        VIDEOS_BUCKET_ID,
                        'unique()', # Let Appwrite generate ID for compressed file
                        compressed_file_for_upload,
                    [ # Permissions for compressed video
                        Permission.read(Role.any()), # Publicly readable
                        Permission.delete(Role.user(creator_id)) # Owner can delete
                    ]
                )
                compressed_file_id = upload_response['$id']
                context.log(f"Compressed file uploaded successfully. New File ID: {compressed_file_id}")
            except Exception as e:
                error_message = f"Failed to upload compressed file for {uncompressed_file_id}: {e}"
                context.error(error_message)
                try:
                    databases.update_document(
                        DATABASE_ID, VIDEO_PROCESSING_COLLECTION_ID, processing_doc_id,
                        {'status': 'failed', 'errorMessage': error_message}
                    )
                except Exception as update_err:
                    context.error(f"Failed to update status for failed upload {processing_doc_id}: {update_err}")
                failed_count += 1
                # Cleanup temporary files
                if input_file_path and os.path.exists(input_file_path): os.remove(input_file_path)
                if output_file_path and os.path.exists(output_file_path): os.remove(output_file_path)
                continue # Move to next document

            # --- 7. Create Final Video Document ---
            try:
                context.log(f"Creating final video document in collection {VIDEOS_COLLECTION_ID}...")
                final_video_data = {
                    'title': title,
                    'description': description,
                    'video_id': compressed_file_id, # Use the NEW compressed file ID
                    'thumbnail_id': final_thumbnail_id, # Use the NEW final thumbnail ID
                    'video_duration': calculated_duration, # Use the calculated duration
                    # Counts will default to 0 based on collection schema
                }
                video_doc = databases.create_document(
                    DATABASE_ID,
                    VIDEOS_COLLECTION_ID,
                    'unique()', # Let Appwrite generate document ID
                    final_video_data,
                    [ # Permissions for the video metadata document
                        Permission.read(Role.any()), # Publicly readable metadata
                        Permission.update(Role.user(creator_id)), # Owner can update title/desc
                        Permission.delete(Role.user(creator_id))  # Owner can delete
                    ]
                )
                context.log(f"Final video document created successfully: {video_doc['$id']}")
                
                # --- Update Creator's Account Document with Uploaded Video ID ---
                try:
                    context.log(f"Fetching account document for creator {creator_id}...")
                    account_doc = databases.get_document(DATABASE_ID, ACCOUNTS_COLLECTION_ID, creator_id)
                    
                    current_uploads = account_doc.get('videosUploaded', []) or [] # Default to empty list if null/missing
                    new_video_id = video_doc['$id']
                    
                    # Avoid adding duplicates if function reruns partially
                    if new_video_id not in current_uploads:
                        updated_uploads = current_uploads + [new_video_id] # Append new video ID
                        
                        context.log(f"Updating account document {creator_id} with new videosUploaded array (length {len(updated_uploads)})...")
                        databases.update_document(
                            database_id=DATABASE_ID,
                            collection_id=ACCOUNTS_COLLECTION_ID,
                            document_id=creator_id,
                            data={'videosUploaded': updated_uploads} # Update only the array
                        )
                        context.log(f"Account document {creator_id} updated successfully.")
                    else:
                        context.log(f"Video ID {new_video_id} already present in account {creator_id}'s videosUploaded array. Skipping update.")
                    
                except AppwriteException as acc_update_err:
                    # Log error but don't fail the whole video processing for this
                    context.error(f"Warning: Failed to update 'videosUploaded' array for account {creator_id}: {acc_update_err}")
                except Exception as acc_general_err:
                    context.error(f"Warning: Unexpected error updating account {creator_id}: {acc_general_err}")
            except Exception as e:
                error_message = f"Failed to create final video document for {uncompressed_file_id}: {e}"
                context.error(error_message)
                # Attempt to roll back: delete compressed file if DB entry fails
                if compressed_file_id:
                    try:
                        context.log(f"Rolling back: Deleting transferred thumbnail {final_thumbnail_id}...")
                        storage.delete_file(VIDEOS_BUCKET_ID, final_thumbnail_id)
                    except Exception as delete_err:
                         context.error(f"Failed to rollback transferred thumbnail {final_thumbnail_id}: {delete_err}")
                if final_thumbnail_id:
                    try:
                        context.log(f"Rolling back: Deleting compressed file {compressed_file_id}...")
                        storage.delete_file(VIDEOS_BUCKET_ID, compressed_file_id)
                    except Exception as delete_err:
                        context.error(f"Failed to rollback compressed file {compressed_file_id}: {delete_err}")
                try:
                    databases.update_document(
                        DATABASE_ID, VIDEO_PROCESSING_COLLECTION_ID, processing_doc_id,
                        {'status': 'failed', 'errorMessage': error_message}
                    )
                except Exception as update_err:
                    context.error(f"Failed to update status for failed DB creation {processing_doc_id}: {update_err}")
                failed_count += 1
                # Cleanup temporary files
                if input_file_path and os.path.exists(input_file_path): os.remove(input_file_path)
                if output_file_path and os.path.exists(output_file_path): os.remove(output_file_path)
                continue # Move to next document

            # --- 8. Delete Uncompressed Video File ---
            try:
                context.log(f"Deleting original uncompressed file {uncompressed_file_id} from {VIDEOS_UNCOMPRESSED_BUCKET_ID}...")
                storage.delete_file(VIDEOS_UNCOMPRESSED_BUCKET_ID, uncompressed_file_id)
                context.log("Original file deleted successfully.")
            except Exception as e:
                # Log error but don't fail the whole process just for this cleanup step
                context.error(f"Warning: Failed to delete original uncompressed file {uncompressed_file_id}: {e}")

            # --- 9. Delete Uncompressed Thumbnail File ---
            try:
                context.log(f"Deleting original thumbnail file {thumbnail_id} from {VIDEOS_UNCOMPRESSED_BUCKET_ID}...")
                storage.delete_file(VIDEOS_UNCOMPRESSED_BUCKET_ID, thumbnail_id)
                context.log("Original thumbnail file deleted successfully.")
            except Exception as e:
                 # Log error but don't fail the whole process just for this cleanup step
                 context.error(f"Warning: Failed to delete original thumbnail file {thumbnail_id}: {e}")

            # --- 10. Delete Processing Document ---
            try:
                context.log(f"Deleting processing document {processing_doc_id}...")
                databases.delete_document(DATABASE_ID, VIDEO_PROCESSING_COLLECTION_ID, processing_doc_id)
                context.log("Processing document deleted successfully.")
                processed_count += 1
            except Exception as e:
                # Log error but consider the main task successful if we got this far
                context.error(f"Warning: Failed to delete processing document {processing_doc_id}: {e}")
                processed_count += 1 # Still count as processed

            # --- 11. Cleanup Local Files ---
            finally: # Ensure cleanup happens even if DB deletes fail
                 context.log("Cleaning up temporary files...")
                 if input_file_path and os.path.exists(input_file_path):
                     try:
                         os.remove(input_file_path)
                         context.log(f"Removed {input_file_path}")
                     except Exception as e:
                         context.error(f"Error removing input file {input_file_path}: {e}")
                 if output_file_path and os.path.exists(output_file_path):
                     try:
                         os.remove(output_file_path)
                         context.log(f"Removed {output_file_path}")
                     except Exception as e:
                         context.error(f"Error removing output file {output_file_path}: {e}")
                 if thumbnail_input_path and os.path.exists(thumbnail_input_path):
                     try:
                         os.remove(thumbnail_input_path)
                         context.log(f"Removed {thumbnail_input_path}")
                     except Exception as e:
                         context.error(f"Error removing thumbnail input file {thumbnail_input_path}: {e}")

            context.log(f"--- Finished processing document: {processing_doc_id} ---")

        # --- End of loop ---
        context.log(f"Batch finished. Processed: {processed_count}, Failed: {failed_count}, Skipped: {skipped_count}")
        context.log("--- Video Manager Processing End (Success) ---")
        return context.res.json({
            "success": True,
            "processed": processed_count,
            "failed": failed_count,
            "skipped": skipped_count,
            "totalFetched": total_fetched
        })

    except Exception as e:
        context.error(f"An unexpected error occurred: {e}")
        context.error(traceback.format_exc())
        context.log("--- Video Manager Processing End (Error) ---")
        return context.res.json({"success": False, "message": str(e)}, 500)
