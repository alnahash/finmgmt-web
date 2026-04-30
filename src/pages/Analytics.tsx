import { useContext, useEffect, useState } from 'react'
import { AuthContext } from '../App'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { getPeriodLabel, getPeriodDateRange, getUniquePeriodKeys, getCurrencySymbol } from '../lib/utils'
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { TrendingUp, TrendingDown, Target, DollarSign, BarChart3, Calendar, AlertCircle } from 'lucide-react'

interface Category {
  id: string
  name: string
  icon: string
  color: string
  parent_id?: string
  type?: 'expense' | 'income'
}

interface AnalyticsStats {
  totalTransactions: number
  totalSpent: number
  avgPerTransaction: number
  topCategoryExpense: string
  topCategoryExpenseAmount: number
  topCategoryIncome: string
  topCategoryIncomeAmount: number
  daysTracked: number
  spendingTrend: number // percentage change from previous period
}

interface CategorySpending {
  categoryId: string
  categoryName: string
  categoryColor: string
  categoryIcon: string
  spent: number
  percentage: number
  transactionCount: number
  budgetLimit?: number
  budgetUtilization?: number
}

export default function Analytics() {
  const { user } = useContext(AuthContext)

  // State
  const [loading, setLoading] = useState(true)
  const [selectedPeriod, setSelectedPeriod] = useState('')
  const [periods, setPeriods] = useState<string[]>([])
  const [stats, setStats] = useState<AnalyticsStats>({
    totalTransactions: 0,
    totalSpent: 0,
    avgPerTransaction: 0,
    topCategoryExpense: '',
    topCategoryExpenseAmount: 0,
    topCategoryIncome: '',
    topCategoryIncomeAmount: 0,
    daysTracked: 0,
    spendingTrend: 0,
  })
  const [pieData, setPieData] = useState<any[]>([])
  const [lineData, setLineData] = useState<any[]>([])
  const [categorySpending, setCategorySpending] = useState<CategorySpending[]>([])
  const [budgetStatus, setBudgetStatus] = useState<CategorySpending[]>([])
  const [currency, setCurrency] = useState('USD')
  const [categoryMap, setCategoryMap] = useState<Map<string, Category>>(new Map())

  // Fetch initial data
  useEffect(() => {
    fetchInitialData()
  }, [user])

  // Fetch analytics when period changes
  useEffect(() => {
    if (selectedPeriod && user) {
      fetchAnalytics()
    }
  }, [selectedPeriod, user])

  const fetchInitialData = async () => {
    if (!user) return
    setLoading(true)

    try {
      // Fetch profile for currency and month start day
      const { data: profile } = await supabase
        .from('profiles')
        .select('currency, month_start_day')
        .eq('id', user.id)
        .single()

      if (profile) {
        setCurrency(profile.currency || 'USD')
      }

      // Fetch categories
      const { data: cats } = await supabase
        .from('categories')
        .select('id, name, icon, color, parent_id, type')
        .eq('user_id', user.id)

      const catMap = new Map()
      cats?.forEach((cat) => {
        catMap.set(cat.id, {
          id: cat.id,
          name: cat.name,
          icon: cat.icon,
          color: cat.color || '#f97316',
          parent_id: cat.parent_id,
          type: cat.type || 'expense',
        })
      })
      setCategoryMap(catMap)

      // Fetch all transactions to get available periods
      const { data: allTxns } = await supabase
        .from('transactions')
        .select('transaction_date')
        .eq('user_id', user.id)

      const monthStartDayToUse = profile?.month_start_day || 1
      if (allTxns && allTxns.length > 0) {
        const availablePeriods = getUniquePeriodKeys(
          allTxns.map((t) => t.transaction_date),
          monthStartDayToUse
        )
        setPeriods(availablePeriods)

        // Select the first (most recent) period
        if (availablePeriods.length > 0) {
          setSelectedPeriod(availablePeriods[0])
        }
      }
    } catch (error) {
      console.error('Error fetching initial data:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchAnalytics = async () => {
    if (!user || !selectedPeriod) return

    try {
      const { startDate, endDate } = getPeriodDateRange(selectedPeriod)

      // Fetch transactions for the period
      const { data: txns } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .gte('transaction_date', startDate)
        .lte('transaction_date', endDate)

      if (!txns || txns.length === 0) {
        setStats({
          totalTransactions: 0,
          totalSpent: 0,
          avgPerTransaction: 0,
          topCategoryExpense: 'N/A',
          topCategoryExpenseAmount: 0,
          topCategoryIncome: 'N/A',
          topCategoryIncomeAmount: 0,
          daysTracked: 0,
          spendingTrend: 0,
        })
        setPieData([])
        setLineData([])
        setCategorySpending([])
        setBudgetStatus([])
        return
      }

      // Calculate category totals and statistics (separate income and expenses by category type)
      const categoryExpenseMap = new Map<string, { amount: number; count: number }>()
      const categoryIncomeMap = new Map<string, { amount: number; count: number }>()
      const dailyData = new Map<string, number>()
      const uniqueDays = new Set<string>()

      let totalSpent = 0
      txns.forEach((t) => {
        totalSpent += t.amount

        // Separate by category type (income vs expense)
        const cat = categoryMap.get(t.category_id)
        const isIncome = cat?.type === 'income'

        if (isIncome) {
          // Income transaction
          const current = categoryIncomeMap.get(t.category_id) || { amount: 0, count: 0 }
          categoryIncomeMap.set(t.category_id, {
            amount: current.amount + t.amount,
            count: current.count + 1,
          })
        } else {
          // Expense transaction
          const current = categoryExpenseMap.get(t.category_id) || { amount: 0, count: 0 }
          categoryExpenseMap.set(t.category_id, {
            amount: current.amount + t.amount,
            count: current.count + 1,
          })
        }

        // Daily data (including income and expenses)
        const date = t.transaction_date
        const current_daily = dailyData.get(date) || 0
        dailyData.set(date, current_daily + t.amount)
        uniqueDays.add(date)
      })

      // Build pie chart data (expenses only)
      const pieChartData = Array.from(categoryExpenseMap.entries())
        .map(([catId, data]) => {
          const cat = categoryMap.get(catId)
          return {
            name: cat?.name || 'Uncategorized',
            value: parseFloat(data.amount.toFixed(2)),
            icon: cat?.icon || '📁',
            color: cat?.color || '#f97316',
          }
        })
        .sort((a, b) => b.value - a.value)

      // Group smaller categories as "Other"
      const topCategories = pieChartData.slice(0, 5)
      const otherAmount = pieChartData.slice(5).reduce((sum, cat) => sum + cat.value, 0)
      if (otherAmount > 0) {
        topCategories.push({
          name: 'Other',
          value: parseFloat(otherAmount.toFixed(2)),
          icon: '📊',
          color: '#94a3b8',
        })
      }

      setPieData(topCategories)

      // Build line chart data (daily cumulative)
      const sortedDates = Array.from(dailyData.keys()).sort()
      let cumulativeSum = 0
      const lineChartData = sortedDates.map((date) => {
        cumulativeSum += dailyData.get(date) || 0
        return {
          date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          amount: parseFloat(cumulativeSum.toFixed(2)),
        }
      })

      setLineData(lineChartData)

      // Calculate enhanced statistics
      const topExpenseCat = pieChartData.find(cat => cat.name !== 'Other')
      const topIncomeCatData = Array.from(categoryIncomeMap.entries())
        .map(([catId, data]) => {
          const cat = categoryMap.get(catId)
          return {
            name: cat?.name || 'Uncategorized',
            value: data.amount,
          }
        })
        .sort((a, b) => b.value - a.value)[0]

      const daysTracked = uniqueDays.size
      const avgPerTransaction = txns.length > 0 ? totalSpent / txns.length : 0

      setStats({
        totalTransactions: txns.length,
        totalSpent: parseFloat(totalSpent.toFixed(2)),
        avgPerTransaction: parseFloat(avgPerTransaction.toFixed(2)),
        topCategoryExpense: topExpenseCat?.name || 'N/A',
        topCategoryExpenseAmount: parseFloat((topExpenseCat?.value || 0).toFixed(2)),
        topCategoryIncome: topIncomeCatData?.name || 'N/A',
        topCategoryIncomeAmount: parseFloat((topIncomeCatData?.value || 0).toFixed(2)),
        daysTracked,
        spendingTrend: 0, // TODO: Calculate trend from previous period
      })

      // Build category spending data (expenses only)
      const categorySpendingData = Array.from(categoryExpenseMap.entries())
        .map(([catId, data]) => {
          const cat = categoryMap.get(catId)
          return {
            categoryId: catId,
            categoryName: cat?.name || 'Uncategorized',
            categoryColor: cat?.color || '#f97316',
            categoryIcon: cat?.icon || '📁',
            spent: parseFloat(data.amount.toFixed(2)),
            percentage: (data.amount / totalSpent) * 100,
            transactionCount: data.count,
          }
        })
        .sort((a, b) => b.spent - a.spent)

      setCategorySpending(categorySpendingData)

      // Fetch and calculate budget status
      const { data: budgets } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_id', user.id)
        .eq('month_period_key', selectedPeriod)

      if (budgets && budgets.length > 0) {
        const budgetStatusData = budgets
          .map((budget) => {
            const catId = budget.category_id
            const cat = categoryMap.get(catId)
            const spent = categoryExpenseMap.get(catId)?.amount || 0
            const budgetAmount = budget.amount
            const utilization = (spent / budgetAmount) * 100

            return {
              categoryId: catId,
              categoryName: cat?.name || 'Uncategorized',
              categoryColor: cat?.color || '#f97316',
              categoryIcon: cat?.icon || '📁',
              spent: parseFloat(spent.toFixed(2)),
              percentage: utilization,
              transactionCount: categoryExpenseMap.get(catId)?.count || 0,
              budgetLimit: budgetAmount,
              budgetUtilization: parseFloat(utilization.toFixed(1)),
            }
          })
          .sort((a, b) => (b.budgetUtilization || 0) - (a.budgetUtilization || 0))

        setBudgetStatus(budgetStatusData)
      }
    } catch (error) {
      console.error('Error fetching analytics:', error)
    }
  }

  const getBudgetStatusColor = (utilization: number) => {
    if (utilization >= 95) return 'bg-red-500'
    if (utilization >= 75) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  const COLORS = ['#f97316', '#fb923c', '#fdba74', '#fed7aa', '#fef08a']

  if (loading) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-24 bg-slate-800 rounded-lg animate-pulse"></div>
            ))}
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header with Period Selector */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <h1 className="text-3xl font-bold text-white mb-4 md:mb-0">Analytics</h1>
          <div className="flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-slate-400" />
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
            >
              {periods.map((period) => (
                <option key={period} value={period}>
                  {getPeriodLabel(period)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Main Content */}
        {!selectedPeriod ? (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
            <p className="text-slate-400">No transaction data available</p>
          </div>
        ) : (
          <>
            {/* Enhanced Metrics Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {/* Total Transactions */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm font-medium">Total Transactions</p>
                    <p className="text-3xl font-bold text-white mt-2">{stats.totalTransactions}</p>
                  </div>
                  <BarChart3 className="w-8 h-8 text-primary-500/50" />
                </div>
              </div>

              {/* Total Spent */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm font-medium">Total Spent</p>
                    <p className="text-3xl font-bold text-white mt-2">
                      {getCurrencySymbol(currency)}{stats.totalSpent.toFixed(2)}
                    </p>
                  </div>
                  <DollarSign className="w-8 h-8 text-orange-500/50" />
                </div>
              </div>

              {/* Average Per Transaction */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm font-medium">Avg Per Transaction</p>
                    <p className="text-3xl font-bold text-white mt-2">
                      {getCurrencySymbol(currency)}{stats.avgPerTransaction.toFixed(2)}
                    </p>
                  </div>
                  <BarChart3 className="w-8 h-8 text-blue-500/50" />
                </div>
              </div>

              {/* Top Category Expense */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm font-medium">Top Category Expense</p>
                    <p className="text-2xl font-bold text-orange-500 mt-2">{stats.topCategoryExpense}</p>
                    <p className="text-lg font-semibold text-white mt-1">
                      {getCurrencySymbol(currency)}{stats.topCategoryExpenseAmount.toFixed(2)}
                    </p>
                  </div>
                  <Target className="w-8 h-8 text-orange-500/50" />
                </div>
              </div>

              {/* Top Category Income */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm font-medium">Top Category Income</p>
                    <p className="text-2xl font-bold text-green-500 mt-2">{stats.topCategoryIncome}</p>
                    <p className="text-lg font-semibold text-white mt-1">
                      {getCurrencySymbol(currency)}{stats.topCategoryIncomeAmount.toFixed(2)}
                    </p>
                  </div>
                  <DollarSign className="w-8 h-8 text-green-500/50" />
                </div>
              </div>

              {/* Days Tracked */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm font-medium">Days Tracked</p>
                    <p className="text-3xl font-bold text-white mt-2">{stats.daysTracked}</p>
                  </div>
                  <Calendar className="w-8 h-8 text-green-500/50" />
                </div>
              </div>

              {/* Spending Trend */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm font-medium">Spending Trend</p>
                    <div className="flex items-center space-x-2 mt-2">
                      <p className="text-2xl font-bold text-white">
                        {stats.spendingTrend > 0 ? '+' : ''}{stats.spendingTrend.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                  {stats.spendingTrend > 0 ? (
                    <TrendingUp className="w-8 h-8 text-red-500/50" />
                  ) : (
                    <TrendingDown className="w-8 h-8 text-green-500/50" />
                  )}
                </div>
              </div>
            </div>

            {/* Charts Section */}
            {pieData.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
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
                        label={({ name, value }) => `${name}: ${getCurrencySymbol(currency)}${value}`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {pieData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => `${getCurrencySymbol(currency)}${value}`} />
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
                        formatter={(value) => `${getCurrencySymbol(currency)}${value}`}
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

            {/* Budget Status Section */}
            {budgetStatus.length > 0 && (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-8">
                <div className="flex items-center space-x-2 mb-6">
                  <Target className="w-5 h-5 text-primary-500" />
                  <h2 className="text-lg font-semibold text-white">Budget Status</h2>
                </div>

                <div className="space-y-4">
                  {budgetStatus.map((cat) => (
                    <div key={cat.categoryId}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-2xl">{cat.categoryIcon}</span>
                          <div>
                            <p className="text-sm font-medium text-white">{cat.categoryName}</p>
                            <p className="text-xs text-slate-400">
                              {getCurrencySymbol(currency)}{cat.spent.toFixed(2)} / {getCurrencySymbol(currency)}{cat.budgetLimit?.toFixed(2)}
                            </p>
                          </div>
                        </div>
                        <p className={`text-sm font-semibold ${
                          (cat.budgetUtilization || 0) >= 95
                            ? 'text-red-400'
                            : (cat.budgetUtilization || 0) >= 75
                            ? 'text-yellow-400'
                            : 'text-green-400'
                        }`}>
                          {(cat.budgetUtilization || 0).toFixed(0)}%
                        </p>
                      </div>
                      <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${getBudgetStatusColor(cat.budgetUtilization || 0)}`}
                          style={{ width: `${Math.min(cat.budgetUtilization || 0, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Category Breakdown - Main Categories */}
            {categorySpending.filter(cat => !categoryMap.get(cat.categoryId)?.parent_id).length > 0 && (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-8">
                <div className="flex items-center space-x-2 mb-6">
                  <BarChart3 className="w-5 h-5 text-primary-500" />
                  <h2 className="text-lg font-semibold text-white">Main Category Breakdown</h2>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-300">Category</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-slate-300">Spent</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-slate-300">% of Total</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-slate-300">Transactions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categorySpending
                        .filter(cat => !categoryMap.get(cat.categoryId)?.parent_id)
                        .map((cat) => (
                          <tr key={cat.categoryId} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition">
                            <td className="py-3 px-4">
                              <div className="flex items-center space-x-2">
                                <span className="text-xl">{cat.categoryIcon}</span>
                                <span className="text-sm font-medium text-white">{cat.categoryName}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right text-sm text-white">
                              {getCurrencySymbol(currency)}{cat.spent.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-right text-sm text-white">
                              {cat.percentage.toFixed(1)}%
                            </td>
                            <td className="py-3 px-4 text-right text-sm text-slate-400">
                              {cat.transactionCount}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Category Breakdown - Sub Categories */}
            {categorySpending.filter(cat => categoryMap.get(cat.categoryId)?.parent_id).length > 0 && (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <div className="flex items-center space-x-2 mb-6">
                  <BarChart3 className="w-5 h-5 text-primary-500" />
                  <h2 className="text-lg font-semibold text-white">Sub Category Breakdown</h2>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-300">Sub Category</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-300">Main Category</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-slate-300">Spent</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-slate-300">% of Total</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-slate-300">Transactions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categorySpending
                        .filter(cat => categoryMap.get(cat.categoryId)?.parent_id)
                        .map((cat) => {
                          const parentId = categoryMap.get(cat.categoryId)?.parent_id
                          const parentCategory = parentId ? categoryMap.get(parentId) : null
                          return (
                            <tr key={cat.categoryId} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition">
                              <td className="py-3 px-4">
                                <div className="flex items-center space-x-2">
                                  <span className="text-xl">{cat.categoryIcon}</span>
                                  <span className="text-sm text-white">{cat.categoryName}</span>
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center space-x-1 text-sm text-slate-300">
                                  <span>{parentCategory?.icon || '📁'}</span>
                                  <span>{parentCategory?.name || 'Unknown'}</span>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-right text-sm text-white">
                                {getCurrencySymbol(currency)}{cat.spent.toFixed(2)}
                              </td>
                              <td className="py-3 px-4 text-right text-sm text-white">
                                {cat.percentage.toFixed(1)}%
                              </td>
                              <td className="py-3 px-4 text-right text-sm text-slate-400">
                                {cat.transactionCount}
                              </td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Empty State */}
            {categorySpending.length === 0 && (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
                <AlertCircle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">No transaction data for this period</p>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
