import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function ResetPassword() {
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);

  // Validate token on mount
  React.useEffect(() => {
    const validateToken = async () => {
      try {
        // Supabase should have already verified the token from the URL
        // Just check if we have a valid session
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
          setTokenValid(true);
        } else {
          setError('Reset link is invalid or has expired. Please request a new one.');
          setTokenValid(false);
        }
      } catch (err) {
        console.error('Token validation error:', err);
        setError('Failed to validate reset link.');
        setTokenValid(false);
      } finally {
        setValidating(false);
      }
    };

    validateToken();
  }, []);

  // Calculate password strength
  const calculatePasswordStrength = (pwd: string) => {
    let strength = 0;
    const checks = {
      length6: pwd.length >= 6,
      length8: pwd.length >= 8,
      uppercase: /[A-Z]/.test(pwd),
      lowercase: /[a-z]/.test(pwd),
      number: /\d/.test(pwd),
      special: /[@$!%*?&]/.test(pwd),
    };

    Object.values(checks).forEach(check => {
      if (check) strength++;
    });

    const level = strength <= 2 ? 'weak' : strength <= 4 ? 'medium' : 'strong';
    const color = level === 'weak' ? 'bg-red-500' : level === 'medium' ? 'bg-yellow-500' : 'bg-green-500';

    return { strength, level, color, checks };
  };

  const passwordStrength = calculatePasswordStrength(password);
  const passwordsMatch = password === confirmPassword && password.length > 0;

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password.trim()) {
      setError('Please enter a new password');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (!passwordsMatch) {
      setError('Passwords do not match');
      return;
    }

    try {
      setLoading(true);
      setError('');

      // Update password
      const { error: err } = await supabase.auth.updateUser({
        password: password,
      });

      if (err) {
        throw new Error(err.message);
      }

      // Success
      setSuccess(true);

      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 2000);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to reset password';
      console.error('Password reset error:', errorMsg);
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 to-slate-900 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500 mx-auto"></div>
          <p className="text-slate-400 mt-4">Validating reset link...</p>
        </div>
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 to-slate-900 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-red-400 mb-4">
            {error || 'Reset link is invalid or has expired.'}
          </p>
          <button
            onClick={() => navigate('/forgot-password')}
            className="text-primary-400 hover:text-primary-300"
          >
            Request a new reset link
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 to-slate-900 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md text-center">
          <div className="mb-6">
            <div className="bg-green-600 p-3 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
              <Lock size={32} className="text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Password Reset</h1>
          <p className="text-slate-300 mb-6">
            Your password has been successfully reset. Redirecting to login...
          </p>
          <button
            onClick={() => navigate('/login')}
            className="text-primary-400 hover:text-primary-300"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 to-slate-900 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div className="bg-primary-600 p-3 rounded-lg">
              <Lock size={24} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">
              Reset Password
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
        <form onSubmit={handleResetPassword} className="space-y-6">
          {/* New Password */}
          <div>
            <label className="block text-slate-300 text-sm font-medium mb-2">
              New Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter new password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                disabled={loading}
                className="w-full bg-slate-800 border border-slate-700 text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition disabled:opacity-50 disabled:cursor-not-allowed pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-300"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>

            {/* Password Strength Indicator */}
            {password && (
              <div className="mt-2 space-y-2">
                <div className="flex gap-1">
                  {[...Array(6)].map((_, i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded ${
                        i < passwordStrength.strength
                          ? passwordStrength.color
                          : 'bg-slate-700'
                      }`}
                    />
                  ))}
                </div>
                <p className={`text-xs font-medium ${
                  passwordStrength.level === 'weak'
                    ? 'text-red-400'
                    : passwordStrength.level === 'medium'
                    ? 'text-yellow-400'
                    : 'text-green-400'
                }`}>
                  {passwordStrength.level === 'weak'
                    ? 'Weak - Add uppercase, numbers, or special characters'
                    : passwordStrength.level === 'medium'
                    ? 'Medium - Add more variety'
                    : 'Strong password'}
                </p>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-slate-300 text-sm font-medium mb-2">
              Confirm Password
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setError('');
                }}
                disabled={loading}
                className="w-full bg-slate-800 border border-slate-700 text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition disabled:opacity-50 disabled:cursor-not-allowed pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-300"
              >
                {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>

            {/* Password Match Indicator */}
            {confirmPassword && (
              <p className={`text-xs font-medium mt-2 ${
                passwordsMatch ? 'text-green-400' : 'text-red-400'
              }`}>
                {passwordsMatch ? '✓ Passwords match' : '✗ Passwords do not match'}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !passwordsMatch || passwordStrength.level === 'weak'}
            className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition"
          >
            {loading ? 'Resetting Password...' : 'Reset Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
