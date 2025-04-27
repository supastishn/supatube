from appwrite.client import Client
from appwrite.services.databases import Databases
from appwrite.exception import AppwriteException
from appwrite.permission import Permission
from appwrite.role import Role
from appwrite.query import Query
import os
import json
import traceback

# Configuration Constants
DATABASE_ID = "database"
ACCOUNTS_COLLECTION_ID = "accounts"
CHANNEL_STATS_COLLECTION_ID = "channel_stats"
ACCOUNT_INTERACTIONS_COLLECTION_ID = "account_interactions"
USER_SUBSCRIPTIONS_COLLECTION_ID = "user_subscriptions"
MAX_PROCESSING_LIMIT = 50  # Number of interactions to process per run

def main(context):
    context.log("--- Subscriptions Manager Batch Job Start ---")

    # Environment Variable Check
    api_endpoint = os.environ.get("APPWRITE_FUNCTION_API_ENDPOINT")
    project_id = os.environ.get("APPWRITE_FUNCTION_PROJECT_ID")
    api_key = context.req.headers.get('x-appwrite-key')

    if not all([api_endpoint, project_id, api_key]):
        message = "Missing required environment variables."
        context.error(message)
        return context.res.json({"success": False, "message": message}, 500)

    # Initialize Appwrite Client
    client = Client()
    client.set_endpoint(api_endpoint).set_project(project_id).set_key(api_key)
    databases = Databases(client)

    processed_count = 0
    failed_count = 0

    try:
        # --- Fetch Pending Interaction Documents ---
        context.log("Fetching subscription interaction documents...")
        interactions_response = databases.list_documents(
            DATABASE_ID,
            ACCOUNT_INTERACTIONS_COLLECTION_ID,
            [Query.limit(MAX_PROCESSING_LIMIT)]
        )
        
        interaction_docs = interactions_response.get('documents', [])
        total_fetched = len(interaction_docs)
        context.log(f"Fetched {total_fetched} interaction documents to process.")

        if total_fetched == 0:
            context.log("No subscription interactions to process.")
            context.log("--- Subscriptions Manager Batch Job End (No Work) ---")
            return context.res.json({"success": True, "message": "No interactions found", 
                                    "processed": 0, "failed": 0, "totalFetched": 0})

        # --- Process Each Interaction Document ---
        for interaction_doc in interaction_docs:
            interaction_id = interaction_doc["$id"]
            context.log(f"Processing interaction {interaction_id}...")

            try:
                # --- Extract User ID from Permissions ---
                subscriber_id = None
                doc_permissions = interaction_doc.get('$permissions', [])
                
                # Look for update permission to determine the creator
                update_permission_prefix = 'update("user:'
                for perm in doc_permissions:
                    if perm.startswith(update_permission_prefix):
                        start_index = len(update_permission_prefix)
                        end_index = perm.find('")', start_index)
                        if end_index != -1:
                            subscriber_id = perm[start_index:end_index]
                            break # Found the user ID

                if not subscriber_id:
                    context.error(f"Could not determine user ID from permissions on interaction {interaction_id}.")
                    failed_count += 1
                    continue

                # --- Extract Interaction Data ---
                action = interaction_doc.get('type')
                creator_id = interaction_doc.get('targetAccountId')

                # --- Validate Data ---
                if not creator_id or action not in ['subscribe', 'unsubscribe']:
                    context.error(f"Invalid interaction data in {interaction_id}: Missing targetAccountId or invalid type.")
                    failed_count += 1
                    continue

                # --- Check for Self-Subscription ---
                if subscriber_id == creator_id:
                    context.log(f"User {subscriber_id} attempted to subscribe to themselves. Skipping.")
                    # Delete the invalid interaction and count as processed
                    databases.delete_document(
                        DATABASE_ID,
                        ACCOUNT_INTERACTIONS_COLLECTION_ID, 
                        interaction_id
                    )
                    processed_count += 1
                    continue

                context.log(f"Processing Action: {action}, Subscriber: {subscriber_id}, Target: {creator_id}")

                # --- Fetch Subscriber's Subscriptions Document ---
                create_subscription_doc = False
                try:
                    subscription_doc = databases.get_document(DATABASE_ID, USER_SUBSCRIPTIONS_COLLECTION_ID, subscriber_id)
                    subscribing_to_list = subscription_doc.get('subscribedToChannelIds', []) or []
                    subscribing_to_set = set(subscribing_to_list)
                    is_currently_subscribed = creator_id in subscribing_to_set
                    context.log(f"Currently subscribed: {is_currently_subscribed}")
                except AppwriteException as e:
                    if e.code == 404:
                        # No subscriptions document exists yet, initialize with empty set
                        subscribing_to_set = set()
                        is_currently_subscribed = False
                        create_subscription_doc = True
                        context.log(f"No subscriptions document found for user {subscriber_id}. Will create if needed.")
                    else:
                        # Re-throw other errors
                        context.error(f"Error fetching subscriptions document for {subscriber_id}: {e}")
                        raise e

                count_change = 0
                new_subscription_state = is_currently_subscribed # Default to current state

                # --- Determine Necessary Changes ---
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

                # --- Update Subscriber's Document if State Changed ---
                subscription_updated = True
                if new_subscription_state != is_currently_subscribed:
                    updated_subscribing_list = list(subscribing_to_set)
                    context.log(f"Updating subscriber subscriptions {subscriber_id} with new list (size {len(updated_subscribing_list)})...")
                    try:
                        if create_subscription_doc:
                            # Create new subscriptions document if it doesn't exist
                            databases.create_document(
                                database_id=DATABASE_ID,
                                collection_id=USER_SUBSCRIPTIONS_COLLECTION_ID,
                                document_id=subscriber_id,
                                data={'subscribedToChannelIds': updated_subscribing_list},
                                permissions=[
                                    Permission.read(Role.user(subscriber_id))  # Only user can read their subscriptions
                                ]
                            )
                            context.log(f"Created new subscriptions document for {subscriber_id}")
                        else:
                            # Update existing subscriptions document
                            databases.update_document(
                                database_id=DATABASE_ID,
                                collection_id=USER_SUBSCRIPTIONS_COLLECTION_ID,
                                document_id=subscriber_id,
                                data={'subscribedToChannelIds': updated_subscribing_list}
                            )
                            context.log(f"Updated subscriptions document for {subscriber_id}")
                    except AppwriteException as update_err:
                        context.error(f"Failed to update subscriptions document {subscriber_id}: {update_err}")
                        subscription_updated = False
                        raise update_err  # Re-raise to be caught by the outer try-except
                    
                    # --- Update Channel Stats if Count Changed ---
                    stats_updated = True
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
                            context.log(f"Channel stats updated for {creator_id}.")
                        except AppwriteException as e:
                            if e.code == 404:
                                # Create stats document if it doesn't exist
                                new_count = max(0, count_change) # Should be 1 if subscribing
                                context.log(f"Creating new stats doc {creator_id}. Initial count: {new_count}")
                                try:
                                    databases.create_document(
                                        database_id=DATABASE_ID,
                                        collection_id=CHANNEL_STATS_COLLECTION_ID,
                                        document_id=creator_id,
                                        data={'subscriberCount': new_count},
                                        permissions=[Permission.read(Role.any())] # Public read access
                                    )
                                    context.log(f"Channel stats document created for {creator_id}.")
                                except AppwriteException as create_err:
                                    context.error(f"Failed to create channel stats document for {creator_id}: {create_err}")
                                    stats_updated = False
                                    raise create_err  # Re-raise to be caught by the outer try-except
                            else:
                                context.error(f"Failed to get/update channel stats for {creator_id}: {e}")
                                stats_updated = False
                                raise e  # Re-raise to be caught by the outer try-except

                    # --- All Operations Succeeded, Delete Interaction Document ---
                    if subscription_updated and stats_updated:
                        context.log(f"Successfully processed interaction {interaction_id}, deleting document...")
                        databases.delete_document(
                            DATABASE_ID, 
                            ACCOUNT_INTERACTIONS_COLLECTION_ID, 
                            interaction_id
                        )
                        processed_count += 1
                        context.log(f"Interaction {interaction_id} processed and deleted.")
                    else:
                        context.log(f"Interaction {interaction_id} partially processed but document not deleted.")
                        failed_count += 1

                except AppwriteException as e:
                    if e.code == 404 and e.message.__contains__(subscriber_id):
                        context.error(f"Subscriber account document not found for {subscriber_id}. Cannot process interaction {interaction_id}.")
                    else:
                        context.error(f"Database error processing interaction {interaction_id}: {e.message}")
                    failed_count += 1
                    # Don't delete the interaction document on failure
                    
            except Exception as e:
                context.error(f"Error processing interaction {interaction_id}: {e}")
                context.error(traceback.format_exc())
                failed_count += 1
                # Don't delete the interaction document on failure

        # --- Return Summary ---
        context.log(f"Processing complete: {processed_count} processed, {failed_count} failed.")
        context.log("--- Subscriptions Manager Batch Job End (Success) ---")
        return context.res.json({
            "success": True,
            "processed": processed_count,
            "failed": failed_count,
            "totalFetched": total_fetched
        })

    except Exception as e:
        context.error(f"Unexpected error during processing: {e}")
        context.error(traceback.format_exc())
        context.log("--- Subscriptions Manager Batch Job End (Error) ---")
        return context.res.json({"success": False, "message": str(e),
                               "processed": processed_count, "failed": failed_count}, 500)
