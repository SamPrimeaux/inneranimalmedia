-- 1018: Honest deploy/phone-loop email receipts — store Resend message id on the notification row.
-- status='sent' is only meaningful when resend_message_id (or a real provider id) is present.

ALTER TABLE deployment_notifications
  ADD COLUMN resend_message_id TEXT;

CREATE INDEX IF NOT EXISTS idx_deployment_notifications_resend_message_id
  ON deployment_notifications (resend_message_id)
  WHERE resend_message_id IS NOT NULL;
