import { useContext } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AuthContext } from '../App'
import { supabase } from '../lib/supabase'
import { LayoutDashboard, TrendingDown, Layers, Target, BarChart3, TrendingUp, Settings, LogOut, Shield, Sparkles } from 'lucide-react'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const { isAdmin } = useContext(AuthContext)
  const location = useLocation()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/transactions', label: 'Transactions', icon: TrendingDown },
    { path: '/categories', label: 'Categories', icon: Layers },
    { path: '/budgets', label: 'Budgets', icon: Target },
    { path: '/analytics', label: 'Analytics', icon: BarChart3 },
    { path: '/spending-vs-saving', label: 'Spending vs Saving', icon: TrendingUp },
    { path: '/finai', label: 'FinAI', icon: Sparkles },
  ]

  return (
    <div className="flex h-screen bg-slate-950">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-2xl font-bold text-primary-500">FinMgmt</h1>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {navItems.map(({ path, label, icon: Icon }) => (
            <Link
              key={path}
              to={path}
              className={`flex items-center space-x-3 px-4 py-2 rounded-lg transition ${
                location.pathname === path
                  ? 'bg-primary-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </Link>
          ))}

          {isAdmin && (
            <>
              <div className="my-4 border-t border-slate-800"></div>
              <Link
                to="/admin"
                className={`flex items-center space-x-3 px-4 py-2 rounded-lg transition ${
                  location.pathname === '/admin'
                    ? 'bg-primary-600 text-white'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Shield className="w-5 h-5" />
                <span>Admin Panel</span>
              </Link>
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 space-y-2">
          <Link
            to="/settings"
            className={`flex items-center space-x-3 px-4 py-2 rounded-lg transition ${
              location.pathname === '/settings'
                ? 'bg-primary-600 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span>Settings</span>
          </Link>

          <button
            onClick={handleLogout}
            className="w-full flex items-center space-x-3 px-4 py-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <LogOut className="w-5 h-5" />
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </div>
  )
}
