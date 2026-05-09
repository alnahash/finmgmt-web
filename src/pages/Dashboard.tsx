import { useContext, useEffect, useState } from 'react'
import { AuthContext } from '../App'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { getPeriodLabel, getPeriodDateRange, getUniquePeriodKeys, getCurrencySymbol } from '../lib/utils'
import { TrendingDown, DollarSign, Target, Calendar, Percent, Tag, Info } from 'lucide-react'

interface Stats {
  totalSpent: number
  budgetRemaining: number
  transactions: number
  daysTracked: number
  avgPerTransaction: number
  topCategory: string
  monthlyBudget: number
}

export default function Dashboard() {
  const { user } = useContext(AuthContext)
  const [stats, setStats] = useState<Stats>({
    totalSpent: 0,
    budgetRemaining: 0,
    transactions: 0,
    daysTracked: 0,
    avgPerTransaction: 0,
    topCategory: 'N/A',
    monthlyBudget: 0
  })
  const [loading, setLoading] = useState(true)
  const [selectedPeriod, setSelectedPeriod] = useState('')
  const [periods, setPeriods] = useState<string[]>([])
  const [currency, setCurrency] = useState('USD')

  // Fetch initial data (profile, periods)
  useEffect(() => {
    const fetchInitialData = async () => {
      if (!user) return
      setLoading(true)

      try {
        // Get profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('monthly_budget, month_start_day, currency')
          .eq('id', user.id)
          .single()

        if (profile) {
          setCurrency(profile.currency || 'USD')
        }

        // Get all transactions to generate available periods
        const { data: allTransactions } = await supabase
          .from('transactions')
          .select('transaction_date')
          .eq('user_id', user.id)

        const monthStartDayToUse = profile?.month_start_day || 1
        if (allTransactions && allTransactions.length > 0) {
          const availablePeriods = getUniquePeriodKeys(
            allTransactions.map((t) => t.transaction_date),
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

    fetchInitialData()
  }, [user])

  // Fetch stats when period changes
  useEffect(() => {
    const fetchStats = async () => {
      if (!user || !selectedPeriod) return

      try {
        const { startDate, endDate } = getPeriodDateRange(selectedPeriod)

        // Get transactions for the period
        const { data: allTransactions } = await supabase
          .from('transactions')
          .select('amount, category_id')
          .eq('user_id', user.id)
          .gte('transaction_date', startDate)
          .lte('transaction_date', endDate)

        // Get budgets for the period (to calculate total budget)
        // Period format is "YYYYMM-DD" (e.g., "202504-25" = Apr 25 - May 24)
        const periodParts = selectedPeriod.split('-')
        const yearMonth = periodParts[0] // "202504"

        const startYear = parseInt(yearMonth.substring(0, 4), 10) // 2025
        const startMonth = parseInt(yearMonth.substring(4, 6), 10) // 04

        // Determine end month (period spans two calendar months)
        const endMonth = startMonth === 12 ? 1 : startMonth + 1
        const endYear = startMonth === 12 ? startYear + 1 : startYear

        // Fetch budgets for both calendar months that the period spans
        const { data: budgetsStart } = await supabase
          .from('budgets')
          .select('amount')
          .eq('user_id', user.id)
          .eq('month', startMonth)
          .eq('year', startYear)

        const { data: budgetsEnd } = await supabase
          .from('budgets')
          .select('amount')
          .eq('user_id', user.id)
          .eq('month', endMonth)
          .eq('year', endYear)

        const budgets = [...(budgetsStart || []), ...(budgetsEnd || [])]

        // Get categories to filter out income
        const { data: categories } = await supabase
          .from('categories')
          .select('id, type')
          .eq('user_id', user.id)

        const categoryTypeMap = new Map(categories?.map((c) => [c.id, c.type]) || [])

        // Filter to only expense transactions
        const transactions = (allTransactions || []).filter((t) => {
          const catType = categoryTypeMap.get(t.category_id)
          return catType !== 'income'
        })

        if (!transactions || transactions.length === 0) {
          const totalBudgetForEmpty = (budgets || []).reduce((sum, b) => sum + (b.amount || 0), 0)
          setStats({
            totalSpent: 0,
            budgetRemaining: Math.max(0, totalBudgetForEmpty),
            transactions: 0,
            daysTracked: 0,
            avgPerTransaction: 0,
            topCategory: 'N/A',
            monthlyBudget: totalBudgetForEmpty
          })
          return
        }

        const totalSpent = transactions.reduce((sum, t) => sum + (t.amount || 0), 0)
        // Calculate total budget from actual category budgets (not the fixed monthly_budget)
        const totalBudget = (budgets || []).reduce((sum, b) => sum + (b.amount || 0), 0)

        // Calculate days tracked
        const { data: datesData } = await supabase
          .from('transactions')
          .select('transaction_date')
          .eq('user_id', user.id)
          .gte('transaction_date', startDate)
          .lte('transaction_date', endDate)

        const uniqueDates = new Set(datesData?.map((t) => t.transaction_date) || [])
        const daysTracked = uniqueDates.size

        // Calculate top category
        const categoryMap = new Map<string, { name: string; amount: number }>()

        // Fetch full category data to get names
        const { data: fullCategories } = await supabase
          .from('categories')
          .select('id, name')
          .eq('user_id', user.id)

        const catNameMap = new Map(fullCategories?.map((c) => [c.id, c.name]) || [])

        // Group by category
        transactions.forEach((t) => {
          const catName = catNameMap.get(t.category_id) || 'Uncategorized'
          const existing = categoryMap.get(t.category_id) || { name: catName, amount: 0 }
          categoryMap.set(t.category_id, {
            name: catName,
            amount: existing.amount + (t.amount || 0)
          })
        })

        // Find top category
        let topCategory = 'N/A'
        let topAmount = 0
        categoryMap.forEach((data) => {
          if (data.amount > topAmount) {
            topAmount = data.amount
            topCategory = data.name
          }
        })

        setStats({
          totalSpent,
          budgetRemaining: Math.max(0, totalBudget - totalSpent),
          transactions: transactions.length,
          daysTracked,
          avgPerTransaction: transactions.length > 0 ? totalSpent / transactions.length : 0,
          topCategory,
          monthlyBudget: totalBudget
        })
      } catch (error) {
        console.error('Error fetching stats:', error)
      }
    }

    fetchStats()
  }, [selectedPeriod, user])

  // Calculate budget status
  const getBudgetStatus = () => {
    if (stats.monthlyBudget === 0) {
      return { percentage: 0, color: 'bg-slate-600', textColor: 'text-slate-400', label: 'No Budget Set' }
    }
    const percentage = (stats.totalSpent / stats.monthlyBudget) * 100
    if (percentage <= 80) {
      return { percentage, color: 'bg-green-500', textColor: 'text-green-400', label: 'Good' }
    } else if (percentage <= 99) {
      return { percentage, color: 'bg-orange-500', textColor: 'text-orange-400', label: 'Warning' }
    } else if (percentage <= 100) {
      return { percentage, color: 'bg-amber-500', textColor: 'text-amber-400', label: 'On Budget' }
    } else {
      return { percentage, color: 'bg-red-500', textColor: 'text-red-400', label: 'Over Budget' }
    }
  }

  const budgetStatus = getBudgetStatus()

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Welcome */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Welcome back, {user?.user_metadata?.full_name || 'User'}! 👋</h1>
            <p className="text-slate-400">Here's your financial overview</p>
          </div>
          {/* Period Selector */}
          <div className="flex items-center space-x-2 mt-4 md:mt-0">
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

        {/* Budget Cycle Info Banner */}
        {!loading && selectedPeriod && (
          <div className="bg-gradient-to-br from-blue-900/30 to-blue-900/10 border border-blue-700/50 rounded-lg p-4 mb-8">
            <div className="flex items-start space-x-3">
              <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-blue-300 font-medium text-sm mb-1">
                  All calculations are based on your custom monthly budget cycle
                </p>
                <p className="text-blue-200 text-sm">
                  Your budget cycle: <span className="font-semibold">{(() => {
                    const { startDate, endDate } = getPeriodDateRange(selectedPeriod)
                    const start = new Date(startDate)
                    const end = new Date(endDate)
                    const startFormatted = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                    const endFormatted = `${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                    return `${startFormatted} → ${endFormatted}`
                  })()}</span> (not the calendar month 1-30)
                </p>
                <a href="/settings" className="text-blue-300 hover:text-blue-200 text-xs font-medium mt-2 inline-block underline">
                  Change cycle in Settings
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Budget Progress Bar */}
        {!loading && selectedPeriod && stats.monthlyBudget > 0 && (
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-lg p-6 mb-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-white mb-2">Budget Status</h2>
                <p className="text-slate-400 text-sm">
                  Spent {getCurrencySymbol(currency)} {stats.totalSpent.toFixed(2)} of {getCurrencySymbol(currency)} {stats.monthlyBudget.toFixed(2)}
                </p>
              </div>
              <div className="text-right mt-2 md:mt-0">
                <p className={`text-3xl font-bold ${budgetStatus.textColor}`}>
                  {getCurrencySymbol(currency)} {stats.budgetRemaining.toFixed(2)}
                </p>
                <p className="text-slate-400 text-sm">Savings remaining</p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-3">
              <div className="w-full bg-slate-700 rounded-full h-4 overflow-hidden">
                <div
                  className={`h-full ${budgetStatus.color} transition-all duration-500 rounded-full`}
                  style={{ width: `${Math.min(budgetStatus.percentage, 100)}%` }}
                ></div>
              </div>
            </div>

            {/* Status Label */}
            <div className="flex justify-between items-center">
              <span className={`text-sm font-medium ${budgetStatus.textColor}`}>
                {budgetStatus.percentage.toFixed(1)}% - {budgetStatus.label}
              </span>
              {stats.totalSpent > stats.monthlyBudget && (
                <span className="text-red-400 text-sm font-medium">
                  Over by {getCurrencySymbol(currency)} {(stats.totalSpent - stats.monthlyBudget).toFixed(2)}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Stats Cards */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-32 bg-slate-800 rounded-lg animate-pulse"></div>
            ))}
          </div>
        ) : !selectedPeriod ? (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center mb-8">
            <p className="text-slate-400">No transaction data available</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {/* Total Spent */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Total Spent</p>
                  <p className="text-3xl font-bold text-white mt-2">{getCurrencySymbol(currency)} {stats.totalSpent.toFixed(2)}</p>
                </div>
                <TrendingDown className="w-10 h-10 text-primary-500" />
              </div>
            </div>

            {/* Budget Remaining */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Budget Remaining</p>
                  <p className="text-3xl font-bold text-white mt-2">{getCurrencySymbol(currency)} {stats.budgetRemaining.toFixed(2)}</p>
                </div>
                <DollarSign className="w-10 h-10 text-green-500" />
              </div>
            </div>

            {/* Transactions */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Transactions</p>
                  <p className="text-3xl font-bold text-white mt-2">{stats.transactions}</p>
                </div>
                <Target className="w-10 h-10 text-blue-500" />
              </div>
            </div>

            {/* Days Tracked */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Days Tracked</p>
                  <p className="text-3xl font-bold text-white mt-2">{stats.daysTracked}</p>
                </div>
                <Calendar className="w-10 h-10 text-green-500" />
              </div>
            </div>

            {/* Avg Per Transaction */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Avg Per Transaction</p>
                  <p className="text-3xl font-bold text-white mt-2">{getCurrencySymbol(currency)} {stats.avgPerTransaction.toFixed(2)}</p>
                </div>
                <Percent className="w-10 h-10 text-blue-500" />
              </div>
            </div>

            {/* Top Category */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Top Category</p>
                  <p className="text-3xl font-bold text-white mt-2 text-lg">{stats.topCategory}</p>
                </div>
                <Tag className="w-10 h-10 text-orange-500" />
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
