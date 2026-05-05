import { useContext, useEffect, useState } from 'react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { getCurrencySymbol } from '../lib/utils'
import { AuthContext } from '../App'
import { Users, TrendingUp, BarChart3, Activity, Clock, Shield, Trash2 } from 'lucide-react'

interface UserAdminStats {
  id: string
  email: string
  full_name: string
  created_at: string
  last_sign_in_at: string | null
  login_count: number
  last_login_at: string | null
  transaction_count: number
  total_spending: number
  is_admin: boolean
  two_factor_enabled?: boolean
  two_factor_verified_at?: string | null
}

interface AppStats {
  total_users: number
  total_transactions: number
  total_spending: number
  active_today: number
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

function StatusBadge({ lastLogin }: { lastLogin: string | null }) {
  if (!lastLogin) return <span className="px-2 py-0.5 text-xs rounded-full bg-slate-700 text-slate-400 whitespace-nowrap">Never</span>
  const hrs = (Date.now() - new Date(lastLogin).getTime()) / 3600000
  if (hrs < 24) return <span className="px-2 py-0.5 text-xs rounded-full bg-green-900 text-green-400 whitespace-nowrap">Active</span>
  if (hrs < 168) return <span className="px-2 py-0.5 text-xs rounded-full bg-blue-900 text-blue-400 whitespace-nowrap">This week</span>
  return <span className="px-2 py-0.5 text-xs rounded-full bg-slate-700 text-slate-400 whitespace-nowrap">Inactive</span>
}

export default function AdminPanel() {
  const { user } = useContext(AuthContext)
  const [users, setUsers] = useState<UserAdminStats[]>([])
  const [appStats, setAppStats] = useState<AppStats>({
    total_users: 0,
    total_transactions: 0,
    total_spending: 0,
    active_today: 0,
  })
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<'created_at' | 'last_login_at' | 'login_count'>('created_at')
  const [currency, setCurrency] = useState('USD')
  const [deleteConfirm, setDeleteConfirm] = useState<{ userId: string; email: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [togglingAdmin, setTogglingAdmin] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const isOwner = user?.email?.toLowerCase() === 'alnahash@gmail.com'

  useEffect(() => {
    if (user) {
      fetchAdminData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const toggleAdminStatus = async (userId: string, currentStatus: boolean) => {
    if (!isOwner) {
      alert('Only the owner can manage admin users')
      return
    }

    setTogglingAdmin(userId)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_admin: !currentStatus })
        .eq('id', userId)

      if (error) throw error

      // Update local state
      setUsers(users.map(u => u.id === userId ? { ...u, is_admin: !currentStatus } : u))
    } catch (error) {
      console.error('Error toggling admin status:', error)
      alert('Failed to update admin status: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setTogglingAdmin(null)
    }
  }

  const deleteUser = async (userId: string) => {
    setDeleting(true)
    try {
      // Delete all user data from the database
      // Delete in order of foreign key dependencies
      console.log('Deleting user:', userId)

      // Delete transactions
      const txResult = await supabase.from('transactions').delete().eq('user_id', userId)
      console.log('Deleted transactions:', txResult)

      // Delete budgets
      const budgResult = await supabase.from('budgets').delete().eq('user_id', userId)
      console.log('Deleted budgets:', budgResult)

      // Delete categories
      const catResult = await supabase.from('categories').delete().eq('user_id', userId)
      console.log('Deleted categories:', catResult)

      // Delete login_events
      const loginResult = await supabase.from('login_events').delete().eq('user_id', userId)
      console.log('Deleted login_events:', loginResult)

      // Delete profile
      const profileResult = await supabase.from('profiles').delete().eq('id', userId)
      console.log('Deleted profile:', profileResult)

      if (profileResult.error) {
        console.error('Profile deletion error:', profileResult.error)
        throw new Error(`Failed to delete profile: ${profileResult.error.message}`)
      }

      // Delete the user from authentication
      // This requires calling an edge function or using the admin API
      try {
        const authDeleteResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-user`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            },
            body: JSON.stringify({ userId }),
          }
        )

        const responseData = await authDeleteResponse.json()
        console.log('Auth delete response:', authDeleteResponse.status, responseData)

        if (!authDeleteResponse.ok) {
          console.error('Edge function error:', responseData)
          console.error('User may still be able to login! Status:', authDeleteResponse.status)
        }
      } catch (authError) {
        console.error('Edge function delete failed:', authError)
        console.error('⚠️ CRITICAL: User authentication deletion failed! User may still be able to login!')
      }

      // Remove user from local state immediately
      const updatedUsers = users.filter(u => u.id !== userId)
      setUsers(updatedUsers)
      setDeleteConfirm(null)

      // Refresh all data from database to ensure consistency
      console.log('Refreshing admin data...')
      await new Promise(resolve => setTimeout(resolve, 500)) // Small delay to ensure DB is updated
      await fetchAdminData()

      setSuccessMessage('User deleted successfully!')
    } catch (error) {
      console.error('Error deleting user:', error)
      setErrorMessage('Failed to delete user: ' + (error instanceof Error ? error.message : 'Unknown error'))
      // Still try to refresh in case some data was deleted
      await fetchAdminData()
    } finally {
      setDeleting(false)
    }
  }

  const fetchAdminData = async () => {
    setLoading(true)
    try {
      // Fetch admin's currency preference
      if (user) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('currency')
            .eq('id', user.id)
            .single()

          if (profile) {
            setCurrency(profile.currency || 'USD')
          }
        } catch (err) {
          console.error('Error fetching admin currency:', err)
          // Keep default USD if fetch fails
        }
      }

      const { data: authStats, error } = await supabase.rpc('get_admin_user_stats')
      if (error) throw error

      const userIds = (authStats || []).map((u: { id: string }) => u.id)

      // Fetch categories to identify income vs expense
      const { data: allCategories } = await supabase
        .from('categories')
        .select('id, type')

      const categoryTypeMap = new Map(
        (allCategories || []).map((c: { id: string; type?: string }) => [
          c.id,
          c.type || 'expense'
        ])
      )

      const txnResults = await Promise.all(
        userIds.map((uid: string) =>
          supabase.from('transactions').select('amount, category_id').eq('user_id', uid)
        )
      )

      // Fetch is_admin and 2FA status from profiles table
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, is_admin, two_factor_enabled, two_factor_verified_at')

      const adminMap = new Map(
        (profiles || []).map((p: { id: string; is_admin: boolean }) => [p.id, p.is_admin || false])
      )

      const mfaMap = new Map(
        (profiles || []).map((p: { id: string; two_factor_enabled?: boolean; two_factor_verified_at?: string | null }) => [
          p.id,
          { enabled: p.two_factor_enabled || false, verified_at: p.two_factor_verified_at }
        ])
      )

      const enriched: UserAdminStats[] = (authStats || []).map((u: UserAdminStats, i: number) => {
        const mfaData = mfaMap.get(u.id)
        return {
          ...u,
          login_count: Number(u.login_count),
          transaction_count: txnResults[i].data?.length || 0,
          total_spending: txnResults[i].data?.reduce((s: number, t: { amount: number; category_id: string }) => {
            const catType = categoryTypeMap.get(t.category_id)
            return catType === 'income' ? s : s + t.amount
          }, 0) || 0,
          is_admin: adminMap.get(u.id) || false,
          two_factor_enabled: mfaData?.enabled || false,
          two_factor_verified_at: mfaData?.verified_at || null,
        }
      })

      setUsers(enriched)

      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()

      setAppStats({
        total_users: enriched.length,
        total_transactions: enriched.reduce((s, u) => s + u.transaction_count, 0),
        total_spending: enriched.reduce((s, u) => s + u.total_spending, 0),
        active_today: enriched.filter(u => u.last_login_at && u.last_login_at >= todayStart).length,
      })
    } catch (error) {
      console.error('Error fetching admin data:', error)
    } finally {
      setLoading(false)
    }
  }

  const sorted = [...users].sort((a, b) => {
    if (sortBy === 'login_count') return b.login_count - a.login_count
    const aVal = sortBy === 'last_login_at' ? a.last_login_at : a.created_at
    const bVal = sortBy === 'last_login_at' ? b.last_login_at : b.created_at
    if (!aVal) return 1
    if (!bVal) return -1
    return new Date(bVal).getTime() - new Date(aVal).getTime()
  })

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center space-x-3 mb-8">
          <Shield className="w-8 h-8 text-primary-500" />
          <h1 className="text-3xl font-bold text-white">Admin Panel</h1>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-slate-800 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-xs uppercase tracking-wide">Total Users</p>
                    <p className="text-3xl font-bold text-white mt-1">{appStats.total_users}</p>
                  </div>
                  <Users className="w-9 h-9 text-primary-500" />
                </div>
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-xs uppercase tracking-wide">Active Today</p>
                    <p className="text-3xl font-bold text-white mt-1">{appStats.active_today}</p>
                  </div>
                  <Activity className="w-9 h-9 text-green-500" />
                </div>
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-xs uppercase tracking-wide">Transactions</p>
                    <p className="text-3xl font-bold text-white mt-1">{appStats.total_transactions}</p>
                  </div>
                  <BarChart3 className="w-9 h-9 text-blue-500" />
                </div>
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-xs uppercase tracking-wide">Total Spending</p>
                    <p className="text-3xl font-bold text-white mt-1">{getCurrencySymbol(currency)}{appStats.total_spending.toFixed(0)}</p>
                  </div>
                  <TrendingUp className="w-9 h-9 text-orange-500" />
                </div>
              </div>
            </div>

            {/* Users Table */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
              <div className="p-5 border-b border-slate-700 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Users & Sessions</h2>
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-slate-400">Sort by:</span>
                  {(['created_at', 'last_login_at', 'login_count'] as const).map((key) => (
                    <button
                      key={key}
                      onClick={() => setSortBy(key)}
                      className={`px-3 py-1 rounded text-xs font-medium transition ${
                        sortBy === key
                          ? 'bg-primary-600 text-white'
                          : 'bg-slate-700 text-slate-400 hover:text-white'
                      }`}
                    >
                      {key === 'created_at' ? 'Joined' : key === 'last_login_at' ? 'Last Login' : 'Logins'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700 bg-slate-900">
                      <th className="px-5 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">User</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Status</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Joined</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">
                        <div className="flex items-center space-x-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Last Login</span>
                        </div>
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Supabase Last Sign-in</th>
                      <th className="px-5 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">Logins</th>
                      <th className="px-5 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">Transactions</th>
                      <th className="px-5 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wide">2FA Status</th>
                      <th className="px-5 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wide">Admin</th>
                      <th className="px-5 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {sorted.map((user) => (
                      <tr key={user.id} className="hover:bg-slate-750 transition">
                        <td className="px-5 py-4">
                          <div className="font-medium text-white text-sm">{user.full_name || '—'}</div>
                          <div className="text-slate-400 text-xs mt-0.5">{user.email}</div>
                        </td>
                        <td className="px-5 py-4">
                          <StatusBadge lastLogin={user.last_login_at} />
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-400">
                          {new Date(user.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-5 py-4">
                          <div className="text-sm text-white">{timeAgo(user.last_login_at)}</div>
                          {user.last_login_at && (
                            <div className="text-xs text-slate-500 mt-0.5">
                              {new Date(user.last_login_at).toLocaleString()}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <div className="text-sm text-white">{timeAgo(user.last_sign_in_at)}</div>
                          {user.last_sign_in_at && (
                            <div className="text-xs text-slate-500 mt-0.5">
                              {new Date(user.last_sign_in_at).toLocaleString()}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <span className="text-white font-medium text-sm">{user.login_count}</span>
                        </td>
                        <td className="px-5 py-4 text-right text-sm text-white">{user.transaction_count}</td>
                        <td className="px-5 py-4 text-center">
                          {user.two_factor_enabled ? (
                            <div className="inline-flex flex-col items-center space-y-1">
                              <span className="inline-flex items-center space-x-1 px-2 py-1 rounded-lg bg-green-900/30 text-green-400 text-xs font-medium">
                                <Shield className="w-3.5 h-3.5" />
                                <span>Enabled</span>
                              </span>
                              {user.two_factor_verified_at && (
                                <span className="text-xs text-slate-500">
                                  {new Date(user.two_factor_verified_at).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center space-x-1 px-2 py-1 rounded-lg bg-slate-700 text-slate-400 text-xs font-medium">
                              <span>Disabled</span>
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-center">
                          {isOwner ? (
                            <button
                              onClick={() => toggleAdminStatus(user.id, user.is_admin)}
                              disabled={togglingAdmin === user.id}
                              className={`inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg transition ${
                                user.is_admin
                                  ? 'bg-purple-900/30 text-purple-400 hover:bg-purple-900/50'
                                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                              } disabled:opacity-50`}
                              title={isOwner ? 'Click to toggle admin status' : 'Only owner can manage admins'}
                            >
                              {togglingAdmin === user.id ? (
                                <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <Shield className="w-3.5 h-3.5" />
                              )}
                              <span className="text-xs font-medium">
                                {user.is_admin ? 'Admin' : 'User'}
                              </span>
                            </button>
                          ) : (
                            <span className={`inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium ${
                              user.is_admin
                                ? 'bg-purple-900/30 text-purple-400'
                                : 'bg-slate-700 text-slate-400'
                            }`}>
                              <Shield className="w-3.5 h-3.5" />
                              <span>{user.is_admin ? 'Admin' : 'User'}</span>
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-center">
                          <button
                            onClick={() => setDeleteConfirm({ userId: user.id, email: user.email })}
                            className="inline-flex items-center justify-center p-2 text-red-400 hover:bg-red-900/20 rounded-lg transition"
                            title="Delete user"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {users.length === 0 && (
                <div className="p-10 text-center text-slate-400">No users found</div>
              )}
            </div>

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 max-w-md w-full">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-red-900/30 flex items-center justify-center">
                      <Trash2 className="w-6 h-6 text-red-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-white">Delete User</h3>
                  </div>

                  <p className="text-slate-400 mb-2">
                    Are you sure you want to delete this user?
                  </p>
                  <p className="text-white font-medium mb-6">
                    {deleteConfirm.email}
                  </p>

                  <p className="text-red-400 text-sm mb-6">
                    ⚠️ This action cannot be undone. All user data including transactions, categories, and budgets will be permanently deleted.
                  </p>

                  <div className="flex space-x-3">
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      disabled={deleting}
                      className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => deleteUser(deleteConfirm.userId)}
                      disabled={deleting}
                      className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg transition flex items-center justify-center space-x-2"
                    >
                      {deleting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Deleting...</span>
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4" />
                          <span>Delete User</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Success Modal */}
            {successMessage && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 max-w-md w-full">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-green-900/30 flex items-center justify-center">
                      <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-white">Success!</h3>
                  </div>

                  <p className="text-slate-400 mb-6">
                    {successMessage}
                  </p>

                  <button
                    onClick={() => setSuccessMessage(null)}
                    className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition font-medium"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

            {/* Error Modal */}
            {errorMessage && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 max-w-md w-full">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-red-900/30 flex items-center justify-center">
                      <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-white">Error</h3>
                  </div>

                  <p className="text-slate-400 mb-6">
                    {errorMessage}
                  </p>

                  <button
                    onClick={() => setErrorMessage(null)}
                    className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition font-medium"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
