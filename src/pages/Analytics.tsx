import { useContext, useEffect, useState } from 'react'
import { AuthContext } from '../App'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { TrendingUp } from 'lucide-react'

interface Transaction {
  amount: number
  category_id: string
  transaction_date: string
}

interface Category {
  id: string
  name: string
  icon: string
  color: string
}

export default function Analytics() {
  const { user } = useContext(AuthContext)
  const [pieData, setPieData] = useState<any[]>([])
  const [lineData, setLineData] = useState<any[]>([])
  const [categories, setCategories] = useState<Map<string, Category>>(new Map())
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalSpent: 0,
    topCategory: '',
    avgDaily: 0,
    transactionCount: 0,
  })

  useEffect(() => {
    fetchAnalytics()
  }, [user])

  const fetchAnalytics = async () => {
    if (!user) return
    setLoading(true)

    try {
      // Fetch categories
      const { data: cats } = await supabase
        .from('categories')
        .select('id, name, icon, color')
        .eq('user_id', user.id)

      const catMap = new Map()
      cats?.forEach((cat) => catMap.set(cat.id, cat))
      setCategories(catMap)

      // Get current month
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]

      // Fetch transactions
      const { data: txns } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .gte('transaction_date', monthStart)
        .lte('transaction_date', monthEnd)

      if (!txns || txns.length === 0) {
        setLoading(false)
        return
      }

      // Calculate pie chart data (by category)
      const categoryTotals = new Map<string, number>()
      txns.forEach((t) => {
        const current = categoryTotals.get(t.category_id) || 0
        categoryTotals.set(t.category_id, current + t.amount)
      })

      const pieChartData = Array.from(categoryTotals.entries()).map(([catId, amount]) => ({
        name: catMap.get(catId)?.name || 'Unknown',
        value: parseFloat(amount.toFixed(2)),
        icon: catMap.get(catId)?.icon || '📁',
        color: catMap.get(catId)?.color || '#f97316',
      }))

      // Calculate line chart data (daily trend)
      const dailyData = new Map<string, number>()
      txns.forEach((t) => {
        const date = t.transaction_date
        const current = dailyData.get(date) || 0
        dailyData.set(date, current + t.amount)
      })

      const sortedDates = Array.from(dailyData.keys()).sort()
      let cumulativeSum = 0
      const lineChartData = sortedDates.map((date) => {
        cumulativeSum += dailyData.get(date) || 0
        return {
          date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          amount: parseFloat(cumulativeSum.toFixed(2)),
        }
      })

      setPieData(pieChartData)
      setLineData(lineChartData)

      // Calculate stats
      const totalSpent = txns.reduce((sum, t) => sum + t.amount, 0)
      const topCat = pieChartData.sort((a, b) => b.value - a.value)[0]
      const days = new Set(txns.map((t) => t.transaction_date)).size
      const avgDaily = totalSpent / days

      setStats({
        totalSpent: parseFloat(totalSpent.toFixed(2)),
        topCategory: topCat?.name || 'N/A',
        avgDaily: parseFloat(avgDaily.toFixed(2)),
        transactionCount: txns.length,
      })
    } catch (error) {
      console.error('Error fetching analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  const COLORS = ['#f97316', '#fb923c', '#fdba74', '#fed7aa', '#fef08a', '#fcd34d']

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white mb-8">Analytics</h1>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-64 bg-slate-800 rounded-lg animate-pulse"></div>
            ))}
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <p className="text-slate-400 text-sm">Total Spent</p>
                <p className="text-3xl font-bold text-white mt-2">${stats.totalSpent}</p>
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <p className="text-slate-400 text-sm">Top Category</p>
                <p className="text-2xl font-bold text-primary-500 mt-2">{stats.topCategory}</p>
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <p className="text-slate-400 text-sm">Daily Average</p>
                <p className="text-3xl font-bold text-white mt-2">${stats.avgDaily}</p>
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <p className="text-slate-400 text-sm">Transactions</p>
                <p className="text-3xl font-bold text-white mt-2">{stats.transactionCount}</p>
              </div>
            </div>

            {/* Charts */}
            {pieData.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Pie Chart */}
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                  <h2 className="text-lg font-semibold text-white mb-4">Spending by Category</h2>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name}: $${value}`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => `$${value}`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Line Chart */}
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                  <h2 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
                    <TrendingUp className="w-5 h-5" />
                    <span>Daily Cumulative Spending</span>
                  </h2>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={lineData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="date" stroke="#94a3b8" />
                      <YAxis stroke="#94a3b8" />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }}
                        formatter={(value) => `$${value}`}
                      />
                      <Line
                        type="monotone"
                        dataKey="amount"
                        stroke="#f97316"
                        strokeWidth={2}
                        dot={{ fill: '#f97316' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {pieData.length === 0 && (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
                <p className="text-slate-400">No transaction data for this month</p>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
