import { useContext, useEffect, useState } from 'react'
import { AuthContext } from '../App'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { getPeriodLabel, getPeriodDateRange, getUniquePeriodKeys, getCurrencySymbol } from '../lib/utils'
import { BarChart, Bar, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { TrendingUp, Target, DollarSign, BarChart3, Calendar, AlertCircle, ChevronDown } from 'lucide-react'

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
  totalSpent: number // Only expenses
  totalIncome: number // Only income
  savingsThisMonth: number // Income - Expenses
  avgPerTransaction: number
  topCategoryExpense: string
  topCategoryExpenseAmount: number
  topCategoryIncome: string
  topCategoryIncomeAmount: number
  topSubCategoryExpense: string
  topSubCategoryExpenseAmount: number
  topSubCategoryIncome: string
  topSubCategoryIncomeAmount: number
  topSubCategoryByCount: string
  topSubCategoryByCountAmount: number
  topSubCategoryByCountSpent: number
  topCategoryByCount: string
  topCategoryByCountAmount: number
  topCategoryByCountSpent: number
  daysTracked: number
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
  const [showAllSubCategories, setShowAllSubCategories] = useState(false)
  const [stats, setStats] = useState<AnalyticsStats>({
    totalTransactions: 0,
    totalSpent: 0,
    totalIncome: 0,
    savingsThisMonth: 0,
    avgPerTransaction: 0,
    topCategoryExpense: '',
    topCategoryExpenseAmount: 0,
    topCategoryIncome: '',
    topCategoryIncomeAmount: 0,
    topSubCategoryExpense: '',
    topSubCategoryExpenseAmount: 0,
    topSubCategoryIncome: '',
    topSubCategoryIncomeAmount: 0,
    topSubCategoryByCount: '',
    topSubCategoryByCountAmount: 0,
    topSubCategoryByCountSpent: 0,
    topCategoryByCount: '',
    topCategoryByCountAmount: 0,
    topCategoryByCountSpent: 0,
    daysTracked: 0,
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
          totalIncome: 0,
          savingsThisMonth: 0,
          avgPerTransaction: 0,
          topCategoryExpense: 'N/A',
          topCategoryExpenseAmount: 0,
          topCategoryIncome: 'N/A',
          topCategoryIncomeAmount: 0,
          topSubCategoryExpense: 'N/A',
          topSubCategoryExpenseAmount: 0,
          topSubCategoryIncome: 'N/A',
          topSubCategoryIncomeAmount: 0,
          topSubCategoryByCount: 'N/A',
          topSubCategoryByCountAmount: 0,
          topSubCategoryByCountSpent: 0,
          topCategoryByCount: 'N/A',
          topCategoryByCountAmount: 0,
          topCategoryByCountSpent: 0,
          daysTracked: 0,
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

      let totalSpent = 0 // Total expenses only
      let totalIncome = 0 // Total income only
      txns.forEach((t) => {
        // Separate by category type (income vs expense)
        const cat = categoryMap.get(t.category_id)
        const isIncome = cat?.type === 'income'

        if (isIncome) {
          // Income transaction
          totalIncome += t.amount
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

      // Get top main categories
      const topExpenseCat = Array.from(mainCategoryExpenseMap.entries())
        .map(([, data]) => ({
          name: data.parentName,
          value: data.amount,
        }))
        .sort((a, b) => b.value - a.value)[0]

      const topIncomeCatData = Array.from(mainCategoryIncomeMap.entries())
        .map(([, data]) => ({
          name: data.parentName,
          value: data.amount,
        }))
        .sort((a, b) => b.value - a.value)[0]

      // Calculate top sub-categories (categories with parent_id)
      const topExpenseSubCat = Array.from(categoryExpenseMap.entries())
        .filter(([catId]) => categoryMap.get(catId)?.parent_id) // Only sub-categories
        .map(([catId, data]) => {
          const cat = categoryMap.get(catId)
          return {
            name: cat?.name || 'Uncategorized',
            value: data.amount,
          }
        })
        .sort((a, b) => b.value - a.value)[0]

      const topIncomeSubCat = Array.from(categoryIncomeMap.entries())
        .filter(([catId]) => categoryMap.get(catId)?.parent_id) // Only sub-categories
        .map(([catId, data]) => {
          const cat = categoryMap.get(catId)
          return {
            name: cat?.name || 'Uncategorized',
            value: data.amount,
          }
        })
        .sort((a, b) => b.value - a.value)[0]

      // Calculate top categories by transaction count
      const topSubCategoryByCount = Array.from(categoryExpenseMap.entries())
        .filter(([catId]) => categoryMap.get(catId)?.parent_id) // Only sub-categories
        .map(([catId, data]) => {
          const cat = categoryMap.get(catId)
          return {
            name: cat?.name || 'Uncategorized',
            count: data.count,
            spent: data.amount,
          }
        })
        .sort((a, b) => b.count - a.count)[0]

      // Calculate top category by count (summing sub-category counts)
      const categoryCountMap = new Map<string, { name: string; count: number; spent: number }>()
      Array.from(categoryExpenseMap.entries()).forEach(([catId, data]) => {
        const cat = categoryMap.get(catId)
        const parentId = cat?.parent_id || catId
        const parentCat = categoryMap.get(parentId)
        const parentName = parentCat?.name || cat?.name || 'Uncategorized'

        const current = categoryCountMap.get(parentId) || { name: parentName, count: 0, spent: 0 }
        categoryCountMap.set(parentId, {
          name: parentName,
          count: current.count + data.count,
          spent: current.spent + data.amount,
        })
      })

      const topCategoryByCountData = Array.from(categoryCountMap.entries())
        .map(([, data]) => data)
        .sort((a, b) => b.count - a.count)[0]

      const daysTracked = uniqueDays.size
      const avgPerTransaction = txns.length > 0 ? totalSpent / txns.length : 0
      const savingsThisMonth = totalIncome - totalSpent

      setStats({
        totalTransactions: txns.length,
        totalSpent: parseFloat(totalSpent.toFixed(2)),
        totalIncome: parseFloat(totalIncome.toFixed(2)),
        savingsThisMonth: parseFloat(savingsThisMonth.toFixed(2)),
        avgPerTransaction: parseFloat(avgPerTransaction.toFixed(2)),
        topCategoryExpense: topExpenseCat?.name || 'N/A',
        topCategoryExpenseAmount: parseFloat((topExpenseCat?.value || 0).toFixed(2)),
        topCategoryIncome: topIncomeCatData?.name || 'N/A',
        topCategoryIncomeAmount: parseFloat((topIncomeCatData?.value || 0).toFixed(2)),
        topSubCategoryExpense: topExpenseSubCat?.name || 'N/A',
        topSubCategoryExpenseAmount: parseFloat((topExpenseSubCat?.value || 0).toFixed(2)),
        topSubCategoryIncome: topIncomeSubCat?.name || 'N/A',
        topSubCategoryIncomeAmount: parseFloat((topIncomeSubCat?.value || 0).toFixed(2)),
        topSubCategoryByCount: topSubCategoryByCount?.name || 'N/A',
        topSubCategoryByCountAmount: topSubCategoryByCount?.count || 0,
        topSubCategoryByCountSpent: parseFloat((topSubCategoryByCount?.spent || 0).toFixed(2)),
        topCategoryByCount: topCategoryByCountData?.name || 'N/A',
        topCategoryByCountAmount: topCategoryByCountData?.count || 0,
        topCategoryByCountSpent: parseFloat((topCategoryByCountData?.spent || 0).toFixed(2)),
        daysTracked,
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
            <div className="gap-4 mb-8" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)' }}>
              {/* Total Transactions */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-xs font-medium">Total Transactions</p>
                    <p className="text-xl font-bold text-white mt-1">{stats.totalTransactions}</p>
                  </div>
                  <BarChart3 className="w-8 h-8 text-primary-500/50" />
                </div>
              </div>

              {/* Days Tracked */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-xs font-medium">Days Tracked</p>
                    <p className="text-xl font-bold text-white mt-1">{stats.daysTracked}</p>
                  </div>
                  <Calendar className="w-8 h-8 text-green-500/50" />
                </div>
              </div>

              {/* Total Spent */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-xs font-medium">Total Spent</p>
                    <p className="text-xl font-bold text-white mt-1">
                      {getCurrencySymbol(currency)}{stats.totalSpent.toFixed(2)}
                    </p>
                  </div>
                  <DollarSign className="w-8 h-8 text-orange-500/50" />
                </div>
              </div>

              {/* Savings this Month */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-xs font-medium">Total Saving</p>
                    <p className={`text-xl font-bold mt-1 ${stats.savingsThisMonth >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {getCurrencySymbol(currency)}{stats.savingsThisMonth.toFixed(2)}
                    </p>
                  </div>
                  <TrendingUp className={`w-8 h-8 ${stats.savingsThisMonth >= 0 ? 'text-green-500/50' : 'text-red-500/50'}`} />
                </div>
              </div>

              {/* Average Per Transaction */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-xs font-medium">Avg Per Transaction</p>
                    <p className="text-xl font-bold text-white mt-1">
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
                    <p className="text-slate-400 text-xs font-medium">Top Category Expense</p>
                    <p className="text-sm font-bold text-orange-500 mt-1">{stats.topCategoryExpense}</p>
                    <p className="text-xs font-semibold text-white mt-1">
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
                    <p className="text-slate-400 text-xs font-medium">Top Category Income</p>
                    <p className="text-sm font-bold text-green-500 mt-1">{stats.topCategoryIncome}</p>
                    <p className="text-xs font-semibold text-white mt-1">
                      {getCurrencySymbol(currency)}{stats.topCategoryIncomeAmount.toFixed(2)}
                    </p>
                  </div>
                  <DollarSign className="w-8 h-8 text-green-500/50" />
                </div>
              </div>

              {/* Top Sub-Category Expense */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-xs font-medium">Top Sub-Category Expense</p>
                    <p className="text-sm font-bold text-orange-500 mt-1">{stats.topSubCategoryExpense}</p>
                    <p className="text-xs font-semibold text-white mt-1">
                      {getCurrencySymbol(currency)}{stats.topSubCategoryExpenseAmount.toFixed(2)}
                    </p>
                  </div>
                  <Target className="w-8 h-8 text-orange-500/50" />
                </div>
              </div>

              {/* Top Sub-Category Income */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-xs font-medium">Top Sub-Category Income</p>
                    <p className="text-sm font-bold text-green-500 mt-1">{stats.topSubCategoryIncome}</p>
                    <p className="text-xs font-semibold text-white mt-1">
                      {getCurrencySymbol(currency)}{stats.topSubCategoryIncomeAmount.toFixed(2)}
                    </p>
                  </div>
                  <DollarSign className="w-8 h-8 text-green-500/50" />
                </div>
              </div>

              {/* Top Sub-Category by Count */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-xs font-medium">Most Frequent Sub-Category</p>
                    <p className="text-sm font-bold text-orange-400 mt-1">{stats.topSubCategoryByCount}</p>
                    <p className="text-xs text-slate-300 mt-1">{stats.topSubCategoryByCountAmount} Transactions</p>
                    <p className="text-xs font-semibold text-white mt-1">
                      {getCurrencySymbol(currency)}{stats.topSubCategoryByCountSpent.toFixed(2)}
                    </p>
                  </div>
                  <BarChart3 className="w-8 h-8 text-orange-500/50" />
                </div>
              </div>

              {/* Top Category by Count */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-xs font-medium">Most Frequent Main Category</p>
                    <p className="text-sm font-bold text-blue-400 mt-1">{stats.topCategoryByCount}</p>
                    <p className="text-xs text-slate-300 mt-1">{stats.topCategoryByCountAmount} Transactions</p>
                    <p className="text-xs font-semibold text-white mt-1">
                      {getCurrencySymbol(currency)}{stats.topCategoryByCountSpent.toFixed(2)}
                    </p>
                  </div>
                  <BarChart3 className="w-8 h-8 text-blue-500/50" />
                </div>
              </div>

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
