import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Mail, CheckCircle, AlertCircle, Loader } from 'lucide-react'

type VerificationState = 'loading' | 'success' | 'error' | 'resend'

export default function EmailVerification() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [state, setState] = useState<VerificationState>('loading')
  const [error, setError] = useState('')
  const [resendEmail, setResendEmail] = useState('')
  const [resendLoading, setResendLoading] = useState(false)
  const [resendMessage, setResendMessage] = useState('')

  useEffect(() => {
    verifyEmail()
  }, [])

  const verifyEmail = async () => {
    try {
      const token = searchParams.get('token')
      const type = searchParams.get('type')

      if (!token || !type) {
        setError('Invalid verification link. Please check your email for the correct link.')
        setState('error')
        return
      }

      // Verify the OTP token
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: token,
        type: type as 'signup' | 'recovery' | 'invite' | 'magiclink',
      })

      if (verifyError) {
        throw verifyError
      }

      setState('success')
      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate('/login')
      }, 2000)
    } catch (err) {
      console.error('Email verification error:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to verify email'
      setError(errorMessage)
      setState('error')
    }
  }

  const handleResendEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setResendLoading(true)
    setResendMessage('')

    try {
      if (!resendEmail) {
        setError('Please enter your email address')
        return
      }

      // Resend verification email
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: resendEmail,
      })

      if (resendError) {
        throw resendError
      }

      setResendMessage('Check your email for a new verification link')
      setResendEmail('')
    } catch (err) {
      console.error('Resend email error:', err)
      setError(err instanceof Error ? err.message : 'Failed to resend email')
    } finally {
      setResendLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-slate-900 border border-slate-800 rounded-lg shadow-xl p-8">
          {/* Loading State */}
          {state === 'loading' && (
            <div className="text-center">
              <div className="flex justify-center mb-6">
                <Loader className="w-12 h-12 text-primary-500 animate-spin" />
              </div>
              <h1 className="text-3xl font-bold text-white mb-2">Verifying Email</h1>
              <p className="text-slate-400">Please wait while we verify your email...</p>
            </div>
          )}

          {/* Success State */}
          {state === 'success' && (
            <div className="text-center">
              <div className="flex justify-center mb-6">
                <CheckCircle className="w-12 h-12 text-green-400" />
              </div>
              <h1 className="text-3xl font-bold text-white mb-2">Email Verified! ✓</h1>
              <p className="text-slate-400 mb-6">
                Your email has been successfully verified. Redirecting to sign in...
              </p>
              <div className="mt-6 text-primary-500 text-sm">
                <p>If not redirected, <a href="/login" className="underline hover:text-primary-400">click here</a> to sign in</p>
              </div>
            </div>
          )}

          {/* Error State */}
          {state === 'error' && (
            <div>
              <div className="flex justify-center mb-6">
                <AlertCircle className="w-12 h-12 text-red-400" />
              </div>
              <h1 className="text-3xl font-bold text-white mb-2">Verification Failed</h1>

              <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded text-red-200 text-sm">
                {error}
              </div>

              <div className="bg-slate-800 rounded-lg p-6 mb-6">
                <h2 className="text-lg font-semibold text-white mb-4">Resend Verification Email</h2>
                <form onSubmit={handleResendEmail} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                      <input
                        type="email"
                        value={resendEmail}
                        onChange={(e) => setResendEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-primary-500"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={resendLoading}
                    className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition"
                  >
                    {resendLoading ? 'Sending...' : 'Resend Email'}
                  </button>
                </form>

                {resendMessage && (
                  <div className="mt-4 p-3 bg-green-900/30 border border-green-700 rounded text-green-200 text-sm">
                    {resendMessage}
                  </div>
                )}
              </div>

              <div className="text-center">
                <p className="text-slate-400 text-sm">
                  Remember to check your spam folder if you don't see the email
                </p>
              </div>

              <div className="mt-6 text-center">
                <a href="/login" className="text-primary-500 hover:text-primary-400 font-medium">
                  ← Back to Sign In
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
