from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from db import tx
from security import current_user

router = APIRouter()


@router.get("/api/notifications")
def list_notifications(unread_only: bool = False, user=Depends(current_user)):
    with tx() as cur:
        cur.execute(
            """SELECT * FROM notifications WHERE user_id = %s AND (%s = false OR is_read = false)
               ORDER BY created_at DESC LIMIT 100""", (user["id"], unread_only))
        return cur.fetchall()


@router.post("/api/notifications/read-all")
def mark_all_read(user=Depends(current_user)):
    with tx() as cur:
        cur.execute("UPDATE notifications SET is_read = true WHERE user_id = %s AND is_read = false", (user["id"],))
        return {"marked_read": cur.rowcount}


@router.post("/api/notifications/{notification_id}/read")
def mark_read(notification_id: UUID, user=Depends(current_user)):
    with tx() as cur:
        cur.execute("""UPDATE notifications SET is_read = true
                       WHERE id = %s AND user_id = %s RETURNING id, is_read""",
                    (str(notification_id), user["id"]))
        item = cur.fetchone()
        if item is None:
            raise HTTPException(status_code=404, detail="Notification not found")
        return item
