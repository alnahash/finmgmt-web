import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [emailSent, setEmailSent] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    try {
      setLoading(true);
      setError('');

      // Call Supabase to send password recovery email
      // This will only send if email is registered
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      if (err) {
        throw new Error(err.message);
      }

      // Success - show message
      setSuccess(true);
      setEmailSent(email);
      setEmail('');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to send reset email';
      console.error('Password reset error:', errorMsg);
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate('/login', { replace: true });
  };

  if (success) {
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
                <Mail size={24} className="text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white">
                Password Reset
              </h1>
            </div>
          </div>

          {/* Success Message */}
          <div className="mb-6 bg-green-900/30 border border-green-700 text-green-200 px-4 py-4 rounded-lg">
            <p className="font-medium mb-2">Check your email</p>
            <p className="text-sm">
              We've sent a password reset link to <strong>{emailSent}</strong>.
              Click the link in the email to reset your password.
            </p>
          </div>

          {/* Help Text */}
          <div className="space-y-4 text-center">
            <p className="text-slate-400 text-sm">
              Didn't receive the email? Check your spam folder or try another email address.
            </p>
            <button
              onClick={handleBack}
              className="text-primary-400 hover:text-primary-300 font-medium transition"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

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
              <Mail size={24} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">
              Forgot Password?
            </h1>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-900/30 border border-red-700 text-red-200 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <p className="text-slate-300 text-sm mb-4">
              Enter your email address and we'll send you a link to reset your password.
            </p>
          </div>

          {/* Email Input */}
          <div>
            <label className="block text-slate-300 text-sm font-medium mb-2">
              Email Address
            </label>
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError('');
              }}
              disabled={loading}
              className="w-full bg-slate-800 border border-slate-700 text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !email.trim()}
            className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition"
          >
            {loading ? 'Sending Reset Link...' : 'Send Reset Link'}
          </button>
        </form>

        {/* Help Text */}
        <div className="mt-8 pt-6 border-t border-slate-700">
          <p className="text-slate-400 text-xs text-center">
            Remember your password?{' '}
            <button
              onClick={handleBack}
              className="text-primary-400 hover:text-primary-300 transition"
            >
              Back to Login
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
