ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS target_type TEXT,
    ADD COLUMN IF NOT EXISTS target_id UUID,
    ADD CONSTRAINT notification_target_pair CHECK (
        (target_type IS NULL AND target_id IS NULL)
        OR (target_type IN ('event', 'organizer_event', 'support') AND target_id IS NOT NULL AND target_type IS NOT NULL)
    );
