import { useContext, useEffect, useState } from 'react'
import { AuthContext, ThemeContext } from '../App'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { Save, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface Profile {
  id: string
  full_name: string
  email: string
  currency: string
  month_start_day: number
  monthly_budget: number
  theme: 'light' | 'dark'
}

export default function Settings() {
  const { user } = useContext(AuthContext)
  const { setTheme } = useContext(ThemeContext)
  const navigate = useNavigate()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetchProfile()
  }, [user])

  const fetchProfile = async () => {
    if (!user) return
    setLoading(true)

    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (data) {
        setProfile({
          ...data,
          email: user.email || '',
        })
      }
    } catch (error) {
      console.error('Error fetching profile:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !profile) return

    setSaving(true)
    setMessage('')

    try {
      await supabase
        .from('profiles')
        .update({
          full_name: profile.full_name,
          currency: profile.currency,
          month_start_day: profile.month_start_day,
          monthly_budget: profile.monthly_budget,
          theme: profile.theme,
        })
        .eq('id', user.id)

      // Update theme in context if it changed
      if (profile.theme) {
        setTheme(profile.theme)
      }
      setMessage('Settings saved successfully!')
      setTimeout(() => setMessage(''), 3000)
    } catch (error) {
      setMessage('Failed to save settings')
      console.error('Error saving profile:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  if (loading) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="h-96 bg-slate-800 rounded-lg animate-pulse"></div>
        </div>
      </Layout>
    )
  }

  if (!profile) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-8">
          <p className="text-slate-400">Failed to load profile</p>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white mb-8">Settings</h1>

        {message && (
          <div className={`mb-6 p-4 rounded-lg ${message.includes('success') ? 'bg-green-900/30 border border-green-700 text-green-200' : 'bg-red-900/30 border border-red-700 text-red-200'}`}>
            {message}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* Profile Section */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Profile</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Full Name</label>
                <input
                  type="text"
                  value={profile.full_name}
                  onChange={(e) =>
                    setProfile({ ...profile, full_name: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                <input
                  type="email"
                  value={profile.email}
                  disabled
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-400 cursor-not-allowed"
                />
                <p className="text-xs text-slate-400 mt-1">Email cannot be changed</p>
              </div>
            </div>
          </div>

          {/* Preferences Section */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Preferences</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Currency</label>
                <select
                  value={profile.currency}
                  onChange={(e) =>
                    setProfile({ ...profile, currency: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                >
                  <option value="USD">US Dollar (USD)</option>
                  <option value="EUR">Euro (EUR)</option>
                  <option value="GBP">British Pound (GBP)</option>
                  <option value="BHD">Bahraini Dinar (BHD)</option>
                  <option value="AED">UAE Dirham (AED)</option>
                  <option value="SAR">Saudi Riyal (SAR)</option>
                  <option value="KWD">Kuwaiti Dinar (KWD)</option>
                  <option value="QAR">Qatar Riyal (QAR)</option>
                  <option value="OMR">Omani Rial (OMR)</option>
                  <option value="JPY">Japanese Yen (JPY)</option>
                  <option value="CAD">Canadian Dollar (CAD)</option>
                  <option value="AUD">Australian Dollar (AUD)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Month Start Day
                </label>
                <select
                  value={profile.month_start_day}
                  onChange={(e) =>
                    setProfile({ ...profile, month_start_day: parseInt(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                >
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                    <option key={day} value={day}>
                      Day {day}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">When should your monthly budget reset?</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Monthly Budget
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={profile.monthly_budget}
                  onChange={(e) =>
                    setProfile({ ...profile, monthly_budget: parseFloat(e.target.value) })
                  }
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Theme</label>
                <select
                  value={profile.theme}
                  onChange={(e) =>
                    setProfile({ ...profile, theme: e.target.value as 'light' | 'dark' })
                  }
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                >
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center space-x-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition"
            >
              <Save className="w-5 h-5" />
              <span>{saving ? 'Saving...' : 'Save Settings'}</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="flex-1 flex items-center justify-center space-x-2 bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 rounded-lg transition"
            >
              <LogOut className="w-5 h-5" />
              <span>Logout</span>
            </button>
          </div>
        </form>
      </div>
    </Layout>
  )
}
