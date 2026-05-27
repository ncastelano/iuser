-- Add whatsapp column to stores table
ALTER TABLE stores ADD COLUMN IF NOT EXISTS whatsapp TEXT;

-- Update RLS if needed (already enabled, but let's ensure)
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;

-- Note: No special policies needed for this column specifically, 
-- existing store policies cover reading and writing.
