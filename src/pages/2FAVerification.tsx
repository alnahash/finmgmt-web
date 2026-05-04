import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useContext } from 'react';
import { AuthContext } from '../App';
import { Shield, ArrowLeft } from 'lucide-react';
import { verifyTOTPCode, useBackupCode, validateCodeFormat } from '../lib/twoFactor';

type VerificationMode = 'totp' | 'backup';

export default function TwoFactorVerification() {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useContext(AuthContext);

  const [mode, setMode] = useState<VerificationMode>('totp');
  const [code, setCode] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [attemptCount, setAttemptCount] = useState(0);

  // Get factorId from location state (passed from login page)
  const factorId = (location.state as any)?.factorId;

  if (!factorId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 to-slate-900 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-red-400 mb-4">
            Session error. Please log in again.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="text-primary-400 hover:text-primary-300"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  const handleVerifyTOTP = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateCodeFormat(code)) {
      setError('Please enter a valid 6-digit code');
      return;
    }

    if (attemptCount >= 5) {
      setError(
        'Too many failed attempts. Please log in again and try again later.'
      );
      return;
    }

    try {
      setLoading(true);
      setError('');

      // Verify TOTP code with Supabase
      await verifyTOTPCode(code, factorId);

      // Success - redirect to dashboard
      navigate('/', { replace: true });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Invalid code. Please try again.'
      );
      setAttemptCount((prev) => prev + 1);
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyBackupCode = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!code.trim()) {
      setError('Please enter a backup code');
      return;
    }

    if (!auth.user) {
      setError('User session not found. Please log in again.');
      return;
    }

    try {
      setLoading(true);
      setError('');

      // Use backup code for authentication
      await useBackupCode(auth.user.id, code);

      // Success - redirect to dashboard
      navigate('/', { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Invalid backup code. Try again.'
      );
      setAttemptCount((prev) => prev + 1);
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 to-slate-900 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-slate-400 hover:text-slate-300 mb-6 transition"
          >
            <ArrowLeft size={20} />
            Back to Login
          </button>
          <div className="flex items-center gap-3">
            <div className="bg-primary-600 p-3 rounded-lg">
              <Shield size={24} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">
              Two-Factor Authentication
            </h1>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-900/30 border border-red-700 text-red-200 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Attempt Counter Warning */}
        {attemptCount > 2 && (
          <div className="mb-6 bg-yellow-900/30 border border-yellow-700 text-yellow-200 px-4 py-3 rounded-lg text-sm">
            {attemptCount} invalid attempts. {5 - attemptCount} remaining.
          </div>
        )}

        {/* TOTP Mode */}
        {mode === 'totp' && (
          <div className="space-y-6">
            <div>
              <p className="text-slate-300 text-sm mb-4">
                Enter the 6-digit code from your authenticator app to continue.
              </p>
            </div>

            <form onSubmit={handleVerifyTOTP} className="space-y-4">
              {/* 6-digit code input */}
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">
                  Authentication Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setCode(val);
                  }}
                  autoFocus
                  disabled={loading || attemptCount >= 5}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-center text-3xl font-mono tracking-widest px-4 py-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              <button
                type="submit"
                disabled={loading || code.length !== 6 || attemptCount >= 5}
                className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition"
              >
                {loading ? 'Verifying...' : 'Verify'}
              </button>
            </form>

            {/* Backup Code Fallback */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-700"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-gradient-to-br from-slate-950 to-slate-900 text-slate-400">
                  or
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setMode('backup');
                setCode('');
                setError('');
              }}
              className="w-full text-primary-400 hover:text-primary-300 font-medium py-3 transition"
            >
              Use a Backup Code Instead
            </button>
          </div>
        )}

        {/* Backup Code Mode */}
        {mode === 'backup' && (
          <div className="space-y-6">
            <div>
              <p className="text-slate-300 text-sm mb-4">
                Enter one of your backup codes to sign in.
              </p>
            </div>

            <form onSubmit={handleVerifyBackupCode} className="space-y-4">
              {/* Backup code input */}
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">
                  Backup Code
                </label>
                <input
                  type="text"
                  placeholder="XXXX-XXXX"
                  value={code}
                  onChange={(e) => {
                    const val = e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9\-]/g, '');
                    setCode(val);
                  }}
                  autoFocus
                  disabled={loading || attemptCount >= 5}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-center text-lg font-mono px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <p className="text-xs text-slate-400 mt-2">
                  (Format: XXXX-XXXX)
                </p>
              </div>

              <button
                type="submit"
                disabled={loading || !code.trim() || attemptCount >= 5}
                className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition"
              >
                {loading ? 'Verifying...' : 'Use Code'}
              </button>
            </form>

            {/* Back to TOTP */}
            <button
              type="button"
              onClick={() => {
                setMode('totp');
                setCode('');
                setError('');
              }}
              className="w-full text-primary-400 hover:text-primary-300 font-medium py-3 transition"
            >
              Back to Authenticator Code
            </button>
          </div>
        )}

        {/* Help Text */}
        <div className="mt-8 pt-6 border-t border-slate-700">
          <p className="text-slate-400 text-xs text-center">
            Lost access to your authenticator?{' '}
            <a
              href="mailto:support@finmgmt.app"
              className="text-primary-400 hover:text-primary-300 transition"
            >
              Contact Support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
