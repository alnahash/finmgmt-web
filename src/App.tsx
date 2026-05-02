import { useEffect, useState, createContext } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import type { User } from '@supabase/supabase-js'

// Pages
import Login from './pages/Login'
import Signup from './pages/Signup'
import EmailVerification from './pages/EmailVerification'
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

  useEffect(() => {
    // Check if user is logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null)
      checkAdmin(session?.user?.email, session?.user?.id)
      if (session?.user?.id) {
        checkOnboardingStatus(session.user.id)
      }
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null)
      checkAdmin(session?.user?.email, session?.user?.id)
      if (session?.user) {
        fetchAndSetTheme(session.user.id)
        checkOnboardingStatus(session.user.id)
      } else {
        setOnboarded(null)
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
      const { data } = await supabase
        .from('profiles')
        .select('onboarded')
        .eq('id', userId)
        .single()

      console.log('Onboarding status:', data?.onboarded)
      setOnboarded(data?.onboarded || false)
    } catch (error) {
      console.error('Error checking onboarding status:', error)
      setOnboarded(false)
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

  if (loading || (user && onboarded === null)) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950">
        <div className="text-center">
          <div className="text-4xl font-bold text-primary-500 mb-4">FinMgmt</div>
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
              <Route path="*" element={<Navigate to="/login" />} />
            </>
          ) : (
            // User logged in - check onboarding status
            <>
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
