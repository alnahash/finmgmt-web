import { useContext, useEffect, useState } from 'react'
import { AuthContext } from '../App'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { getCurrencySymbol, getMonthPeriodKey, getPeriodDateRange } from '../lib/utils'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface MonthlyData {
  month: number
  year: number
  monthLabel: string
  budgetSet: number
  actualSpending: number
  savings: number
  savingsPercent: number
  previousSavings?: number
}

export default function SpendingVsSaving() {
  const { user } = useContext(AuthContext)
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([])
  const [loading, setLoading] = useState(true)
  const [currency, setCurrency] = useState('USD')

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const fetchData = async () => {
    if (!user) return
    setLoading(true)

    try {
      // Fetch profile for currency and month_start_day
      const { data: profile } = await supabase
        .from('profiles')
        .select('currency, month_start_day')
        .eq('id', user.id)
        .single()

      if (profile) {
        setCurrency(profile.currency || 'USD')
      }

      const monthStartDay = profile?.month_start_day || 1

      // Fetch all budgets
      const { data: budgets } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_id', user.id)
        .order('year', { ascending: false })
        .order('month', { ascending: false })

      // Fetch all transactions
      const { data: transactions } = await supabase
        .from('transactions')
        .select('amount, category_id, transaction_date')
        .eq('user_id', user.id)

      // Fetch categories
      const { data: categories } = await supabase
        .from('categories')
        .select('id, type')
        .eq('user_id', user.id)

      // Create category type map
      const categoryTypeMap = new Map(
        (categories || []).map((c) => [c.id, c.type || 'expense'])
      )

      // Group budgets by period
      const budgetsByMonth = new Map<string, number>()
      ;(budgets || []).forEach((budget) => {
        // Convert calendar month/year to period key
        const dateStr = `${budget.year}-${String(budget.month).padStart(2, '0')}-01`
        const periodKey = getMonthPeriodKey(dateStr, monthStartDay)
        const current = budgetsByMonth.get(periodKey) || 0
        budgetsByMonth.set(periodKey, current + budget.amount)
      })

      // Group transactions by period and sum spending
      const spendingByMonth = new Map<string, number>()
      ;(transactions || []).forEach((txn) => {
        const periodKey = getMonthPeriodKey(txn.transaction_date, monthStartDay)
        const catType = categoryTypeMap.get(txn.category_id)
        if (catType !== 'income') {
          const current = spendingByMonth.get(periodKey) || 0
          spendingByMonth.set(periodKey, current + txn.amount)
        }
      })

      // Combine all months
      const allMonths = new Set<string>()
      budgetsByMonth.forEach((_, key) => allMonths.add(key))
      spendingByMonth.forEach((_, key) => allMonths.add(key))

      // Create monthly data array
      const monthlyArray: MonthlyData[] = Array.from(allMonths)
        .map((key) => {
          const { startDate } = getPeriodDateRange(key)
          const date = new Date(startDate)
          const year = date.getFullYear()
          const month = date.getMonth() + 1

          const budgetSet = budgetsByMonth.get(key) || 0
          const actualSpending = spendingByMonth.get(key) || 0
          const savings = budgetSet - actualSpending

          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
          const monthLabel = `${months[month - 1]} ${year}`

          return {
            month,
            year,
            monthLabel,
            budgetSet,
            actualSpending,
            savings,
            savingsPercent: budgetSet > 0 ? (savings / budgetSet) * 100 : 0,
          }
        })
        .sort((a, b) => {
          if (b.year !== a.year) return b.year - a.year
          return b.month - a.month
        })

      // Calculate previous savings for trend
      for (let i = 0; i < monthlyArray.length; i++) {
        if (i + 1 < monthlyArray.length) {
          monthlyArray[i].previousSavings = monthlyArray[i + 1].savings
        }
      }

      setMonthlyData(monthlyArray)
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const getTrendIcon = (current: number, previous?: number) => {
    if (previous === undefined) return '—'
    if (current > previous) return '📈'
    if (current < previous) return '📉'
    return '→'
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white mb-8">Spending vs Saving</h1>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-slate-800 rounded-lg animate-pulse"></div>
            ))}
          </div>
        ) : monthlyData.length === 0 ? (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
            <p className="text-slate-400">No data yet. Set budgets and add transactions to see your spending trends.</p>
          </div>
        ) : (
          <>
            {/* Chart */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-8">
              <h2 className="text-lg font-semibold text-white mb-6">Spending & Savings Trend</h2>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={monthlyData.slice().reverse()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="monthLabel" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }}
                    formatter={(value) => `${getCurrencySymbol(currency)}${Number(value).toFixed(2)}`}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="actualSpending"
                    stroke="#ef4444"
                    strokeWidth={2}
                    name="Actual Spending"
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="savings"
                    stroke="#10b981"
                    strokeWidth={2}
                    name="Savings Achieved"
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Table */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700 bg-slate-900">
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Month</th>
                    <th className="px-6 py-4 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">Budget Set</th>
                    <th className="px-6 py-4 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">Actual Spending</th>
                    <th className="px-6 py-4 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">Savings</th>
                    <th className="px-6 py-4 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">% Saved</th>
                    <th className="px-6 py-4 text-center text-xs font-medium text-slate-400 uppercase tracking-wide">Trend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {monthlyData.map((data) => {
                    const isSavingsPositive = data.savings >= 0
                    const trend = getTrendIcon(data.savings, data.previousSavings)

                    return (
                      <tr key={`${data.year}-${data.month}`} className="hover:bg-slate-700/50 transition">
                        <td className="px-6 py-4">
                          <span className="text-white font-medium">{data.monthLabel}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-white font-medium">{getCurrencySymbol(currency)}{data.budgetSet.toFixed(2)}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-orange-400 font-medium">{getCurrencySymbol(currency)}{data.actualSpending.toFixed(2)}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className={`font-bold ${isSavingsPositive ? 'text-green-400' : 'text-red-400'}`}>
                            {getCurrencySymbol(currency)}{Math.abs(data.savings).toFixed(2)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className={`font-medium ${isSavingsPositive ? 'text-green-400' : 'text-red-400'}`}>
                            {data.savingsPercent.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-lg">{trend}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Summary Stats */}
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <p className="text-slate-400 text-sm font-medium uppercase tracking-wide mb-2">Total Budget Set</p>
                <p className="text-3xl font-bold text-white">
                  {getCurrencySymbol(currency)}
                  {monthlyData.reduce((sum, d) => sum + d.budgetSet, 0).toFixed(2)}
                </p>
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <p className="text-slate-400 text-sm font-medium uppercase tracking-wide mb-2">Total Spending</p>
                <p className="text-3xl font-bold text-orange-400">
                  {getCurrencySymbol(currency)}
                  {monthlyData.reduce((sum, d) => sum + d.actualSpending, 0).toFixed(2)}
                </p>
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <p className="text-slate-400 text-sm font-medium uppercase tracking-wide mb-2">Total Savings</p>
                <p className="text-3xl font-bold text-green-400">
                  {getCurrencySymbol(currency)}
                  {monthlyData.reduce((sum, d) => sum + d.savings, 0).toFixed(2)}
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}
