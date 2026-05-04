import { useContext, useEffect, useState } from 'react'
import { AuthContext, ThemeContext } from '../App'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { Save, LogOut, Shield, Copy } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { is2FAEnabled, getBackupCodes, disable2FA, formatBackupCode } from '../lib/twoFactor'

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

  // 2FA State
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [showDisable2FAModal, setShowDisable2FAModal] = useState(false)
  const [disable2FAPassword, setDisable2FAPassword] = useState('')
  const [disable2FALoading, setDisable2FALoading] = useState(false)
  const [showBackupCodesPassword, setShowBackupCodesPassword] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetchProfile()
    load2FAStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const load2FAStatus = async () => {
    if (!user) return
    try {
      const enabled = await is2FAEnabled(user.id)
      setTwoFactorEnabled(enabled)
    } catch (error) {
      console.error('Error loading 2FA status:', error)
    }
  }

  const handleEnable2FA = () => {
    navigate('/2fa-setup', { state: { from: '/settings' } })
  }

  const handleDisable2FA = async () => {
    if (!user) return
    setDisable2FALoading(true)
    try {
      // Verify password before disabling
      const { error } = await supabase.auth.signInWithPassword({
        email: user.email || '',
        password: disable2FAPassword,
      })

      if (error) {
        setMessage('Incorrect password. 2FA not disabled.')
        return
      }

      // Disable 2FA
      await disable2FA(user.id)
      setTwoFactorEnabled(false)
      setShowDisable2FAModal(false)
      setDisable2FAPassword('')
      setMessage('2FA has been disabled.')
      setTimeout(() => setMessage(''), 3000)
      load2FAStatus()
    } catch (error) {
      console.error('Error disabling 2FA:', error)
      setMessage('Failed to disable 2FA')
    } finally {
      setDisable2FALoading(false)
    }
  }

  const handleViewBackupCodes = async () => {
    if (!user) return
    setShowBackupCodesPassword(true)
    try {
      const codes = await getBackupCodes(user.id)
      setBackupCodes(codes)
    } catch (error) {
      console.error('Error getting backup codes:', error)
      setMessage('Failed to load backup codes')
    }
  }

  const handleCopyBackupCodes = () => {
    const codesText = backupCodes.join('\n')
    navigator.clipboard.writeText(codesText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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

          {/* Security Section */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-primary-400" />
              <h2 className="text-lg font-semibold text-white">Security</h2>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-medium">Two-Factor Authentication</p>
                  <p className="text-slate-400 text-sm mt-1">
                    {twoFactorEnabled
                      ? '✓ Enabled - Your account is protected'
                      : 'Disabled - Add an extra layer of security'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    twoFactorEnabled
                      ? setShowDisable2FAModal(true)
                      : handleEnable2FA()
                  }
                  className={`px-4 py-2 rounded-lg font-medium transition ${
                    twoFactorEnabled
                      ? 'bg-slate-700 hover:bg-slate-600 text-white'
                      : 'bg-primary-600 hover:bg-primary-700 text-white'
                  }`}
                >
                  {twoFactorEnabled ? 'Disable 2FA' : 'Enable 2FA'}
                </button>
              </div>

              {twoFactorEnabled && (
                <div className="pt-4 border-t border-slate-700">
                  <button
                    type="button"
                    onClick={handleViewBackupCodes}
                    className="text-primary-400 hover:text-primary-300 text-sm font-medium transition"
                  >
                    View Backup Codes
                  </button>
                </div>
              )}
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

        {/* Disable 2FA Modal */}
        {showDisable2FAModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-bold text-white mb-4">Disable 2FA?</h3>
              <p className="text-slate-300 mb-6">
                Your account will be less secure without two-factor authentication. Enter your password to confirm.
              </p>

              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={disable2FAPassword}
                  onChange={(e) => setDisable2FAPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDisable2FAModal(false)
                    setDisable2FAPassword('')
                  }}
                  className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDisable2FA}
                  disabled={!disable2FAPassword || disable2FALoading}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg transition"
                >
                  {disable2FALoading ? 'Disabling...' : 'Disable 2FA'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* View Backup Codes Modal */}
        {showBackupCodesPassword && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-bold text-white mb-4">Backup Codes</h3>

              {backupCodes.length > 0 ? (
                <>
                  <p className="text-slate-300 text-sm mb-4">
                    Keep these codes in a safe place. Each code can be used once if you lose access to your authenticator.
                  </p>

                  <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 mb-6 max-h-48 overflow-y-auto">
                    <div className="grid grid-cols-2 gap-2">
                      {backupCodes.map((code, idx) => (
                        <div
                          key={idx}
                          className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-center"
                        >
                          <code className="text-slate-300 font-mono text-xs">
                            {formatBackupCode(code)}
                          </code>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={handleCopyBackupCodes}
                    className="w-full mb-3 flex items-center justify-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
                  >
                    <Copy size={18} />
                    {copied ? 'Copied!' : 'Copy All'}
                  </button>
                </>
              ) : (
                <p className="text-slate-400 text-sm mb-6">
                  No backup codes available. Generate new ones by re-enabling 2FA.
                </p>
              )}

              <button
                onClick={() => {
                  setShowBackupCodesPassword(false)
                  setBackupCodes([])
                }}
                className="w-full px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
