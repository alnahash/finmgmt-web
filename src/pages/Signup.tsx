import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Mail, Lock, User, Eye, EyeOff, Check, X } from 'lucide-react'

interface ValidationState {
  fullName: { isValid: boolean; error: string }
  email: { isValid: boolean; error: string }
  password: { isValid: boolean; strength: 'weak' | 'medium' | 'strong'; error: string; criteria: boolean[] }
  confirmPassword: { isValid: boolean; error: string }
  terms: { isValid: boolean; error: string }
}

export default function Signup() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [agreeToTerms, setAgreeToTerms] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showVerificationMessage, setShowVerificationMessage] = useState(false)
  const [validation, setValidation] = useState<ValidationState>({
    fullName: { isValid: false, error: '' },
    email: { isValid: false, error: '' },
    password: { isValid: false, strength: 'weak', error: '', criteria: [false, false, false, false, false, false] },
    confirmPassword: { isValid: false, error: '' },
    terms: { isValid: false, error: '' },
  })

  // Password strength calculator
  const calculatePasswordStrength = (pwd: string) => {
    const criteria = [
      pwd.length >= 6,
      pwd.length >= 8,
      /[A-Z]/.test(pwd),
      /[a-z]/.test(pwd),
      /\d/.test(pwd),
      /[@$!%*?&]/.test(pwd),
    ]

    const metCount = criteria.filter(Boolean).length
    let strength: 'weak' | 'medium' | 'strong' = 'weak'
    if (metCount >= 5) strength = 'strong'
    else if (metCount >= 3) strength = 'medium'

    return { strength, criteria }
  }

  // Validation functions
  const validateFullName = (name: string) => {
    if (!name.trim()) {
      return { isValid: false, error: 'Full name is required' }
    }
    if (name.trim().length < 2) {
      return { isValid: false, error: 'Name must be at least 2 characters' }
    }
    return { isValid: true, error: '' }
  }

  const validateEmail = (mail: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!mail) {
      return { isValid: false, error: 'Email is required' }
    }
    if (!emailRegex.test(mail)) {
      return { isValid: false, error: 'Enter a valid email address' }
    }
    return { isValid: true, error: '' }
  }

  const validatePassword = (pwd: string) => {
    const { strength, criteria } = calculatePasswordStrength(pwd)
    if (!pwd) {
      return { isValid: false, strength, error: 'Password is required', criteria }
    }
    if (pwd.length < 6) {
      return { isValid: false, strength, error: 'Password must be at least 6 characters', criteria }
    }
    return { isValid: true, strength, error: '', criteria }
  }

  const validatePasswordMatch = (pwd: string, confirm: string) => {
    if (!confirm && pwd) {
      return { isValid: false, error: 'Please confirm your password' }
    }
    if (pwd !== confirm) {
      return { isValid: false, error: "Passwords don't match" }
    }
    return { isValid: true, error: '' }
  }

  const validateTerms = (agreed: boolean) => {
    if (!agreed) {
      return { isValid: false, error: 'You must accept the terms' }
    }
    return { isValid: true, error: '' }
  }

  // Handle input changes with real-time validation
  const handleFullNameChange = (value: string) => {
    setFullName(value)
    setValidation({
      ...validation,
      fullName: validateFullName(value),
    })
  }

  const handleEmailChange = (value: string) => {
    setEmail(value)
    setValidation({
      ...validation,
      email: validateEmail(value),
    })
  }

  const handlePasswordChange = (value: string) => {
    setPassword(value)
    const pwdValidation = validatePassword(value)
    const confirmValidation = confirmPassword ? validatePasswordMatch(value, confirmPassword) : { isValid: false, error: '' }
    setValidation({
      ...validation,
      password: pwdValidation,
      confirmPassword: confirmValidation,
    })
  }

  const handleConfirmPasswordChange = (value: string) => {
    setConfirmPassword(value)
    setValidation({
      ...validation,
      confirmPassword: validatePasswordMatch(password, value),
    })
  }

  const handleTermsChange = (checked: boolean) => {
    setAgreeToTerms(checked)
    setValidation({
      ...validation,
      terms: validateTerms(checked),
    })
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Validate all fields
    const fullNameVal = validateFullName(fullName)
    const emailVal = validateEmail(email)
    const passwordVal = validatePassword(password)
    const confirmVal = validatePasswordMatch(password, confirmPassword)
    const termsVal = validateTerms(agreeToTerms)

    setValidation({
      fullName: fullNameVal,
      email: emailVal,
      password: passwordVal,
      confirmPassword: confirmVal,
      terms: termsVal,
    })

    if (!fullNameVal.isValid || !emailVal.isValid || !passwordVal.isValid || !confirmVal.isValid || !termsVal.isValid) {
      setError('Please fix the errors above')
      return
    }

    setLoading(true)

    try {
      // Sign up with Supabase
      const { data, error: signupError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      })

      if (signupError) throw signupError

      const user = data.user
      if (user) {
        // Create profile
        const { error: profileError } = await supabase.from('profiles').upsert([
          {
            id: user.id,
            full_name: fullName,
            email,
            onboarded: false,
          },
        ])
        if (profileError) throw profileError
      }

      // Show verification message
      setShowVerificationMessage(true)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to sign up'
      setError(errorMsg)
      console.error('Signup error:', err)
    } finally {
      setLoading(false)
    }
  }

  // Strength bar colors
  const getStrengthColor = () => {
    if (!password) return 'bg-slate-700'
    switch (validation.password.strength) {
      case 'weak':
        return 'bg-red-500'
      case 'medium':
        return 'bg-yellow-500'
      case 'strong':
        return 'bg-green-500'
    }
  }

  const getStrengthPercent = () => {
    if (!password) return 0
    const metCount = validation.password.criteria.filter(Boolean).length
    return (metCount / 6) * 100
  }

  if (showVerificationMessage) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow-xl p-8">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-green-900/30 border border-green-700 flex items-center justify-center">
                <Check className="w-6 h-6 text-green-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Check Your Email!</h2>
              <p className="text-slate-400 mb-6">
                We've sent a verification link to <span className="font-semibold text-white">{email}</span>
              </p>

              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-6">
                <p className="text-sm text-slate-300">
                  Please click the link in the email to verify your account. If you don't see it, check your spam folder.
                </p>
              </div>

              <div className="space-y-3">
                <Link
                  to="/login"
                  className="block w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 rounded-lg transition text-center"
                >
                  Go to Sign In
                </Link>
              </div>

              <div className="mt-4 text-center">
                <p className="text-slate-400 text-sm">
                  Didn't receive an email?{' '}
                  <Link to="/auth/confirm" className="text-primary-500 hover:text-primary-400 font-medium">
                    Resend it here
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-slate-900 border border-slate-800 rounded-lg shadow-xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-primary-500 mb-2">FinMgmt</h1>
            <p className="text-slate-400">Create Your Account</p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded text-red-200 text-sm">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSignup} className="space-y-4">
            {/* Full Name */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => handleFullNameChange(e.target.value)}
                  placeholder="John Doe"
                  className="w-full pl-10 pr-10 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-primary-500"
                  required
                />
                {fullName && (
                  <div className="absolute right-3 top-3">
                    {validation.fullName.isValid ? (
                      <Check className="w-5 h-5 text-green-400" />
                    ) : (
                      <X className="w-5 h-5 text-red-400" />
                    )}
                  </div>
                )}
              </div>
              {validation.fullName.error && (
                <p className="text-xs text-red-400 mt-1">{validation.fullName.error}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-10 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-primary-500"
                  required
                />
                {email && (
                  <div className="absolute right-3 top-3">
                    {validation.email.isValid ? (
                      <Check className="w-5 h-5 text-green-400" />
                    ) : (
                      <X className="w-5 h-5 text-red-400" />
                    )}
                  </div>
                )}
              </div>
              {validation.email.error && (
                <p className="text-xs text-red-400 mt-1">{validation.email.error}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => handlePasswordChange(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-primary-500"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>

              {/* Password Strength Bar */}
              {password && (
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-400">Password Strength</span>
                    <span className={`text-xs font-medium ${
                      validation.password.strength === 'strong'
                        ? 'text-green-400'
                        : validation.password.strength === 'medium'
                          ? 'text-yellow-400'
                          : 'text-red-400'
                    }`}>
                      {validation.password.strength === 'strong'
                        ? 'Strong'
                        : validation.password.strength === 'medium'
                          ? 'Medium'
                          : 'Weak'}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getStrengthColor()} transition-all`}
                      style={{ width: `${getStrengthPercent()}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {validation.password.error && (
                <p className="text-xs text-red-400 mt-1">{validation.password.error}</p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => handleConfirmPasswordChange(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-primary-500"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-300"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {confirmPassword && (
                <div className="absolute right-3 top-3">
                  {validation.confirmPassword.isValid ? (
                    <Check className="w-5 h-5 text-green-400" />
                  ) : (
                    <X className="w-5 h-5 text-red-400" />
                  )}
                </div>
              )}
              {validation.confirmPassword.error && (
                <p className="text-xs text-red-400 mt-1">{validation.confirmPassword.error}</p>
              )}
            </div>

            {/* Terms Checkbox */}
            <div className="flex items-start space-x-2">
              <input
                type="checkbox"
                id="terms"
                checked={agreeToTerms}
                onChange={(e) => handleTermsChange(e.target.checked)}
                className="w-4 h-4 mt-1 bg-slate-800 border border-slate-600 rounded cursor-pointer"
              />
              <label htmlFor="terms" className="text-sm text-slate-400 cursor-pointer">
                I agree to the{' '}
                <a href="#" className="text-primary-500 hover:text-primary-400 font-medium">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="#" className="text-primary-500 hover:text-primary-400 font-medium">
                  Privacy Policy
                </a>
              </label>
            </div>
            {validation.terms.error && (
              <p className="text-xs text-red-400">{validation.terms.error}</p>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !validation.fullName.isValid || !validation.email.isValid || !validation.password.isValid || !validation.confirmPassword.isValid || !validation.terms.isValid}
              className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 rounded-lg transition"
            >
              {loading ? 'Creating Account...' : 'Sign Up'}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-slate-400 text-sm">
              Already have an account?{' '}
              <Link to="/login" className="text-primary-500 hover:text-primary-400 font-medium">
                Login
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
