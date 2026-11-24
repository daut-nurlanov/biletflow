-- Event cover pictures. Same statement as the end of docs/schema.sql (idempotent).

-- event cover pictures uploaded by organizers (stored in the database so the
-- normal database backup also covers them)
CREATE TABLE IF NOT EXISTS event_images (
  event_id UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
  data BYTEA NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
