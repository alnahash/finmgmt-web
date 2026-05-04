import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useContext } from 'react';
import { AuthContext } from '../App';
import { Shield, Copy, Download, ArrowLeft, Check } from 'lucide-react';
import {
  initiate2FASetup,
  verify2FASetup,
  generateBackupCodes,
  storeBackupCodes,
  formatBackupCode,
  validateCodeFormat,
} from '../lib/twoFactor';

type SetupStep = 'qr' | 'verify' | 'backup' | 'success';

export default function TwoFactorSetup() {
  const navigate = useNavigate();
  const auth = useContext(AuthContext);
  const location = useLocation();

  const [currentStep, setCurrentStep] = useState<SetupStep>('qr');
  const [qrCode, setQrCode] = useState<string>('');
  const [secret, setSecret] = useState<string>('');
  const [factorId, setFactorId] = useState<string>('');
  const [verificationCode, setVerificationCode] = useState<string>('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // Initialize 2FA setup on mount
  React.useEffect(() => {
    const initSetup = async () => {
      try {
        setLoading(true);
        setError('');
        const { qrCode: qr, secret: sec, factorId: fid } = await initiate2FASetup();
        setQrCode(qr);
        setSecret(sec);
        setFactorId(fid);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to initialize 2FA setup'
        );
      } finally {
        setLoading(false);
      }
    };

    initSetup();
  }, []);

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateCodeFormat(verificationCode)) {
      setError('Please enter a valid 6-digit code');
      return;
    }

    try {
      setLoading(true);
      setError('');

      // Verify code with Supabase
      await verify2FASetup(verificationCode, factorId);

      // Generate backup codes
      const codes = generateBackupCodes(8);
      setBackupCodes(codes);

      // Move to backup codes step
      setCurrentStep('backup');
      setVerificationCode('');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Invalid code. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBackupCodes = async () => {
    if (!auth.user) return;

    try {
      setLoading(true);
      setError('');

      // Store backup codes in database
      await storeBackupCodes(auth.user.id, backupCodes);

      // Move to success step
      setCurrentStep('success');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to enable 2FA'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCopyBackupCodes = () => {
    const codesText = backupCodes.join('\n');
    navigator.clipboard.writeText(codesText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadBackupCodes = () => {
    const codesText = backupCodes.join('\n');
    const element = document.createElement('a');
    element.setAttribute(
      'href',
      'data:text/plain;charset=utf-8,' + encodeURIComponent(codesText)
    );
    element.setAttribute('download', 'finmgmt_2fa_backup_codes.txt');
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleBack = () => {
    if (currentStep === 'verify' || currentStep === 'backup') {
      setCurrentStep('qr');
      setVerificationCode('');
      setError('');
    } else if (currentStep === 'qr') {
      navigate(location.state?.from || '/settings');
    }
  };

  const handleComplete = () => {
    navigate('/settings');
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
            Back
          </button>
          <div className="flex items-center gap-3 mb-4">
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

        {/* QR Code Step */}
        {currentStep === 'qr' && (
          <div className="space-y-6">
            <div>
              <div className="text-sm text-slate-400 mb-2">
                Step 1 of 3: Scan QR Code
              </div>
              <p className="text-slate-300 text-sm mb-4">
                Use Google Authenticator, Microsoft Authenticator, or any TOTP
                app to scan this QR code.
              </p>
            </div>

            {/* QR Code Display */}
            {qrCode ? (
              <div className="flex justify-center bg-white p-6 rounded-lg">
                <img
                  src={qrCode}
                  alt="2FA QR Code"
                  className="w-48 h-48"
                />
              </div>
            ) : (
              <div className="flex justify-center bg-slate-800 p-12 rounded-lg">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500"></div>
              </div>
            )}

            {/* Manual Entry */}
            {secret && (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <p className="text-sm text-slate-400 mb-2">
                  Can't scan? Enter this key manually:
                </p>
                <code className="text-primary-400 font-mono break-all text-sm">
                  {secret}
                </code>
              </div>
            )}

            <button
              onClick={() => setCurrentStep('verify')}
              disabled={loading || !qrCode}
              className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition"
            >
              {loading ? 'Loading...' : 'Next: Verify Code'}
            </button>
          </div>
        )}

        {/* Verification Code Step */}
        {currentStep === 'verify' && (
          <div className="space-y-6">
            <div>
              <div className="text-sm text-slate-400 mb-2">
                Step 2 of 3: Verify Setup
              </div>
              <p className="text-slate-300 text-sm mb-4">
                Enter the 6-digit code from your authenticator app to verify
                the setup.
              </p>
            </div>

            <form onSubmit={handleVerifyCode} className="space-y-4">
              {/* 6-digit code input */}
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">
                  Verification Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength="6"
                  placeholder="000000"
                  value={verificationCode}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setVerificationCode(val);
                  }}
                  autoFocus
                  className="w-full bg-slate-800 border border-slate-700 text-white text-center text-2xl font-mono px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition"
                />
                <p className="text-xs text-slate-400 mt-2">
                  Enter the 6-digit code displayed in your authenticator app
                </p>
              </div>

              <button
                type="submit"
                disabled={loading || verificationCode.length !== 6}
                className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition"
              >
                {loading ? 'Verifying...' : 'Verify Code'}
              </button>
            </form>

            <button
              onClick={() => setCurrentStep('qr')}
              className="w-full text-slate-400 hover:text-slate-300 py-2 transition"
            >
              Back
            </button>
          </div>
        )}

        {/* Backup Codes Step */}
        {currentStep === 'backup' && (
          <div className="space-y-6">
            <div>
              <div className="text-sm text-slate-400 mb-2">
                Step 3 of 3: Save Backup Codes
              </div>
              <p className="text-slate-300 text-sm mb-4">
                Save these codes in a safe place. You can use them to sign in if
                you lose access to your authenticator.
              </p>
            </div>

            {/* Warning */}
            <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4">
              <p className="text-yellow-200 text-sm">
                ⚠️ <strong>Save these codes now.</strong> You won't be able to see
                them again.
              </p>
            </div>

            {/* Backup Codes Display */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-3">
                {backupCodes.map((code, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-center"
                  >
                    <code className="text-slate-300 font-mono text-sm">
                      {formatBackupCode(code)}
                    </code>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleCopyBackupCodes}
                className="flex-1 flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 rounded-lg transition"
              >
                <Copy size={18} />
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button
                onClick={handleDownloadBackupCodes}
                className="flex-1 flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 rounded-lg transition"
              >
                <Download size={18} />
                Download
              </button>
            </div>

            <button
              onClick={handleSaveBackupCodes}
              disabled={loading}
              className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition"
            >
              {loading ? 'Enabling 2FA...' : "I've Saved the Codes"}
            </button>

            <button
              onClick={() => setCurrentStep('verify')}
              className="w-full text-slate-400 hover:text-slate-300 py-2 transition"
            >
              Back
            </button>
          </div>
        )}

        {/* Success Step */}
        {currentStep === 'success' && (
          <div className="space-y-6 text-center">
            <div className="flex justify-center">
              <div className="bg-green-900/30 border border-green-700 rounded-full p-4">
                <Check size={48} className="text-green-400" />
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-white mb-2">
                2FA Enabled!
              </h2>
              <p className="text-slate-400">
                Your account is now more secure. You'll need to enter a code
                from your authenticator each time you log in.
              </p>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 text-left">
              <p className="text-slate-300 text-sm">
                <strong>What's next?</strong>
              </p>
              <ul className="text-slate-400 text-sm mt-2 space-y-1 ml-4">
                <li>✓ Keep your backup codes safe</li>
                <li>✓ Test login with your authenticator</li>
                <li>✓ Update backup codes if needed</li>
              </ul>
            </div>

            <button
              onClick={handleComplete}
              className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-3 rounded-lg transition"
            >
              Go to Settings
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
