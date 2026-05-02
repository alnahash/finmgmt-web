import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Mail, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

export default function EmailVerification() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'verifying' | 'verified' | 'error'>('verifying')
  const [errorMessage, setErrorMessage] = useState('')
  const [canResend, setCanResend] = useState(false)
  const [resendCountdown, setResendCountdown] = useState(0)

  useEffect(() => {
    verifyEmail()
  }, [])

  // Handle resend countdown
  useEffect(() => {
    if (resendCountdown > 0) {
      const timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000)
      return () => clearTimeout(timer)
    }
    if (resendCountdown === 0 && !canResend && status === 'error') {
      setCanResend(true)
    }
  }, [resendCountdown, canResend, status])

  const verifyEmail = async () => {
    try {
      const token = searchParams.get('token')
      const type = searchParams.get('type')

      if (!token || type !== 'signup') {
        setStatus('error')
        setErrorMessage('Invalid verification link. Please check your email and try again.')
        setCanResend(true)
        return
      }

      // Extract token and verify with Supabase
      const { error } = await supabase.auth.verifyOtp({
        token_hash: token,
        type: 'signup',
      })

      if (error) {
        setStatus('error')
        setErrorMessage(error.message || 'Failed to verify email. The link may have expired.')
        setCanResend(true)
        return
      }

      setStatus('verified')
      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate('/login', { replace: true })
      }, 2000)
    } catch (error) {
      console.error('Verification error:', error)
      setStatus('error')
      setErrorMessage('An unexpected error occurred. Please try again.')
      setCanResend(true)
    }
  }

  const handleResend = async () => {
    setCanResend(false)
    setResendCountdown(60)
    setStatus('verifying')

    try {
      const email = localStorage.getItem('pending_verification_email')
      if (!email) {
        setStatus('error')
        setErrorMessage('Email not found. Please try signing up again.')
        setCanResend(true)
        return
      }

      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email,
      })

      if (error) {
        setStatus('error')
        setErrorMessage(error.message || 'Failed to resend verification email.')
        setCanResend(true)
        setResendCountdown(0)
        return
      }

      setStatus('error')
      setErrorMessage('Verification email resent! Check your inbox.')
      setResendCountdown(60)
    } catch (error) {
      console.error('Resend error:', error)
      setStatus('error')
      setErrorMessage('Failed to resend email. Please try again.')
      setCanResend(true)
      setResendCountdown(0)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-block p-3 bg-primary-500/20 rounded-full mb-4">
            <Mail className="w-8 h-8 text-primary-500" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Email Verification</h1>
        </div>

        {/* Verifying State */}
        {status === 'verifying' && (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
            <div className="flex justify-center mb-4">
              <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
            </div>
            <p className="text-slate-300">Verifying your email...</p>
          </div>
        )}

        {/* Verified State */}
        {status === 'verified' && (
          <div className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30 rounded-lg p-8 text-center">
            <div className="flex justify-center mb-4">
              <CheckCircle className="w-12 h-12 text-green-500" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Email Verified!</h2>
            <p className="text-slate-300 mb-4">
              Your email has been successfully verified. Redirecting to login...
            </p>
            <div className="flex justify-center">
              <div className="animate-spin h-4 w-4 border-2 border-green-500 border-t-transparent rounded-full"></div>
            </div>
          </div>
        )}

        {/* Error State */}
        {status === 'error' && (
          <div className="bg-gradient-to-br from-red-500/20 to-rose-500/20 border border-red-500/30 rounded-lg p-8">
            <div className="flex justify-center mb-4">
              <AlertCircle className="w-12 h-12 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2 text-center">Verification Error</h2>
            <p className="text-slate-300 mb-6 text-center">{errorMessage}</p>

            <div className="space-y-3">
              {canResend ? (
                <button
                  onClick={handleResend}
                  className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 rounded-lg transition"
                >
                  Resend Verification Email
                </button>
              ) : (
                <button
                  disabled
                  className="w-full bg-slate-700 text-slate-400 font-semibold py-3 rounded-lg cursor-not-allowed"
                >
                  Resend in {resendCountdown}s
                </button>
              )}

              <a
                href="/login"
                className="block text-center text-primary-500 hover:text-primary-400 font-semibold py-3 transition"
              >
                Back to Login
              </a>
            </div>
          </div>
        )}

        {/* Help Text */}
        <div className="mt-8 text-center text-sm text-slate-400">
          <p>
            Check your spam folder if you don't see the verification email.
          </p>
        </div>
      </div>
    </div>
  )
}
