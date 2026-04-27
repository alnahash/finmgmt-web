import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { Users, TrendingUp, BarChart3 } from 'lucide-react'

interface UserStats {
  id: string
  full_name: string
  email: string
  created_at: string
  transaction_count: number
  total_spending: number
}

interface AppStats {
  total_users: number
  total_transactions: number
  total_spending: number
  avg_spending_per_user: number
}

export default function AdminPanel() {
  const [users, setUsers] = useState<UserStats[]>([])
  const [appStats, setAppStats] = useState<AppStats>({
    total_users: 0,
    total_transactions: 0,
    total_spending: 0,
    avg_spending_per_user: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAdminData()
  }, [])

  const fetchAdminData = async () => {
    setLoading(true)

    try {
      // Get all users
      const { data: profiles } = await supabase.from('profiles').select('id, full_name, email, created_at')

      if (!profiles) return

      // Get stats for each user
      const userStatsPromises = profiles.map(async (profile) => {
        const { data: txns } = await supabase
          .from('transactions')
          .select('amount')
          .eq('user_id', profile.id)

        const totalSpending = txns?.reduce((sum, t) => sum + t.amount, 0) || 0

        return {
          ...profile,
          transaction_count: txns?.length || 0,
          total_spending: totalSpending,
        }
      })

      const userStats = await Promise.all(userStatsPromises)
      setUsers(userStats)

      // Calculate app-wide stats
      const totalUsers = profiles.length
      const totalTransactions = userStats.reduce((sum, u) => sum + u.transaction_count, 0)
      const totalSpending = userStats.reduce((sum, u) => sum + u.total_spending, 0)

      setAppStats({
        total_users: totalUsers,
        total_transactions: totalTransactions,
        total_spending: totalSpending,
        avg_spending_per_user: totalUsers > 0 ? totalSpending / totalUsers : 0,
      })
    } catch (error) {
      console.error('Error fetching admin data:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white mb-8">Admin Panel 🛡️</h1>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-slate-800 rounded-lg animate-pulse"></div>
            ))}
          </div>
        ) : (
          <>
            {/* App Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm">Total Users</p>
                    <p className="text-3xl font-bold text-white mt-2">{appStats.total_users}</p>
                  </div>
                  <Users className="w-10 h-10 text-primary-500" />
                </div>
              </div>

              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm">Total Transactions</p>
                    <p className="text-3xl font-bold text-white mt-2">{appStats.total_transactions}</p>
                  </div>
                  <BarChart3 className="w-10 h-10 text-blue-500" />
                </div>
              </div>

              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm">Total Spending</p>
                    <p className="text-3xl font-bold text-white mt-2">
                      ${appStats.total_spending.toFixed(2)}
                    </p>
                  </div>
                  <TrendingUp className="w-10 h-10 text-orange-500" />
                </div>
              </div>

              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm">Avg per User</p>
                    <p className="text-3xl font-bold text-white mt-2">
                      ${appStats.avg_spending_per_user.toFixed(2)}
                    </p>
                  </div>
                  <BarChart3 className="w-10 h-10 text-green-500" />
                </div>
              </div>
            </div>

            {/* Users Table */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
              <div className="p-6 border-b border-slate-700">
                <h2 className="text-lg font-semibold text-white">User Management</h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700 bg-slate-900">
                      <th className="px-6 py-3 text-left text-sm font-medium text-slate-300">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-sm font-medium text-slate-300">
                        Email
                      </th>
                      <th className="px-6 py-3 text-left text-sm font-medium text-slate-300">
                        Joined
                      </th>
                      <th className="px-6 py-3 text-right text-sm font-medium text-slate-300">
                        Transactions
                      </th>
                      <th className="px-6 py-3 text-right text-sm font-medium text-slate-300">
                        Total Spending
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {users.map((user) => (
                      <tr key={user.id} className="hover:bg-slate-900 transition">
                        <td className="px-6 py-4 text-sm text-white font-medium">
                          {user.full_name}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-300">{user.email}</td>
                        <td className="px-6 py-4 text-sm text-slate-400">
                          {new Date(user.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-sm text-right text-white font-medium">
                          {user.transaction_count}
                        </td>
                        <td className="px-6 py-4 text-sm text-right text-white font-medium">
                          ${user.total_spending.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {users.length === 0 && (
                <div className="p-8 text-center">
                  <p className="text-slate-400">No users registered yet</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}
