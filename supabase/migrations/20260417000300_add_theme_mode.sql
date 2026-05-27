-- Add theme_mode column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS theme_mode TEXT DEFAULT 'dark';

-- Update schema cache
NOTIFY pgrst, 'reload schema';
