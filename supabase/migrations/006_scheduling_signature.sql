-- Add scheduling and signature fields to visits
ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS signature_url text;

-- Update VisitStatus to include 'scheduled'
ALTER TYPE visit_status ADD VALUE IF NOT EXISTS 'scheduled';
