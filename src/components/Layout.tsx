import { useContext, useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AuthContext } from '../App'
import { supabase } from '../lib/supabase'
import { LayoutDashboard, TrendingDown, Layers, Target, BarChart3, TrendingUp, Settings, LogOut, Shield, Sparkles, Lightbulb, Menu, X, ChevronLeft, ChevronRight } from 'lucide-react'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const { isAdmin } = useContext(AuthContext)
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Load sidebar preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('sidebar-open')
    if (saved !== null) {
      setSidebarOpen(JSON.parse(saved))
    }
  }, [])

  // Save sidebar preference to localStorage
  const toggleSidebar = () => {
    setSidebarOpen(prev => {
      const newValue = !prev
      localStorage.setItem('sidebar-open', JSON.stringify(newValue))
      return newValue
    })
  }

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
    { path: '/insights', label: 'Insights', icon: Lightbulb },
  ]

  return (
    <div className="flex h-screen bg-slate-950">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-0'} bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-300 overflow-hidden`}>
        {/* Logo */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-primary-500">FinMgmt</h1>
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition"
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </button>
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
      <div className="flex-1 overflow-auto flex flex-col">
        {/* Sidebar Toggle Button */}
        <div className="flex items-center px-4 py-3 border-b border-slate-800 bg-slate-900">
          <button
            onClick={toggleSidebar}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition"
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Page Content */}
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </div>
    </div>
  )
}
