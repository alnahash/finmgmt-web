import { supabase } from './supabase';

/**
 * Two-Factor Authentication (2FA) utilities
 * Handles TOTP-based 2FA setup, verification, and management using Supabase Auth MFA
 */

export interface MFAEnrollmentResponse {
  qrCode: string;
  secret: string;
  factorId: string;
}

export interface BackupCodesResponse {
  codes: string[];
}

/**
 * Initiate 2FA setup - generates QR code for user to scan with Google Authenticator
 */
export async function initiate2FASetup(): Promise<MFAEnrollmentResponse> {
  try {
    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error('User not authenticated');
    }

    // Enroll in MFA (TOTP)
    const { data, error } = await supabase.auth.mfa.enroll({
      issuerName: 'FinMgmt',
      friendlyName: `FinMgmt 2FA - ${user.email}`,
    });

    if (error) {
      throw new Error(`Failed to initiate 2FA: ${error.message}`);
    }

    if (!data || !data.totp) {
      throw new Error('Failed to generate QR code');
    }

    return {
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
      factorId: data.id,
    };
  } catch (error) {
    console.error('Error initiating 2FA setup:', error);
    throw error;
  }
}

/**
 * Verify the 6-digit code during 2FA setup
 */
export async function verify2FASetup(
  code: string,
  factorId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code,
    });

    if (error) {
      throw new Error(`Verification failed: ${error.message}`);
    }

    if (!data) {
      throw new Error('Verification response is empty');
    }

    return true;
  } catch (error) {
    console.error('Error verifying 2FA code:', error);
    throw error;
  }
}

/**
 * Generate 8 backup codes for account recovery
 * These are used if the user loses access to their authenticator
 */
export function generateBackupCodes(count: number = 8): string[] {
  const codes: string[] = [];

  for (let i = 0; i < count; i++) {
    // Generate 8-character alphanumeric codes
    // Format: XXXX-XXXX for readability
    const part1 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const part2 = Math.random().toString(36).substring(2, 6).toUpperCase();
    codes.push(`${part1}-${part2}`);
  }

  // Ensure unique codes (very low chance of collision, but be safe)
  const uniqueCodes = Array.from(new Set(codes));
  if (uniqueCodes.length < count) {
    return generateBackupCodes(count);
  }

  return uniqueCodes;
}

/**
 * Store backup codes in the database (encrypted by Supabase)
 * Also marks 2FA as enabled and sets verification timestamp
 */
export async function storeBackupCodes(
  userId: string,
  codes: string[]
): Promise<void> {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        two_factor_enabled: true,
        two_factor_verified_at: new Date().toISOString(),
        two_factor_backup_codes: codes,
      })
      .eq('id', userId);

    if (error) {
      throw new Error(`Failed to store backup codes: ${error.message}`);
    }
  } catch (error) {
    console.error('Error storing backup codes:', error);
    throw error;
  }
}

/**
 * Verify TOTP code during login
 * This is called when user logs in with 2FA enabled
 */
export async function verifyTOTPCode(
  code: string,
  factorId: string
): Promise<boolean> {
  try {
    // Remove hyphens if user included them
    const cleanCode = code.replace(/\D/g, '');

    if (cleanCode.length !== 6) {
      throw new Error('Code must be 6 digits');
    }

    const { data, error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: cleanCode,
    });

    if (error) {
      throw new Error(`Invalid or expired code: ${error.message}`);
    }

    if (!data) {
      throw new Error('Verification failed');
    }

    return true;
  } catch (error) {
    console.error('Error verifying TOTP code:', error);
    throw error;
  }
}

/**
 * Use a backup code for login/account recovery
 * Backup codes can only be used once, then they're deleted
 */
export async function useBackupCode(userId: string, code: string): Promise<number> {
  try {
    // Fetch current backup codes
    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('two_factor_backup_codes')
      .eq('id', userId)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch backup codes: ${fetchError.message}`);
    }

    const codes = (profile?.two_factor_backup_codes as string[]) || [];

    // Check if backup code is valid (case-insensitive)
    const codeIndex = codes.findIndex(
      (c) => c.toUpperCase() === code.toUpperCase()
    );

    if (codeIndex === -1) {
      throw new Error('Invalid backup code');
    }

    // Remove used code
    const remainingCodes = codes.filter((_, idx) => idx !== codeIndex);

    // Update database with remaining codes
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        two_factor_backup_codes: remainingCodes.length > 0 ? remainingCodes : null,
      })
      .eq('id', userId);

    if (updateError) {
      throw new Error(`Failed to use backup code: ${updateError.message}`);
    }

    return remainingCodes.length;
  } catch (error) {
    console.error('Error using backup code:', error);
    throw error;
  }
}

/**
 * Disable 2FA for a user
 * Requires password confirmation (should be handled by caller)
 */
export async function disable2FA(userId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        two_factor_enabled: false,
        two_factor_verified_at: null,
        two_factor_backup_codes: null,
      })
      .eq('id', userId);

    if (error) {
      throw new Error(`Failed to disable 2FA: ${error.message}`);
    }
  } catch (error) {
    console.error('Error disabling 2FA:', error);
    throw error;
  }
}

/**
 * Check if 2FA is enabled for a user
 */
export async function is2FAEnabled(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('two_factor_enabled')
      .eq('id', userId)
      .single();

    if (error) {
      throw new Error(`Failed to check 2FA status: ${error.message}`);
    }

    return data?.two_factor_enabled || false;
  } catch (error) {
    console.error('Error checking 2FA status:', error);
    return false;
  }
}

/**
 * Get backup codes for display (without actually using them)
 * Used in Settings page to show user their backup codes
 */
export async function getBackupCodes(userId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('two_factor_backup_codes')
      .eq('id', userId)
      .single();

    if (error) {
      throw new Error(`Failed to get backup codes: ${error.message}`);
    }

    return (data?.two_factor_backup_codes as string[]) || [];
  } catch (error) {
    console.error('Error getting backup codes:', error);
    return [];
  }
}

/**
 * Validate 6-digit code format (used for client-side validation)
 */
export function validateCodeFormat(code: string): boolean {
  const cleanCode = code.replace(/\D/g, '');
  return cleanCode.length === 6;
}

/**
 * Format backup code for display (add hyphens)
 */
export function formatBackupCode(code: string): string {
  // Remove existing hyphens
  const clean = code.replace(/[^A-Z0-9]/g, '');
  // Add hyphen in the middle if not present
  if (clean.length === 8) {
    return `${clean.substring(0, 4)}-${clean.substring(4)}`;
  }
  return code;
}
