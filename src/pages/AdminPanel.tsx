import { useContext, useEffect, useState } from 'react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { getCurrencySymbol } from '../lib/utils'
import { AuthContext } from '../App'
import { Users, TrendingUp, BarChart3, Activity, Clock, Shield } from 'lucide-react'

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
  if (!lastLogin) return <span className="px-2 py-0.5 text-xs rounded-full bg-slate-700 text-slate-400">Never</span>
  const hrs = (Date.now() - new Date(lastLogin).getTime()) / 3600000
  if (hrs < 24) return <span className="px-2 py-0.5 text-xs rounded-full bg-green-900 text-green-400">Active today</span>
  if (hrs < 168) return <span className="px-2 py-0.5 text-xs rounded-full bg-blue-900 text-blue-400">This week</span>
  return <span className="px-2 py-0.5 text-xs rounded-full bg-slate-700 text-slate-400">Inactive</span>
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

  useEffect(() => {
    fetchAdminData()
  }, [])

  const fetchAdminData = async () => {
    setLoading(true)
    try {
      // Fetch admin's currency preference
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('currency')
          .eq('id', user.id)
          .single()

        if (profile?.currency) {
          setCurrency(profile.currency)
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

      const enriched: UserAdminStats[] = (authStats || []).map((u: UserAdminStats, i: number) => ({
        ...u,
        login_count: Number(u.login_count),
        transaction_count: txnResults[i].data?.length || 0,
        total_spending: txnResults[i].data?.reduce((s: number, t: { amount: number; category_id: string }) => {
          const catType = categoryTypeMap.get(t.category_id)
          return catType === 'income' ? s : s + t.amount
        }, 0) || 0,
      }))

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
                      <th className="px-5 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">Spending</th>
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
                        <td className="px-5 py-4 text-right text-sm text-white font-medium">
                          {getCurrencySymbol(currency)}{user.total_spending.toFixed(2)}
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
          </>
        )}
      </div>
    </Layout>
  )
}
