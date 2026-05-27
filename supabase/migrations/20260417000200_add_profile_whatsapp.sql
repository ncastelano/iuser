-- Add whatsapp column to profiles table if it doesn't exist
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS whatsapp TEXT;

-- Update RLS (already enabled, ensuring owner can update their own profile)
-- Assuming existing policies allow users to update their own profiles.
