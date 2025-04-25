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
CHANNEL_STATS_COLLECTION_ID = "channel_stats"

def main(context):
    context.log("--- Subscriptions Manager Invocation Start ---")

    # Environment Variable Check
    api_endpoint = os.environ.get("APPWRITE_FUNCTION_API_ENDPOINT")
    project_id = os.environ.get("APPWRITE_FUNCTION_PROJECT_ID")
    api_key = context.req.headers.get('x-appwrite-key')

    if not all([api_endpoint, project_id, api_key]):
        message = "Missing required environment variables."
        context.error(message)
        return context.res.json({"success": "false", "message": message}, 500)

    # Authentication Check
    subscriber_id = context.req.headers.get('x-appwrite-user-id')
    if not subscriber_id:
        message = "Authentication required."
        context.error(message)
        return context.res.json({"success": "false", "message": message}, 401)
    context.log(f"Authenticated Subscriber ID: {subscriber_id}")

    # Input Parsing and Validation
    creator_id = None
    action = None
    try:
        payload = json.loads(context.req.body_raw)
        context.log(f"Parsed Payload: {payload}")
        creator_id = payload.get('creatorId')
        action = payload.get('action')

        if not creator_id or action not in ['subscribe', 'unsubscribe']:
            raise ValueError("Missing 'creatorId' or invalid 'action' ('subscribe'/'unsubscribe').")
        if subscriber_id == creator_id:
            raise ValueError("User cannot subscribe to themselves.")
        context.log(f"Processing Action: {action}, Target Creator ID: {creator_id}")

    except Exception as e:
        message = f"Invalid request payload: {e}. Raw: '{context.req.body_raw}'"
        context.error(message)
        return context.res.json({"success": "false", "message": str(e)}, 400)

    # Initialize Appwrite Client
    client = Client()
    client.set_endpoint(api_endpoint).set_project(project_id).set_key(api_key)
    databases = Databases(client)

    try:
        # --- Core Logic ---
        context.log(f"Fetching subscriber's account: {subscriber_id}")
        subscriber_doc = databases.get_document(DATABASE_ID, ACCOUNTS_COLLECTION_ID, subscriber_id)
        subscribing_to_list = subscriber_doc.get('subscribingTo', []) or []
        subscribing_to_set = set(subscribing_to_list)
        is_currently_subscribed = creator_id in subscribing_to_set
        context.log(f"Currently subscribed: {is_currently_subscribed}")

        count_change = 0
        new_subscription_state = is_currently_subscribed # Default to current state

        # Determine changes
        if action == 'subscribe' and not is_currently_subscribed:
            count_change = 1
            new_subscription_state = True
            subscribing_to_set.add(creator_id)
        elif action == 'unsubscribe' and is_currently_subscribed:
            count_change = -1
            new_subscription_state = False
            subscribing_to_set.discard(creator_id)
        else:
            # No change needed (e.g., subscribing when already subscribed)
            context.log("No change in subscription state required.")

        # Update Subscriber's Document if state changed
        if new_subscription_state != is_currently_subscribed:
            updated_subscribing_list = list(subscribing_to_set)
            context.log(f"Updating subscriber document {subscriber_id} with new list (size {len(updated_subscribing_list)})...")
            databases.update_document(
                database_id=DATABASE_ID,
                collection_id=ACCOUNTS_COLLECTION_ID,
                document_id=subscriber_id,
                data={'subscribingTo': updated_subscribing_list}
            )
            context.log(f"Subscriber document {subscriber_id} updated.")
        else:
             updated_subscribing_list = subscribing_to_list # Use original if no change

        # Update Channel Stats if count changed
        if count_change != 0:
            context.log(f"Updating channel stats for creator {creator_id} (change: {count_change})...")
            try:
                stats_doc = databases.get_document(DATABASE_ID, CHANNEL_STATS_COLLECTION_ID, creator_id)
                current_count = stats_doc.get('subscriberCount', 0)
                new_count = max(0, current_count + count_change)
                context.log(f"Updating existing stats doc {creator_id}. New count: {new_count}")
                databases.update_document(
                    database_id=DATABASE_ID,
                    collection_id=CHANNEL_STATS_COLLECTION_ID,
                    document_id=creator_id,
                    data={'subscriberCount': new_count}
                )
            except AppwriteException as e:
                if e.code == 404:
                    # Create stats document if it doesn't exist
                    new_count = max(0, count_change) # Should be 1 if subscribing
                    context.log(f"Creating new stats doc {creator_id}. Initial count: {new_count}")
                    databases.create_document(
                        database_id=DATABASE_ID,
                        collection_id=CHANNEL_STATS_COLLECTION_ID,
                        document_id=creator_id,
                        data={'subscriberCount': new_count},
                        permissions=[Permission.read(Role.any())] # Public read access
                    )
                else:
                    # Log error but don't fail the whole operation
                    context.error(f"Failed to get/update channel stats for {creator_id}: {e}")
            context.log(f"Channel stats update complete for {creator_id}.")
        else:
            context.log("No change in subscriber count needed.")

        # --- Success Response ---
        response_payload = {"success": "true", "isSubscribed": new_subscription_state}
        context.log(f"Operation successful. Returning: {response_payload}")
        context.log("--- Subscriptions Manager Invocation End (Success) ---")
        return context.res.json(response_payload)

    except AppwriteException as e:
        # Handle errors fetching/updating subscriber doc more specifically
        if e.code == 404 and e.message.__contains__(subscriber_id):
             message = f"Subscriber account document not found for {subscriber_id}."
             context.error(message)
             return context.res.json({"success": "false", "message": message}, 404)
        else:
            message = f"Database error: {e.message}"
            context.error(message, exc_info=True)
            return context.res.json({"success": "false", "message": message}, 500)
    except Exception as e:
        # Catch any other unexpected errors
        message = f"Unexpected server error: {e}"
        context.error(message, exc_info=True)
        return context.res.json({"success": "false", "message": message}, 500)
