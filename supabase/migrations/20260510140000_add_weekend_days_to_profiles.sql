-- Add weekend_days column to profiles table
-- Stores day numbers for regional weekend customization
-- Default: {6,0} = Saturday and Sunday (ISO standard)
-- Examples: {5,6} = Friday and Saturday (Bahrain), {0,1} = Sunday and Monday, etc.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS weekend_days integer[] DEFAULT '{6,0}';

-- Index for potential future queries on weekend_days
CREATE INDEX IF NOT EXISTS idx_profiles_weekend_days ON profiles(weekend_days);
