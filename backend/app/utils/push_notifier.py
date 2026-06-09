import json
import logging
import os
import uuid
from sqlalchemy.orm import Session
from pywebpush import webpush, WebPushException
from app.models.user import PushSubscription
from app.models.notification import Notification
from typing import Any

logger = logging.getLogger(__name__)

def send_universal_push(db: Session, user_id: Any, title: str, body: str, url: str = "/"):
    """
    Finds all active mobile/desktop devices for a user and broadcasts a live Web Push Notification.
    """
    subscriptions = db.query(PushSubscription).filter(PushSubscription.user_id == user_id).all()
    
    print(f"📢 [PUSH DEBUG] Found {len(subscriptions)} active devices for user {user_id}")
    
    if not subscriptions:
        return

    vapid_private = os.getenv("VAPID_PRIVATE_KEY")
    vapid_public = os.getenv("VAPID_PUBLIC_KEY")
    vapid_email = os.getenv("VAPID_CLAIM_EMAIL", "mailto:admin@example.com")

    if not vapid_private or not vapid_public:
        print("⚠️ [PUSH DEBUG] Web Push keys missing from backend environment variables. Skipping.")
        return

    payload = {
        "title": title,
        "body": body,
        "url": url
    }

    for sub in subscriptions:
        try:
            subscription_info = {
                "endpoint": sub.endpoint,
                "keys": {
                    "p256dh": sub.p256dh,
                    "auth": sub.auth
                }
            }
            webpush(
                subscription_info=subscription_info,
                data=json.dumps(payload),
                vapid_private_key=vapid_private,
                vapid_claims={"sub": vapid_email}
            )
            print(f"🚀 [PUSH SUCCESS] Notification broadcasted to device: {sub.id}")
        except WebPushException as ex:
            if ex.response and ex.response.status_code in [404, 410]:
                db.delete(sub)
                db.commit()
                print(f"🗑️ [PUSH CLEANUP] Removed expired device token: {sub.id}")
            else:
                print(f"❌ [PUSH ERROR] Google/Apple rejected the payload: {ex}")
        except Exception as e:
            print(f"❌ [PUSH ERROR] Unexpected failure: {e}")


def create_system_notification(db: Session, user_id: Any, title: str, message: str, reference_id: str = None, reference_type: str = None, url: str = "/"):
    """
    Unified engine block: Saves notification to database AND broadcasts an OS push notification.
    """
    new_notif = Notification(
        id=uuid.uuid4(),
        user_id=user_id,
        title=title,
        message=message,
        reference_id=reference_id,
        reference_type=reference_type
    )
    db.add(new_notif)
    db.flush()
    
    try:
        # THE FIX: We pass user_id directly without str() so Postgres matches the UUID properly
        send_universal_push(
            db=db,
            user_id=user_id, 
            title=title,
            body=message,
            url=url
        )
    except Exception as push_error:
        print(f"❌ [PUSH ERROR] Dispatch bypassed gracefully: {push_error}")
        
    return new_notif