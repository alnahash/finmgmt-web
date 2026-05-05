import { useEffect, useState, createContext } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import type { User } from '@supabase/supabase-js'

// Pages
import Login from './pages/Login'
import Signup from './pages/Signup'
import EmailVerification from './pages/EmailVerification'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import TwoFactorSetup from './pages/2FASetup'
import TwoFactorVerification from './pages/2FAVerification'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Categories from './pages/Categories'
import Budgets from './pages/Budgets'
import Analytics from './pages/Analytics'
import SpendingVsSaving from './pages/SpendingVsSaving'
import Settings from './pages/Settings'
import AdminPanel from './pages/AdminPanel'
import Onboarding from './pages/Onboarding'
import FinAI from './pages/FinAI'
import Insights from './pages/Insights'

// 2FA utilities
import { is2FAEnabled } from './lib/twoFactor'
import { isTrustedDevice } from './lib/deviceTrust'

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<{
  user: User | null
  loading: boolean
  isAdmin: boolean
}>({
  user: null,
  loading: true,
  isAdmin: false,
})

// eslint-disable-next-line react-refresh/only-export-components
export const ThemeContext = createContext<{
  theme: 'light' | 'dark'
  setTheme: (theme: 'light' | 'dark') => void
}>({
  theme: 'dark',
  setTheme: () => {},
})

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [theme, setThemeState] = useState<'light' | 'dark'>('dark')
  const [onboarded, setOnboarded] = useState<boolean | null>(null)
  const [twoFactorEnabled, setTwoFactorEnabled] = useState<boolean | null>(null)
  const [twoFactorVerified, setTwoFactorVerified] = useState(false)

  useEffect(() => {
    // Check if user is logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null)
      checkAdmin(session?.user?.email, session?.user?.id)
      if (session?.user?.id) {
        checkOnboardingStatus(session.user.id)
        check2FAStatus(session.user.id)
      }
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Only update user state if the user ID actually changed (prevent unnecessary re-renders)
      setUser((prevUser) => {
        const newUser = session?.user || null
        const prevUserId = prevUser?.id
        const newUserId = newUser?.id

        // Only update if user ID changed
        if (prevUserId !== newUserId) {
          return newUser
        }
        return prevUser
      })

      checkAdmin(session?.user?.email, session?.user?.id)
      if (session?.user) {
        fetchAndSetTheme(session.user.id)
        checkOnboardingStatus(session.user.id)
        check2FAStatus(session.user.id)
      } else {
        setOnboarded(null)
        setTwoFactorEnabled(null)
        setTwoFactorVerified(false)
      }
      if (event === 'SIGNED_IN' && session?.user) {
        supabase.from('login_events').insert({
          user_id: session.user.id,
          user_agent: navigator.userAgent,
        }).then(() => {})
      }
    })

    return () => subscription?.unsubscribe()
  }, [])

  const checkOnboardingStatus = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('onboarded')
        .eq('id', userId)
        .single()

      // If profile doesn't exist (user was deleted), sign out the user
      if (error?.code === 'PGRST116') {
        console.log('Profile not found - user may have been deleted. Signing out...')
        await supabase.auth.signOut()
        return
      }

      if (error) throw error

      const onboardedStatus = data?.onboarded || false
      console.log('Onboarding status:', onboardedStatus)

      // Only update state if the value has changed to prevent unnecessary re-renders
      setOnboarded((prevStatus) => {
        if (prevStatus !== onboardedStatus) {
          return onboardedStatus
        }
        return prevStatus
      })
    } catch (error) {
      console.error('Error checking onboarding status:', error)
      // If there's an error, sign out to prevent being stuck in onboarding
      await supabase.auth.signOut()
    }
  }

  const check2FAStatus = async (userId: string) => {
    try {
      const enabled = await is2FAEnabled(userId)
      console.log('2FA enabled:', enabled)
      setTwoFactorEnabled(enabled)

      // Check if 2FA verification was just completed
      const verified = localStorage.getItem('2fa_verified') === 'true'
      console.log('2FA verified from localStorage:', verified)

      // Check if device is trusted
      const isTrusted = isTrustedDevice(userId)
      console.log('Device is trusted:', isTrusted)

      // If 2FA is not enabled, mark as verified (no need to verify)
      if (!enabled) {
        console.log('2FA not enabled - marking as verified')
        setTwoFactorVerified(true)
        localStorage.removeItem('2fa_verified')
      } else if (verified) {
        // User just completed 2FA verification
        console.log('2FA verification was just completed - marking as verified')
        setTwoFactorVerified(true)
        localStorage.removeItem('2fa_verified')
      } else if (isTrusted) {
        // Device is trusted - skip MFA
        console.log('Device is trusted - skipping 2FA verification')
        setTwoFactorVerified(true)
      } else {
        // If 2FA is enabled, we start as not verified
        // The user must complete MFA verification on the 2FA verification page
        console.log('2FA is enabled - user must verify')
        setTwoFactorVerified(false)
      }
    } catch (error) {
      console.error('Error checking 2FA status:', error)
      setTwoFactorEnabled(false)
      setTwoFactorVerified(true)
    }
  }

  const checkAdmin = async (email?: string, userId?: string) => {
    // First check environment variable (backward compatibility)
    const envAdmins = import.meta.env.VITE_ADMIN_EMAILS?.split(',').map((e: string) => e.trim()).filter(Boolean) || []
    const defaultAdmins = envAdmins.length > 0 ? envAdmins : ['alnahash@gmail.com']
    const isEnvAdmin = email ? defaultAdmins.includes(email.toLowerCase()) : false

    if (isEnvAdmin) {
      setIsAdmin(true)
      return
    }

    // Then check database is_admin flag (for user-managed admins)
    if (userId) {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', userId)
          .single()

        setIsAdmin(data?.is_admin || false)
      } catch (error) {
        console.error('Error checking admin status:', error)
        setIsAdmin(false)
      }
    } else {
      setIsAdmin(false)
    }
  }

  const fetchAndSetTheme = async (userId: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('theme')
        .eq('id', userId)
        .single()

      if (data?.theme) {
        setThemeState(data.theme)
      }
    } catch (error) {
      console.error('Error fetching theme:', error)
    }
  }

  const setTheme = (newTheme: 'light' | 'dark') => {
    setThemeState(newTheme)
  }

  // Apply theme to HTML element
  useEffect(() => {
    const htmlElement = document.documentElement
    if (theme === 'light') {
      htmlElement.classList.remove('dark')
    } else {
      htmlElement.classList.add('dark')
    }
  }, [theme])

  if (loading || (user && onboarded === null) || (user && twoFactorEnabled === null)) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950">
        <div className="text-center">
          <img src="/logo/astiq-logo.svg" alt="astiq" className="h-24 mx-auto mb-4" />
          <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto"></div>
        </div>
      </div>
    )
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <AuthContext.Provider value={{ user, loading, isAdmin }}>
        <BrowserRouter>
          <Routes>
          {!user ? (
            <>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/auth/confirm" element={<EmailVerification />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/auth/reset-password" element={<ResetPassword />} />
              <Route path="*" element={<Navigate to="/login" />} />
            </>
          ) : !user.email_confirmed_at ? (
            // User logged in but email not verified - require email verification first
            <>
              <Route path="/auth/confirm" element={<EmailVerification />} />
              <Route path="/auth/reset-password" element={<ResetPassword />} />
              <Route path="*" element={<Navigate to="/auth/confirm" />} />
            </>
          ) : twoFactorEnabled && !twoFactorVerified ? (
            // User logged in, email verified, but 2FA enabled and not verified
            <>
              <Route path="/2fa-setup" element={<TwoFactorSetup />} />
              <Route path="/2fa-verify" element={<TwoFactorVerification />} />
              <Route path="/auth/reset-password" element={<ResetPassword />} />
              <Route path="*" element={<Navigate to="/2fa-verify" />} />
            </>
          ) : (
            // User logged in, email verified, 2FA verified (or not enabled) - check onboarding status
            <>
              <Route path="/2fa-setup" element={<TwoFactorSetup />} />
              <Route path="/auth/reset-password" element={<ResetPassword />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route
                path="/"
                element={onboarded === false ? <Navigate to="/onboarding" /> : <Dashboard />}
              />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/categories" element={<Categories />} />
              <Route path="/budgets" element={<Budgets />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/spending-vs-saving" element={<SpendingVsSaving />} />
              <Route path="/finai" element={<FinAI />} />
              <Route path="/insights" element={<Insights />} />
              <Route path="/settings" element={<Settings />} />
              {isAdmin && <Route path="/admin" element={<AdminPanel />} />}
              <Route path="*" element={<Navigate to="/" />} />
            </>
          )}
        </Routes>
        </BrowserRouter>
      </AuthContext.Provider>
    </ThemeContext.Provider>
  )
}

export default App
