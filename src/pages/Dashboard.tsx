import { useContext, useEffect, useState } from 'react'
import { AuthContext } from '../App'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { getPeriodLabel, getPeriodDateRange, getUniquePeriodKeys, getCurrencySymbol } from '../lib/utils'
import { TrendingDown, DollarSign, Target, Calendar, Percent, Tag } from 'lucide-react'

interface Stats {
  totalSpent: number
  budgetRemaining: number
  transactions: number
  daysTracked: number
  avgPerTransaction: number
  topCategory: string
}

export default function Dashboard() {
  const { user } = useContext(AuthContext)
  const [stats, setStats] = useState<Stats>({
    totalSpent: 0,
    budgetRemaining: 0,
    transactions: 0,
    daysTracked: 0,
    avgPerTransaction: 0,
    topCategory: 'N/A'
  })
  const [loading, setLoading] = useState(true)
  const [selectedPeriod, setSelectedPeriod] = useState('')
  const [periods, setPeriods] = useState<string[]>([])
  const [monthStartDay, setMonthStartDay] = useState(1)
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
          setMonthStartDay(profile.month_start_day || 1)
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

        // Get profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('monthly_budget')
          .eq('id', user.id)
          .single()

        // Get transactions for the period
        const { data: transactions } = await supabase
          .from('transactions')
          .select('amount, category_id')
          .eq('user_id', user.id)
          .gte('transaction_date', startDate)
          .lte('transaction_date', endDate)

        if (!transactions || transactions.length === 0) {
          setStats({
            totalSpent: 0,
            budgetRemaining: Math.max(0, profile?.monthly_budget || 0),
            transactions: 0,
            daysTracked: 0,
            avgPerTransaction: 0,
            topCategory: 'N/A'
          })
          return
        }

        const totalSpent = transactions.reduce((sum, t) => sum + (t.amount || 0), 0)
        const monthlyBudget = profile?.monthly_budget || 0

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

        // Fetch categories to get names
        const { data: categories } = await supabase
          .from('categories')
          .select('id, name')
          .eq('user_id', user.id)

        const catNameMap = new Map(categories?.map((c) => [c.id, c.name]) || [])

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
          budgetRemaining: Math.max(0, monthlyBudget - totalSpent),
          transactions: transactions.length,
          daysTracked,
          avgPerTransaction: transactions.length > 0 ? totalSpent / transactions.length : 0,
          topCategory
        })
      } catch (error) {
        console.error('Error fetching stats:', error)
      }
    }

    fetchStats()
  }, [selectedPeriod, user])

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
                  <p className="text-3xl font-bold text-white mt-2">{getCurrencySymbol(currency)}{stats.totalSpent.toFixed(2)}</p>
                </div>
                <TrendingDown className="w-10 h-10 text-primary-500" />
              </div>
            </div>

            {/* Budget Remaining */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Budget Remaining</p>
                  <p className="text-3xl font-bold text-white mt-2">{getCurrencySymbol(currency)}{stats.budgetRemaining.toFixed(2)}</p>
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
                  <p className="text-3xl font-bold text-white mt-2">{getCurrencySymbol(currency)}{stats.avgPerTransaction.toFixed(2)}</p>
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
