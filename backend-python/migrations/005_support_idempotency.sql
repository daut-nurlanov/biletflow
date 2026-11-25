ALTER TABLE support_cases ADD COLUMN IF NOT EXISTS request_id UUID;
ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS request_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS support_cases_request
    ON support_cases(opened_by, request_id) WHERE request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS support_messages_request
    ON support_messages(case_id, sender_id, request_id) WHERE request_id IS NOT NULL;
