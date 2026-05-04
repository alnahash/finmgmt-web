/**
 * Device trust management for MFA
 * Handles "Remember this device for 7 days" functionality
 */

interface TrustedDevice {
  fingerprint: string;
  expiresAt: string; // ISO timestamp
  createdAt: string;
  deviceName?: string;
}

/**
 * Generate a simple device fingerprint
 * Uses browser user agent and screen dimensions
 */
export function generateDeviceFingerprint(): string {
  const userAgent = navigator.userAgent;
  const screenResolution = `${window.screen.width}x${window.screen.height}`;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const language = navigator.language;

  // Simple hash-like combination (not cryptographically secure, just for device identification)
  const combined = `${userAgent}|${screenResolution}|${timezone}|${language}`;
  let hash = 0;

  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return Math.abs(hash).toString(16);
}

/**
 * Save device as trusted for 7 days
 */
export function saveTrustedDevice(userId: string): TrustedDevice {
  const fingerprint = generateDeviceFingerprint();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const device: TrustedDevice = {
    fingerprint,
    expiresAt: expiresAt.toISOString(),
    createdAt: now.toISOString(),
    deviceName: getDeviceNameFromUserAgent(),
  };

  // Store in localStorage with user ID as key
  const key = `trusted_device_${userId}`;
  localStorage.setItem(key, JSON.stringify(device));

  console.log('Trusted device saved:', device);
  return device;
}

/**
 * Check if device is trusted and not expired
 */
export function isTrustedDevice(userId: string): boolean {
  const key = `trusted_device_${userId}`;
  const stored = localStorage.getItem(key);

  if (!stored) {
    return false;
  }

  try {
    const device: TrustedDevice = JSON.parse(stored);
    const now = new Date();
    const expiresAt = new Date(device.expiresAt);

    // Check if device fingerprint matches
    const currentFingerprint = generateDeviceFingerprint();
    const fingerprintMatches = device.fingerprint === currentFingerprint;

    // Check if not expired
    const notExpired = now < expiresAt;

    console.log('Device trust check:', {
      fingerprintMatches,
      notExpired,
      expiresAt: expiresAt.toLocaleString(),
    });

    return fingerprintMatches && notExpired;
  } catch (error) {
    console.error('Error parsing trusted device:', error);
    return false;
  }
}

/**
 * Get device information for this browser
 */
export function getTrustedDevice(userId: string): TrustedDevice | null {
  const key = `trusted_device_${userId}`;
  const stored = localStorage.getItem(key);

  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored);
  } catch (error) {
    return null;
  }
}

/**
 * Forget/remove trusted device
 */
export function forgetDevice(userId: string): void {
  const key = `trusted_device_${userId}`;
  localStorage.removeItem(key);
  console.log('Trusted device removed for user:', userId);
}

/**
 * Get human-readable device name from user agent
 */
function getDeviceNameFromUserAgent(): string {
  const ua = navigator.userAgent;

  if (ua.includes('Chrome')) return 'Chrome Browser';
  if (ua.includes('Firefox')) return 'Firefox Browser';
  if (ua.includes('Safari')) return 'Safari Browser';
  if (ua.includes('Edge')) return 'Edge Browser';
  if (ua.includes('iPhone')) return 'iPhone';
  if (ua.includes('iPad')) return 'iPad';
  if (ua.includes('Android')) return 'Android Device';

  return 'Unknown Device';
}

/**
 * Get days remaining until device trust expires
 */
export function getDaysUntilExpiration(userId: string): number {
  const device = getTrustedDevice(userId);
  if (!device) return 0;

  const now = new Date();
  const expiresAt = new Date(device.expiresAt);
  const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

  return Math.max(0, daysLeft);
}
