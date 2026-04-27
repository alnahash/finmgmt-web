import { useEffect, useState, createContext } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import type { User } from '@supabase/supabase-js'

// Pages
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Categories from './pages/Categories'
import Budgets from './pages/Budgets'
import Analytics from './pages/Analytics'
import Settings from './pages/Settings'
import AdminPanel from './pages/AdminPanel'
import Onboarding from './pages/Onboarding'

export const AuthContext = createContext<{
  user: User | null
  loading: boolean
  isAdmin: boolean
}>({
  user: null,
  loading: true,
  isAdmin: false,
})

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    // Check if user is logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null)
      checkAdmin(session?.user?.email)
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null)
      checkAdmin(session?.user?.email)
      if (event === 'SIGNED_IN' && session?.user) {
        supabase.from('login_events').insert({
          user_id: session.user.id,
          user_agent: navigator.userAgent,
        }).then(() => {})
      }
    })

    return () => subscription?.unsubscribe()
  }, [])

  const checkAdmin = (email?: string) => {
    const envAdmins = import.meta.env.VITE_ADMIN_EMAILS?.split(',').map((e: string) => e.trim()).filter(Boolean) || []
    const admins = envAdmins.length > 0 ? envAdmins : ['alnahash@gmail.com']
    setIsAdmin(email ? admins.includes(email.toLowerCase()) : false)
  }

  if (loading) {
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
    <AuthContext.Provider value={{ user, loading, isAdmin }}>
      <BrowserRouter>
        <Routes>
          {!user ? (
            <>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="*" element={<Navigate to="/login" />} />
            </>
          ) : (
            <>
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/" element={<Dashboard />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/categories" element={<Categories />} />
              <Route path="/budgets" element={<Budgets />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/settings" element={<Settings />} />
              {isAdmin && <Route path="/admin" element={<AdminPanel />} />}
              <Route path="*" element={<Navigate to="/" />} />
            </>
          )}
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  )
}

export default App
