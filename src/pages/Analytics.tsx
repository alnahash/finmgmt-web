import { useContext, useEffect, useState } from 'react'
import { AuthContext } from '../App'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import {
  getCurrencySymbol,
  getUniquePeriodKeysByType,
  getPeriodDateRangeByType,
  formatPeriodLabel
} from '../lib/utils'
import { BarChart, Bar, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceDot } from 'recharts'
import { TrendingUp, Target, BarChart3, AlertCircle, ChevronDown } from 'lucide-react'

interface Category {
  id: string
  name: string
  icon: string
  color: string
  parent_id?: string
  type?: 'expense' | 'income'
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

interface TrendPoint {
  periodLabel: string
  periodKey: string
  amount: number
  previousAmount: number
  changePercent: number
  changeColor: 'green' | 'red' | 'neutral'
}

export default function Analytics() {
  const { user } = useContext(AuthContext)

  // State
  const [loading, setLoading] = useState(true)
  const [selectedPeriod, setSelectedPeriod] = useState('')
  const [showAllSubCategories, setShowAllSubCategories] = useState(false)
  const [monthStartDay, setMonthStartDay] = useState(1)
  const [pieData, setPieData] = useState<Array<{ name: string; value: number; fill?: string }>>([])
  const [lineData, setLineData] = useState<Array<{ date: string; amount: number }>>([])
  const [categorySpending, setCategorySpending] = useState<CategorySpending[]>([])
  const [budgetStatus, setBudgetStatus] = useState<CategorySpending[]>([])
  const [currency, setCurrency] = useState('USD')
  const [categoryMap, setCategoryMap] = useState<Map<string, Category>>(new Map())

  // Category Spending Trends state
  const [selectedCategoryForTrend, setSelectedCategoryForTrend] = useState<Category | null>(null)
  const [trendPeriodRange, setTrendPeriodRange] = useState<3 | 6 | 12>(6)
  const [trendData, setTrendData] = useState<TrendPoint[]>([])
  const [allTransactionDates, setAllTransactionDates] = useState<string[]>([])

  // Fetch initial data
  useEffect(() => {
    const initData = async () => {
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
          setMonthStartDay(profile.month_start_day || 1)
        }

        // Fetch all transactions and categories
        const { data: txnData } = await supabase
          .from('transactions')
          .select('transaction_date')
          .eq('user_id', user.id)

        const { data: catData } = await supabase
          .from('categories')
          .select('*')
          .eq('user_id', user.id)

        if (txnData && txnData.length > 0) {
          const dates = txnData.map((t) => t.transaction_date)
          setAllTransactionDates(dates)

          const monthStartDayToUse = profile?.month_start_day || 1
          const uniquePeriods = getUniquePeriodKeysByType(dates, 'monthly', monthStartDayToUse)
          if (uniquePeriods.length > 0) {
            setSelectedPeriod(uniquePeriods[0])
          }
        }

        if (catData) {
          const catMap = new Map(catData.map((c) => [c.id, c]))
          setCategoryMap(catMap)
        }

        setLoading(false)
      } catch (error) {
        console.error('Error fetching initial data:', error)
        setLoading(false)
      }
    }

    initData()
  }, [user])

  // Fetch analytics when period changes
  useEffect(() => {
    if (selectedPeriod && user) {
      fetchAnalytics()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod, user])

  // Fetch category trends when category or range changes
  useEffect(() => {
    if (selectedCategoryForTrend && user && allTransactionDates.length > 0) {
      fetchCategoryTrend()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategoryForTrend, trendPeriodRange, user, allTransactionDates])

  const fetchAnalytics = async () => {
    if (!user || !selectedPeriod) return

    try {
      const { startDate, endDate } = getPeriodDateRangeByType(selectedPeriod, 'monthly')

      // Fetch transactions for the period
      const { data: txns } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .gte('transaction_date', startDate)
        .lte('transaction_date', endDate)

      if (!txns || txns.length === 0) {
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

      let totalSpent = 0 // Total expenses only
      txns.forEach((t) => {
        // Separate by category type (income vs expense)
        const cat = categoryMap.get(t.category_id)
        const isIncome = cat?.type === 'income'

        if (isIncome) {
          // Income transaction - tracked separately but not summed for totalSpent
          const current = categoryIncomeMap.get(t.category_id) || { amount: 0, count: 0 }
          categoryIncomeMap.set(t.category_id, {
            amount: current.amount + t.amount,
            count: current.count + 1,
          })
        } else {
          // Expense transaction
          totalSpent += t.amount
          const current = categoryExpenseMap.get(t.category_id) || { amount: 0, count: 0 }
          categoryExpenseMap.set(t.category_id, {
            amount: current.amount + t.amount,
            count: current.count + 1,
          })

          // Daily data (expenses only for cumulative spending)
          const date = t.transaction_date
          const current_daily = dailyData.get(date) || 0
          dailyData.set(date, current_daily + t.amount)
          uniqueDays.add(date)
        }
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

      // Calculate top MAIN categories (sum of all their sub-categories)
      const mainCategoryExpenseMap = new Map<string, { amount: number; parentName: string }>()
      const mainCategoryIncomeMap = new Map<string, { amount: number; parentName: string }>()

      // Group expenses by parent category
      Array.from(categoryExpenseMap.entries()).forEach(([catId, data]) => {
        const cat = categoryMap.get(catId)
        const parentId = cat?.parent_id || catId // If no parent, use own id (main category)
        const parentCat = categoryMap.get(parentId)
        const parentName = parentCat?.name || cat?.name || 'Uncategorized'

        const current = mainCategoryExpenseMap.get(parentId) || { amount: 0, parentName }
        mainCategoryExpenseMap.set(parentId, {
          amount: current.amount + data.amount,
          parentName,
        })
      })

      // Group income by parent category
      Array.from(categoryIncomeMap.entries()).forEach(([catId, data]) => {
        const cat = categoryMap.get(catId)
        const parentId = cat?.parent_id || catId // If no parent, use own id (main category)
        const parentCat = categoryMap.get(parentId)
        const parentName = parentCat?.name || cat?.name || 'Uncategorized'

        const current = mainCategoryIncomeMap.get(parentId) || { amount: 0, parentName }
        mainCategoryIncomeMap.set(parentId, {
          amount: current.amount + data.amount,
          parentName,
        })
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

      // Fetch and calculate budget status (including recurring budgets)
      // Get both specific period budgets and recurring budgets
      const { data: budgets } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_id', user.id)
        .or(`month_period_key.eq.${selectedPeriod},is_recurring.eq.true`)

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

  const fetchCategoryTrend = async () => {
    if (!user || !selectedCategoryForTrend) return

    try {
      // Get unique periods based on current period type (monthly for trends)
      const generatedPeriods = getUniquePeriodKeysByType(
        allTransactionDates,
        'monthly',
        monthStartDay
      )

      // Get last N periods (3, 6, or 12)
      const periodsToFetch = generatedPeriods
        .slice(0, trendPeriodRange)
        .reverse() // Reverse to get oldest first for charting

      const trendPoints: TrendPoint[] = []
      let previousAmount = 0

      // Fetch spending for each period
      for (const period of periodsToFetch) {
        const { startDate, endDate } = getPeriodDateRangeByType(period, 'monthly')

        const { data: txns } = await supabase
          .from('transactions')
          .select('amount')
          .eq('user_id', user.id)
          .eq('category_id', selectedCategoryForTrend.id)
          .gte('transaction_date', startDate)
          .lte('transaction_date', endDate)

        const amount = txns?.reduce((sum, t) => sum + t.amount, 0) || 0
        const changePercent = previousAmount && previousAmount > 0
          ? ((amount - previousAmount) / previousAmount) * 100
          : 0

        let changeColor: 'green' | 'red' | 'neutral' = 'neutral'
        if (previousAmount === 0) {
          changeColor = 'neutral'
        } else if (amount < previousAmount) {
          changeColor = 'green'
        } else if (amount > previousAmount) {
          changeColor = 'red'
        }

        trendPoints.push({
          periodLabel: formatPeriodLabel(period, 'monthly'),
          periodKey: period,
          amount,
          previousAmount,
          changePercent,
          changeColor,
        })

        previousAmount = amount
      }

      setTrendData(trendPoints)
    } catch (error) {
      console.error('Error fetching category trend:', error)
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
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Analytics</h1>
          <p className="text-slate-400 text-sm mt-2">Analyze your spending patterns and trends</p>
        </div>

        {/* Main Content */}
        {!selectedPeriod ? (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
            <p className="text-slate-400">No transaction data available</p>
          </div>
        ) : (
          <>
            {/* Category Spending Trends Section */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-8">
              <div className="flex items-center space-x-2 mb-6">
                <TrendingUp className="w-5 h-5 text-primary-500" />
                <h2 className="text-lg font-semibold text-white">Category Spending Trends</h2>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                {/* Category Selector */}
                <div className="flex-1">
                  <label className="block text-sm text-slate-400 mb-2">Select Category</label>
                  <select
                    value={selectedCategoryForTrend?.id || ''}
                    onChange={(e) => {
                      const catId = e.target.value
                      if (catId) {
                        const cat = categoryMap.get(catId)
                        setSelectedCategoryForTrend(cat || null)
                      } else {
                        setSelectedCategoryForTrend(null)
                      }
                    }}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                  >
                    <option value="">Choose a category...</option>
                    {categorySpending.map((cat) => (
                      <option key={cat.categoryId} value={cat.categoryId}>
                        {cat.categoryIcon} {cat.categoryName}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Period Range Selector */}
                <div className="flex flex-col justify-end gap-2">
                  <label className="text-sm text-slate-400">Period Range</label>
                  <div className="flex gap-2">
                    {([3, 6, 12] as const).map((range) => (
                      <button
                        key={range}
                        onClick={() => setTrendPeriodRange(range)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                          trendPeriodRange === range
                            ? 'bg-primary-600 text-white'
                            : 'bg-slate-700 text-slate-400 hover:text-white'
                        }`}
                      >
                        {range}mo
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Trend Chart */}
              {selectedCategoryForTrend && trendData.length > 0 ? (
                <div>
                  <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={trendData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis
                        dataKey="periodLabel"
                        stroke="#94a3b8"
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis stroke="#94a3b8" />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }}
                        formatter={(value: number | string) => `${getCurrencySymbol(currency)}${typeof value === 'number' ? value.toFixed(2) : parseFloat(value).toFixed(2)}`}
                        labelFormatter={(label: string) => `${label}`}
                      />
                      <Line
                        type="monotone"
                        dataKey="amount"
                        stroke={selectedCategoryForTrend.color || '#f97316'}
                        strokeWidth={2}
                        isAnimationActive={false}
                      />
                      {/* Color-coded dots for trend direction */}
                      {trendData.map((point, idx) => (
                        <ReferenceDot
                          key={idx}
                          x={point.periodLabel}
                          y={point.amount}
                          r={5}
                          fill={
                            point.changeColor === 'green'
                              ? '#10b981'
                              : point.changeColor === 'red'
                              ? '#ef4444'
                              : '#94a3b8'
                          }
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>

                  {/* Trend Stats */}
                  <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-slate-700 rounded-lg p-4">
                      <p className="text-xs text-slate-400 mb-1">Average Spending</p>
                      <p className="text-lg font-semibold text-white">
                        {getCurrencySymbol(currency)}
                        {(trendData.reduce((sum, p) => sum + p.amount, 0) / trendData.length).toFixed(2)}
                      </p>
                    </div>
                    <div className="bg-slate-700 rounded-lg p-4">
                      <p className="text-xs text-slate-400 mb-1">Highest Month</p>
                      <p className="text-lg font-semibold text-white">
                        {getCurrencySymbol(currency)}
                        {Math.max(...trendData.map((p) => p.amount)).toFixed(2)}
                      </p>
                    </div>
                    <div className="bg-slate-700 rounded-lg p-4">
                      <p className="text-xs text-slate-400 mb-1">Trend</p>
                      <p className={`text-lg font-semibold ${
                        trendData.length > 1 && trendData[trendData.length - 1].changeColor === 'green'
                          ? 'text-green-400'
                          : trendData.length > 1 && trendData[trendData.length - 1].changeColor === 'red'
                          ? 'text-red-400'
                          : 'text-slate-400'
                      }`}>
                        {trendData.length > 1 && trendData[trendData.length - 1].changePercent !== 0
                          ? `${trendData[trendData.length - 1].changePercent > 0 ? '↑' : '↓'} ${Math.abs(trendData[trendData.length - 1].changePercent).toFixed(1)}%`
                          : 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>
              ) : selectedCategoryForTrend ? (
                <div className="text-center py-12">
                  <p className="text-slate-400">No spending data available for this category in the selected period range</p>
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-slate-400">Select a category to view spending trends</p>
                </div>
              )}
            </div>

            {/* Charts Section */}
            {pieData.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                {/* Bar Chart - Spending by Category */}
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                  <div className="flex items-center space-x-2 mb-6">
                    <BarChart3 className="w-5 h-5 text-primary-500" />
                    <h2 className="text-lg font-semibold text-white">Spending by Category (High to Low)</h2>
                  </div>
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart
                      data={pieData}
                      margin={{ top: 20, right: 30, left: 0, bottom: 80 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis
                        dataKey="name"
                        stroke="#94a3b8"
                        angle={-45}
                        textAnchor="end"
                        height={120}
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis stroke="#94a3b8" />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }}
                        formatter={(value) => `${getCurrencySymbol(currency)}${value}`}
                      />
                      <Bar dataKey="value" fill="#f97316" radius={[8, 8, 0, 0]}>
                        {pieData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Line Chart */}
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                  <div className="flex items-center space-x-2 mb-6">
                    <TrendingUp className="w-5 h-5 text-primary-500" />
                    <h2 className="text-lg font-semibold text-white">Daily Cumulative Spending</h2>
                  </div>
                  <ResponsiveContainer width="100%" height={350}>
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

            {/* Category Breakdown - Main and Sub Categories */}
            {(categorySpending.filter(cat => !categoryMap.get(cat.categoryId)?.parent_id).length > 0 ||
              categorySpending.filter(cat => categoryMap.get(cat.categoryId)?.parent_id).length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                {/* Main Categories */}
                {categorySpending.filter(cat => !categoryMap.get(cat.categoryId)?.parent_id).length > 0 && (
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                    <div className="flex items-center space-x-2 mb-6">
                      <BarChart3 className="w-5 h-5 text-primary-500" />
                      <h2 className="text-lg font-semibold text-white">Main Category Breakdown</h2>
                    </div>

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
                )}

                {/* Sub Categories */}
                {categorySpending.filter(cat => categoryMap.get(cat.categoryId)?.parent_id).length > 0 && (
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                    <div className="flex items-center space-x-2 mb-6">
                      <BarChart3 className="w-5 h-5 text-primary-500" />
                      <h2 className="text-lg font-semibold text-white">
                        Sub Category Breakdown
                        <span className="text-sm text-slate-400 ml-2">
                          ({showAllSubCategories ? categorySpending.filter(cat => categoryMap.get(cat.categoryId)?.parent_id).length : Math.min(5, categorySpending.filter(cat => categoryMap.get(cat.categoryId)?.parent_id).length)} shown)
                        </span>
                      </h2>
                    </div>

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
                          .slice(0, showAllSubCategories ? undefined : 5)
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

                    {/* Show More Button */}
                    {categorySpending.filter(cat => categoryMap.get(cat.categoryId)?.parent_id).length > 5 && (
                      <div className="mt-4 flex justify-center">
                        <button
                          onClick={() => setShowAllSubCategories(!showAllSubCategories)}
                          className="flex items-center space-x-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium text-white transition"
                        >
                          {showAllSubCategories ? (
                            <>
                              <span>Show Less</span>
                              <ChevronDown className="w-4 h-4 rotate-180" />
                            </>
                          ) : (
                            <>
                              <span>Show More</span>
                              <ChevronDown className="w-4 h-4" />
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Empty State */}
                {categorySpending.length === 0 && (
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center col-span-1 lg:col-span-2">
                    <AlertCircle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400">No transaction data for this period</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
