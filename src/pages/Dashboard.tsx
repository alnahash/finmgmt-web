import { useContext, useEffect, useState } from 'react'
import { AuthContext } from '../App'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { TrendingDown, DollarSign, Target } from 'lucide-react'

interface Stats {
  totalSpent: number
  budgetRemaining: number
  transactions: number
}

export default function Dashboard() {
  const { user } = useContext(AuthContext)
  const [stats, setStats] = useState<Stats>({ totalSpent: 0, budgetRemaining: 0, transactions: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      if (!user) return

      try {
        // Get profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('monthly_budget')
          .eq('id', user.id)
          .single()

        // Get transactions for current month
        const now = new Date()
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

        const { data: transactions } = await supabase
          .from('transactions')
          .select('amount')
          .eq('user_id', user.id)
          .gte('transaction_date', monthStart.toISOString().split('T')[0])
          .lte('transaction_date', monthEnd.toISOString().split('T')[0])

        const totalSpent = transactions?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0
        const monthlyBudget = profile?.monthly_budget || 0

        setStats({
          totalSpent,
          budgetRemaining: Math.max(0, monthlyBudget - totalSpent),
          transactions: transactions?.length || 0,
        })
      } catch (error) {
        console.error('Error fetching stats:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [user])

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Welcome back, {user?.user_metadata?.full_name || 'User'}! 👋</h1>
          <p className="text-slate-400">Here's your financial overview</p>
        </div>

        {/* Stats Cards */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-slate-800 rounded-lg animate-pulse"></div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Total Spent</p>
                  <p className="text-3xl font-bold text-white mt-2">${stats.totalSpent.toFixed(2)}</p>
                </div>
                <TrendingDown className="w-10 h-10 text-primary-500" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Budget Remaining</p>
                  <p className="text-3xl font-bold text-white mt-2">${stats.budgetRemaining.toFixed(2)}</p>
                </div>
                <DollarSign className="w-10 h-10 text-green-500" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Transactions</p>
                  <p className="text-3xl font-bold text-white mt-2">{stats.transactions}</p>
                </div>
                <Target className="w-10 h-10 text-blue-500" />
              </div>
            </div>
          </div>
        )}

        {/* Placeholder for more content */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
          <p className="text-slate-400">More features coming soon...</p>
        </div>
      </div>
    </Layout>
  )
}
