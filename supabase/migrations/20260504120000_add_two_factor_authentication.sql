-- Add Two-Factor Authentication (2FA) support to profiles table
-- This migration adds columns to enable TOTP-based 2FA with Google Authenticator

-- Add 2FA columns to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS two_factor_verified_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS two_factor_backup_codes JSONB DEFAULT NULL;

-- Create index for faster 2FA queries
CREATE INDEX IF NOT EXISTS idx_profiles_2fa_enabled ON profiles(two_factor_enabled);

-- Add comments for documentation
COMMENT ON COLUMN profiles.two_factor_enabled IS 'Whether 2FA is enabled for this user';
COMMENT ON COLUMN profiles.two_factor_verified_at IS 'When 2FA was last verified/enabled';
COMMENT ON COLUMN profiles.two_factor_backup_codes IS 'JSON array of backup codes (encrypted by Supabase), used if user loses authenticator';

-- RLS: Existing policy "Users can manage own profiles" already covers these new columns
-- Users can only see/modify their own 2FA settings
