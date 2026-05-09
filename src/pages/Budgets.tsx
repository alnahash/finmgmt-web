import { useContext, useEffect, useState } from 'react'
import { AuthContext } from '../App'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, Copy, ChevronDown, ChevronUp } from 'lucide-react'
import { getCurrencySymbol, getUniquePeriodKeysByType, getPeriodDateRange, getPeriodLabel } from '../lib/utils'
import AIInsightsCard from '../components/AIInsightsCard'
import RecommendationsCard from '../components/RecommendationsCard'
import {
  analyzeSpendingPatterns,
  generateRecommendations,
  BudgetRecommendation,
} from '../services/recommendations'

interface Budget {
  id: string
  user_id: string
  category_id: string
  amount: number
  month: number
  year: number
  created_at?: string
}

interface Category {
  id: string
  name: string
  icon: string
  type?: string
  parent_id?: string | null
}

interface Profile {
  month_start_day: number
  currency: string
}

interface CategoryWithBudget {
  category: Category
  budget?: Budget // Single budget per category (for current month)
}

interface GroupedCategory {
  mainCategory: Category | null
  subCategories: CategoryWithBudget[]
}

interface BudgetFormData {
  id?: string
  category_id?: string
  amount: string
  month?: number
  year?: number
}

interface BudgetStatus {
  percentage: number
  color: string
  textColor: string
  label: string
}

interface BudgetStats {
  categoryId: string
  categoryName: string
  categoryIcon: string
  budgetAmount: number
  actualSpent: number
  remaining: number
  percentageUsed: number
  status: 'on-track' | 'warning' | 'exceeded'
  statusColor: 'green' | 'yellow' | 'red'
}

interface MonthSummary {
  monthLabel: string
  totalBudget: number
  totalSpent: number
  totalRemaining: number
  percentageUsed: number
  daysRemaining: number
}

export default function Budgets() {
  const { user } = useContext(AuthContext)
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [currency, setCurrency] = useState('USD')
  const [availablePeriods, setAvailablePeriods] = useState<string[]>([])

  // UI State
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null)
  const [creatingBudgetForCategory, setCreatingBudgetForCategory] = useState<string | null>(null)
  const [editFormData, setEditFormData] = useState<BudgetFormData>({ amount: '' })
  const [showCopyConfirm, setShowCopyConfirm] = useState(false)
  const [viewMode, setViewMode] = useState<'grouped' | 'list' | 'cards'>('cards')
  const [statusFilter, setStatusFilter] = useState<'all' | 'on-track' | 'warning' | 'exceeded'>('all')
  const [totalBudgetSet, setTotalBudgetSet] = useState(0)
  const [totalSpent, setTotalSpent] = useState(0)
  const [categorySpending, setCategorySpending] = useState<Map<string, number>>(new Map())
  const [currentPeriodKey, setCurrentPeriodKey] = useState('')

  // Month summary and budget stats
  const [monthSummary, setMonthSummary] = useState<MonthSummary | null>(null)
  const [budgetStats, setBudgetStats] = useState<BudgetStats[]>([])

  // Recommendations
  const [recommendations, setRecommendations] = useState<BudgetRecommendation[]>([])
  const [allTransactions, setAllTransactions] = useState<
    Array<{ amount: number; category_id: string; transaction_date: string }>
  >([])

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const fetchData = async () => {
    if (!user) return
    setLoading(true)

    try {
      // Fetch profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('month_start_day, currency')
        .eq('id', user.id)
        .single() as { data: Profile | null }

      const startDay = profile?.month_start_day || 1
      const curr = profile?.currency || 'USD'
      setCurrency(curr)

      // Fetch categories
      const { data: cats } = await supabase
        .from('categories')
        .select('id, name, icon, type, parent_id')
        .eq('user_id', user.id)
        .order('parent_id', { ascending: true, nullsFirst: true })
        .order('name', { ascending: true })

      setCategories(cats || [])

      // Fetch all transactions to generate available periods
      const { data: transactions } = await supabase
        .from('transactions')
        .select('transaction_date')
        .eq('user_id', user.id)

      let generatedPeriods: string[] = []
      if (transactions && transactions.length > 0) {
        const txnDates = transactions.map((t) => t.transaction_date)
        generatedPeriods = getUniquePeriodKeysByType(txnDates, 'monthly', startDay)
        setAvailablePeriods(generatedPeriods)

        // Set current period (first/most recent)
        if (generatedPeriods.length > 0) {
          setCurrentPeriodKey(generatedPeriods[0])
        }
      }

      // Fetch budgets
      const { data: budgs, error: budgError } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_id', user.id)

      if (budgError) {
        console.error('Error fetching budgets:', budgError)
      } else {
        console.log('Fetched budgets:', budgs)
      }

      setBudgets(budgs || [])

      // Fetch ALL historical transactions for recommendations analysis (last 12 months)
      const twelveMonthsAgo = new Date()
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
      const isoDate = twelveMonthsAgo.toISOString().split('T')[0]

      const { data: historicalTxns } = await supabase
        .from('transactions')
        .select('amount, category_id, transaction_date')
        .eq('user_id', user.id)
        .gte('transaction_date', isoDate)

      setAllTransactions(historicalTxns || [])

      // Calculate total budget set and total spent for current period
      if (generatedPeriods.length > 0 && generatedPeriods[0]) {
        const { startDate, endDate } = getPeriodDateRange(generatedPeriods[0])

        // Get budgets that overlap with the current period
        // Extract month/year from period dates to find relevant budgets
        const startDateObj = new Date(startDate)
        const endDateObj = new Date(endDate)
        const startMonth = startDateObj.getMonth() + 1
        const startYear = startDateObj.getFullYear()
        const endMonth = endDateObj.getMonth() + 1
        const endYear = endDateObj.getFullYear()

        // Include budgets from all months that overlap with the period
        const relevantBudgets = budgs?.filter((b) => {
          if (b.year < startYear || b.year > endYear) return false
          if (b.year === startYear && b.year === endYear) {
            return b.month >= startMonth && b.month <= endMonth
          }
          if (b.year === startYear) return b.month >= startMonth
          if (b.year === endYear) return b.month <= endMonth
          return true
        }) || []
        const totalBudget = relevantBudgets.reduce((sum, b) => sum + b.amount, 0)
        setTotalBudgetSet(totalBudget)

        // Fetch transactions for current period to calculate spending
        const { data: monthTransactions } = await supabase
          .from('transactions')
          .select('amount, category_id')
          .eq('user_id', user.id)
          .gte('transaction_date', startDate)
          .lte('transaction_date', endDate)

      if (monthTransactions) {
        const categoryTypeMap = new Map(
          (cats || []).map((c) => [c.id, c.type || 'expense'])
        )

        // Calculate total spent
        const spent = (monthTransactions as Array<{amount: number; category_id: string}>).reduce((sum, t) => {
          const catType = categoryTypeMap.get(t.category_id)
          return catType === 'income' ? sum : sum + t.amount
        }, 0)
        setTotalSpent(spent)

        // Calculate spending per category
        const spendingByCategory = new Map<string, number>()
        monthTransactions.forEach((t: {amount: number; category_id: string}) => {
          const catType = categoryTypeMap.get(t.category_id)
          if (catType !== 'income') {
            const current = spendingByCategory.get(t.category_id) || 0
            spendingByCategory.set(t.category_id, current + t.amount)
          }
        })
        setCategorySpending(spendingByCategory)
      }
      } // Close generatedPeriods if block
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const getRelevantBudgetsForPeriod = (budgetsToFilter: Budget[], periodKey: string): Budget[] => {
    if (!periodKey) return []

    const { startDate, endDate } = getPeriodDateRange(periodKey)
    const startDateObj = new Date(startDate)
    const endDateObj = new Date(endDate)
    const startMonth = startDateObj.getMonth() + 1
    const startYear = startDateObj.getFullYear()
    const endMonth = endDateObj.getMonth() + 1
    const endYear = endDateObj.getFullYear()

    return budgetsToFilter.filter((b) => {
      if (b.year < startYear || b.year > endYear) return false
      if (b.year === startYear && b.year === endYear) {
        return b.month >= startMonth && b.month <= endMonth
      }
      if (b.year === startYear) return b.month >= startMonth
      if (b.year === endYear) return b.month <= endMonth
      return true
    })
  }

  const groupBudgetsByCategory = (): GroupedCategory[] => {
    // Get budgets for current period
    const currentMonthBudgets = getRelevantBudgetsForPeriod(budgets, currentPeriodKey)

    const categoryBudgetMap = new Map<string, Budget>()
    currentMonthBudgets.forEach((budget) => {
      categoryBudgetMap.set(budget.category_id, budget)
    })

    const expenseCats = categories.filter((c) => c.type !== 'income')

    // Group by main category
    const mainCategories = expenseCats.filter((c) => !c.parent_id || c.parent_id === c.id)
    const subCategoryMap = new Map<string, Category[]>()

    expenseCats.forEach((c) => {
      if (c.parent_id && c.parent_id !== c.id) {
        if (!subCategoryMap.has(c.parent_id)) {
          subCategoryMap.set(c.parent_id, [])
        }
        subCategoryMap.get(c.parent_id)!.push(c)
      }
    })

    return mainCategories.map((mainCat) => {
      const subs = subCategoryMap.get(mainCat.id) || [mainCat]

      return {
        mainCategory: mainCat,
        subCategories: subs.map((subCat) => ({
          category: subCat,
          budget: categoryBudgetMap.get(subCat.id),
        })),
      }
    })
  }

  const handleEditStart = (budget: Budget) => {
    setEditingBudgetId(budget.id)
    setEditFormData({
      id: budget.id,
      category_id: budget.category_id,
      amount: String(budget.amount),
      month: budget.month,
      year: budget.year,
    })
  }

  const handleSaveBudget = async () => {
    if (!user || !editFormData.id) return

    try {
      const newAmount = parseFloat(String(editFormData.amount))

      const { error } = await supabase
        .from('budgets')
        .update({
          amount: newAmount,
        })
        .eq('id', editFormData.id)

      if (!error) {
        // Update local state instead of fetching all data
        const updatedBudgets = budgets.map((b) =>
          b.id === editFormData.id ? { ...b, amount: newAmount } : b
        )
        setBudgets(updatedBudgets)

        // Recalculate totals using period-based approach
        const relevantBudgets = getRelevantBudgetsForPeriod(updatedBudgets, currentPeriodKey)
        const totalBudget = relevantBudgets.reduce((sum, b) => sum + b.amount, 0)
        setTotalBudgetSet(totalBudget)

        setEditingBudgetId(null)
      } else {
        console.error('Error saving budget:', error)
        alert(`Error saving budget: ${error.message}`)
      }
    } catch (error) {
      console.error('Error saving budget:', error)
      alert(`Error saving budget: ${String(error)}`)
    }
  }

  const handleDeleteBudget = async (budgetId: string) => {
    if (!user || !confirm('Delete this budget?')) return

    try {
      await supabase.from('budgets').delete().eq('id', budgetId).eq('user_id', user.id)
      fetchData()
    } catch (error) {
      console.error('Error deleting budget:', error)
    }
  }

  const handleAddBudget = (categoryId: string) => {
    // Switch to inline edit mode for new budget
    setCreatingBudgetForCategory(categoryId)
    setEditFormData({ amount: '', category_id: categoryId })
  }

  const handleSaveNewBudget = async (categoryId: string) => {
    if (!user) {
      console.error('No user found')
      alert('No user found. Please log in.')
      return
    }

    if (!editFormData.amount || parseFloat(editFormData.amount) < 0) {
      alert('Please enter a valid budget amount')
      return
    }

    try {
      // Use the end month/year of the current period for new budgets
      let month = new Date().getMonth() + 1
      let year = new Date().getFullYear()

      if (currentPeriodKey) {
        const { endDate } = getPeriodDateRange(currentPeriodKey)
        const endDateObj = new Date(endDate)
        month = endDateObj.getMonth() + 1
        year = endDateObj.getFullYear()
      }

      const budgetData = {
        user_id: user.id,
        category_id: categoryId,
        amount: parseFloat(editFormData.amount),
        month,
        year,
      }

      const { data, error } = await supabase.from('budgets').insert([budgetData]).select()

      if (error) {
        console.error('Supabase error:', error.code, error.message, error.details)
        alert(`Budget creation failed:\n\nCode: ${error.code}\nMessage: ${error.message}\nDetails: ${error.details || 'None'}`)
        return
      }

      // Update local state instead of fetching all data
      if (data && data.length > 0) {
        const newBudget = data[0]
        const updatedBudgets = [...budgets, newBudget]
        setBudgets(updatedBudgets)

        // Recalculate totals using period-based approach
        const relevantBudgets = getRelevantBudgetsForPeriod(updatedBudgets, currentPeriodKey)
        const totalBudget = relevantBudgets.reduce((sum, b) => sum + b.amount, 0)
        setTotalBudgetSet(totalBudget)
      }

      setCreatingBudgetForCategory(null)
      setEditFormData({ amount: '' })
    } catch (error) {
      console.error('Unexpected error:', error)
      alert(`Unexpected error: ${String(error)}`)
    }
  }

  const handleApplyRecommendation = async (categoryId: string, recommendedAmount: number) => {
    if (!user) return

    try {
      // Use the end month/year of the current period
      let month = new Date().getMonth() + 1
      let year = new Date().getFullYear()

      if (currentPeriodKey) {
        const { endDate } = getPeriodDateRange(currentPeriodKey)
        const endDateObj = new Date(endDate)
        month = endDateObj.getMonth() + 1
        year = endDateObj.getFullYear()
      }

      const existingBudget = budgets.find(
        (b) => b.category_id === categoryId && b.month === month && b.year === year
      )

      if (existingBudget) {
        // Update existing budget
        await supabase
          .from('budgets')
          .update({ amount: recommendedAmount })
          .eq('id', existingBudget.id)

        // Update local state
        const updatedBudgets = budgets.map((b) =>
          b.id === existingBudget.id ? { ...b, amount: recommendedAmount } : b
        )
        setBudgets(updatedBudgets)
      } else {
        // Create new budget
        await supabase
          .from('budgets')
          .insert([
            {
              user_id: user.id,
              category_id: categoryId,
              amount: recommendedAmount,
              month,
              year,
            },
          ])

        // Refresh to get the new budget with ID
        await fetchData()
      }
    } catch (error) {
      console.error('Error applying recommendation:', error)
      alert('Failed to apply recommendation')
    }
  }

  const handleCopyFromLastMonth = async () => {
    if (!user || !currentPeriodKey) return

    try {
      // Get the previous period
      const currentIndex = availablePeriods.indexOf(currentPeriodKey)
      if (currentIndex <= 0 || currentIndex >= availablePeriods.length) {
        alert('No previous period found to copy from')
        return
      }

      const previousPeriodKey = availablePeriods[currentIndex + 1] // Next in array (older)
      const currentEndDate = getPeriodDateRange(currentPeriodKey).endDate
      const previousEndDate = getPeriodDateRange(previousPeriodKey).endDate

      const currentEndDateObj = new Date(currentEndDate)
      const previousEndDateObj = new Date(previousEndDate)
      const currentMonth = currentEndDateObj.getMonth() + 1
      const currentYear = currentEndDateObj.getFullYear()
      const previousMonth = previousEndDateObj.getMonth() + 1
      const previousYear = previousEndDateObj.getFullYear()

      // Get previous period's budgets (from the end month of previous period)
      const lastMonthBudgets = budgets.filter((b) => b.month === previousMonth && b.year === previousYear)

      if (lastMonthBudgets.length === 0) {
        alert('No budgets found from last period to copy')
        return
      }

      const newBudgets = lastMonthBudgets.map((b) => ({
        user_id: user.id,
        category_id: b.category_id,
        amount: b.amount,
        month: currentMonth,
        year: currentYear,
      }))

      const { error } = await supabase.from('budgets').insert(newBudgets)

      if (error) {
        console.error('Error copying budgets:', error)
        alert(`Error copying budgets: ${error.message}`)
      } else {
        alert(`Copied ${newBudgets.length} budgets from last period`)
        setShowCopyConfirm(false)
        await fetchData()
      }
    } catch (error) {
      console.error('Error copying budgets:', error)
      alert(`Error copying budgets: ${String(error)}`)
    }
  }

  const toggleGroup = (groupId: string) => {
    const newExpanded = new Set(expandedGroups)
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId)
    } else {
      newExpanded.add(groupId)
    }
    setExpandedGroups(newExpanded)
  }

  const toggleCardExpanded = (categoryId: string) => {
    const newExpanded = new Set(expandedCards)
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId)
    } else {
      newExpanded.add(categoryId)
    }
    setExpandedCards(newExpanded)
  }

  // Calculate days remaining in the current period
  const calculateDaysRemaining = (): number => {
    if (!currentPeriodKey) return 0

    const { endDate } = getPeriodDateRange(currentPeriodKey)
    const today = new Date()
    const endDateObj = new Date(endDate)
    const timeDiff = endDateObj.getTime() - today.getTime()
    const daysRemaining = Math.ceil(timeDiff / (1000 * 60 * 60 * 24))
    return Math.max(0, daysRemaining)
  }

  // Update month summary with budget tracking and days remaining
  const updateMonthSummary = () => {
    const currentMonthBudgets = getRelevantBudgetsForPeriod(budgets, currentPeriodKey)
    const totalBudget = currentMonthBudgets.reduce((sum, b) => sum + b.amount, 0)

    const daysRemaining = calculateDaysRemaining()
    const monthLabel = currentPeriodKey ? getPeriodLabel(currentPeriodKey) : 'Current Period'
    const percentageUsed = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0

    setMonthSummary({
      monthLabel,
      totalBudget,
      totalSpent,
      totalRemaining: Math.max(0, totalBudget - totalSpent),
      percentageUsed,
      daysRemaining
    })
  }

  // Update budget stats for each category
  const updateBudgetStats = () => {
    const currentMonthBudgets = getRelevantBudgetsForPeriod(budgets, currentPeriodKey)

    const stats: BudgetStats[] = currentMonthBudgets
      .map((budget) => {
        const category = categories.find((c) => c.id === budget.category_id)
        if (!category) return null

        const actualSpent = categorySpending.get(budget.category_id) || 0
        const remaining = Math.max(0, budget.amount - actualSpent)
        const percentageUsed = budget.amount > 0 ? (actualSpent / budget.amount) * 100 : 0

        let status: 'on-track' | 'warning' | 'exceeded' = 'on-track'
        let statusColor: 'green' | 'yellow' | 'red' = 'green'

        if (percentageUsed > 100) {
          status = 'exceeded'
          statusColor = 'red'
        } else if (percentageUsed >= 80) {
          status = 'warning'
          statusColor = 'yellow'
        }

        return {
          categoryId: budget.category_id,
          categoryName: category.name,
          categoryIcon: category.icon,
          budgetAmount: budget.amount,
          actualSpent,
          remaining,
          percentageUsed,
          status,
          statusColor
        }
      })
      .filter((stat): stat is BudgetStats => stat !== null)

    setBudgetStats(stats)
  }

  // Update summaries whenever data changes
  useEffect(() => {
    updateMonthSummary()
    updateBudgetStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgets, categorySpending, categories])

  // Generate recommendations based on historical data
  useEffect(() => {
    if (allTransactions.length === 0 || categories.length === 0) {
      setRecommendations([])
      return
    }

    try {
      const categoryTypeMap = new Map(
        categories.map((c) => [c.id, c.type || 'expense'])
      )

      // Analyze spending patterns
      const patterns = analyzeSpendingPatterns(
        allTransactions,
        categories,
        categoryTypeMap
      )

      // Generate recommendations
      const currentBudgetMap = new Map<string, number>()
      const today = new Date()
      const currentMonth = today.getMonth() + 1
      const currentYear = today.getFullYear()

      budgets
        .filter((b) => b.month === currentMonth && b.year === currentYear)
        .forEach((b) => {
          currentBudgetMap.set(b.category_id, b.amount)
        })

      const recs = generateRecommendations(patterns, currentBudgetMap)
      setRecommendations(recs)
    } catch (error) {
      console.error('Error generating recommendations:', error)
    }
  }, [allTransactions, categories, budgets])

  // Check if a category is a leaf (has no children)
  const isLeafCategory = (catId: string): boolean => {
    return !categories.some((c) => c.parent_id === catId && c.parent_id !== catId)
  }

  // Calculate main category budget from subcategories
  const getMainCategoryBudget = (mainCatId: string): number => {
    const today = new Date()
    const currentMonth = today.getMonth() + 1
    const currentYear = today.getFullYear()

    const subCats = categories.filter((c) => c.parent_id === mainCatId)
    const subBudgets = budgets.filter(
      (b) => b.month === currentMonth && b.year === currentYear && subCats.some((s) => s.id === b.category_id)
    )
    return subBudgets.reduce((sum, b) => sum + b.amount, 0)
  }

  // Get budget status for a category (color, percentage, label)
  const getCategoryBudgetStatus = (budgetAmount: number, spending: number): BudgetStatus => {
    if (budgetAmount === 0) {
      return { percentage: 0, color: 'bg-slate-600', textColor: 'text-slate-400', label: 'No Budget Set' }
    }
    const percentage = (spending / budgetAmount) * 100
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

  // Get status counts for filter badges
  const getStatusCounts = () => {
    const counts = {
      all: budgetStats.length,
      'on-track': budgetStats.filter(s => s.status === 'on-track').length,
      'warning': budgetStats.filter(s => s.status === 'warning').length,
      'exceeded': budgetStats.filter(s => s.status === 'exceeded').length,
    }
    return counts
  }

  // Filter budget stats based on selected status
  const getFilteredStats = () => {
    if (statusFilter === 'all') return budgetStats
    return budgetStats.filter(stat => stat.status === statusFilter)
  }

  const grouped = groupBudgetsByCategory()

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-white">Budgets</h1>
          <div className="flex items-center space-x-3">
            {/* View Mode Toggle */}
            <div className="flex space-x-2 bg-slate-700 rounded-lg p-1">
              <button
                onClick={() => setViewMode('grouped')}
                className={`px-4 py-2 rounded transition font-medium text-sm ${
                  viewMode === 'grouped'
                    ? 'bg-primary-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Grouped View
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-4 py-2 rounded transition font-medium text-sm ${
                  viewMode === 'list'
                    ? 'bg-primary-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                List View
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`px-4 py-2 rounded transition font-medium text-sm ${
                  viewMode === 'cards'
                    ? 'bg-primary-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Card View
              </button>
            </div>
            {availablePeriods.length > 1 && (
              <button
                onClick={() => setShowCopyConfirm(true)}
                className="flex items-center space-x-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition"
              >
                <Copy className="w-5 h-5" />
                <span>Copy from last month</span>
              </button>
            )}
          </div>
        </div>

        {/* Copy Confirmation Modal */}
        {showCopyConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 max-w-md">
              <h2 className="text-lg font-semibold text-white mb-4">Copy budgets?</h2>
              <p className="text-slate-300 mb-6">
                This will copy all budgets from last month to the current month.
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={handleCopyFromLastMonth}
                  className="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 rounded-lg transition"
                >
                  Copy
                </button>
                <button
                  onClick={() => setShowCopyConfirm(false)}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 rounded-lg transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Savings Goal Tracker */}
        {!loading && categories.length > 0 && (
          <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Total Budget */}
            <div className="bg-gradient-to-br from-blue-900/30 to-blue-900/10 border border-blue-700/50 rounded-lg p-6">
              <p className="text-blue-300 text-sm font-medium uppercase tracking-wide mb-2">Monthly Budget Set</p>
              <p className="text-3xl font-bold text-white mb-2">{getCurrencySymbol(currency)} {totalBudgetSet.toFixed(2)}</p>
              <p className="text-xs text-blue-300">Your total spending plan</p>
            </div>

            {/* Total Spent */}
            <div className="bg-gradient-to-br from-orange-900/30 to-orange-900/10 border border-orange-700/50 rounded-lg p-6">
              <p className="text-orange-300 text-sm font-medium uppercase tracking-wide mb-2">Actual Spending</p>
              <p className="text-3xl font-bold text-white mb-2">{getCurrencySymbol(currency)} {totalSpent.toFixed(2)}</p>
              <p className="text-xs text-orange-300">
                {totalBudgetSet > 0
                  ? `${Math.round((totalSpent / totalBudgetSet) * 100)}% of budget`
                  : 'Set a budget to track progress'}
              </p>
            </div>

            {/* Savings Achieved */}
            <div
              className={`bg-gradient-to-br ${
                totalBudgetSet - totalSpent >= 0
                  ? 'from-green-900/30 to-green-900/10 border-green-700/50'
                  : 'from-red-900/30 to-red-900/10 border-red-700/50'
              } border rounded-lg p-6`}
            >
              <p
                className={`text-sm font-medium uppercase tracking-wide mb-2 ${
                  totalBudgetSet - totalSpent >= 0 ? 'text-green-300' : 'text-red-300'
                }`}
              >
                {totalBudgetSet - totalSpent >= 0 ? '✓ Savings Achieved' : '⚠ Over Budget'}
              </p>
              <p className="text-3xl font-bold text-white mb-2">
                {getCurrencySymbol(currency)}
                {Math.abs(totalBudgetSet - totalSpent).toFixed(2)}
              </p>
              <p
                className={`text-xs ${
                  totalBudgetSet - totalSpent >= 0 ? 'text-green-300' : 'text-red-300'
                }`}
              >
                {totalBudgetSet > 0
                  ? totalBudgetSet - totalSpent >= 0
                    ? 'You are on track! Follow the budget to achieve your savings goal.'
                    : 'You have exceeded your budget. Reduce spending to meet your goal.'
                  : 'Set subcategory budgets to start tracking'}
              </p>
            </div>
          </div>
        )}

        {/* Budget Progress Bar */}
        {!loading && totalBudgetSet > 0 && (
          <div className="mb-8 bg-slate-800 border border-slate-700 rounded-lg p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white uppercase tracking-wide">Monthly Budget Progress</h3>
              <span className={`text-sm font-bold ${totalSpent <= totalBudgetSet ? 'text-green-400' : 'text-red-400'}`}>
                {totalBudgetSet > 0 ? `${Math.round((totalSpent / totalBudgetSet) * 100)}%` : '0%'}
              </span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  totalSpent <= totalBudgetSet ? 'bg-green-500' : 'bg-red-500'
                }`}
                style={{ width: `${Math.min((totalSpent / totalBudgetSet) * 100, 100)}%` }}
              />
            </div>
            <div className="flex justify-between mt-3 text-xs text-slate-400">
              <span>Spent: {getCurrencySymbol(currency)} {totalSpent.toFixed(2)}</span>
              <span>Budget: {getCurrencySymbol(currency)} {totalBudgetSet.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Categories List - Grouped View */}
        {viewMode === 'grouped' && (
          <>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 bg-slate-800 rounded-lg animate-pulse"></div>
                ))}
              </div>
            ) : categories.length === 0 ? (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
                <p className="text-slate-400">No expense categories found. Create categories first in the Categories tab.</p>
              </div>
            ) : grouped.length === 0 ? (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
                <p className="text-slate-400">No budgets set yet. Click on a category below to set a budget.</p>
              </div>
            ) : (
              <div className="space-y-4">
            {grouped.map((group) => (
              <div key={group.mainCategory?.id} className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                {/* Group Header */}
                <button
                  onClick={() => toggleGroup(group.mainCategory?.id || '')}
                  className="w-full flex items-center justify-between p-4 hover:bg-slate-700/50 transition"
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">{group.mainCategory?.icon}</span>
                    <span className="text-white font-semibold uppercase text-sm">
                      {group.mainCategory?.name}
                    </span>
                    <span className="text-slate-400 text-sm">({group.subCategories.length})</span>
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className="text-white font-semibold">
                      {getCurrencySymbol(currency)}
                      {getMainCategoryBudget(group.mainCategory?.id || '').toFixed(2)}
                    </span>
                    {expandedGroups.has(group.mainCategory?.id || '') ? (
                      <ChevronUp className="w-5 h-5 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-slate-400" />
                    )}
                  </div>
                </button>

                {/* Group Items */}
                {expandedGroups.has(group.mainCategory?.id || '') && (
                  <div className="border-t border-slate-700">
                    {group.subCategories.map((item, idx) => {
                      const isLeaf = isLeafCategory(item.category.id)
                      const budget = item.budget
                      const isEditing = editingBudgetId === budget?.id
                      const isCreating = creatingBudgetForCategory === item.category.id

                      return (
                        <div
                          key={item.category.id}
                          className={`flex items-start justify-between p-4 ${
                            idx !== group.subCategories.length - 1 ? 'border-b border-slate-700' : ''
                          } ${!isLeaf ? 'bg-slate-700/20' : ''} ${isCreating ? 'bg-primary-900/20' : ''}`}
                        >
                          <div className="flex items-center space-x-3 flex-1">
                            <span className="text-2xl">{item.category.icon}</span>
                            <div>
                              <span className="text-white font-medium">{item.category.name}</span>
                              {!isLeaf && (
                                <p className="text-xs text-slate-400 mt-0.5">
                                  Main category - Set budgets on subcategories
                                </p>
                              )}
                            </div>
                          </div>

                          {isEditing && budget && isLeaf ? (
                            // Edit Mode
                            <div className="flex items-center space-x-2 flex-1 max-w-sm">
                              <input
                                type="number"
                                step="0.01"
                                value={editFormData.amount || ''}
                                onChange={(e) =>
                                  setEditFormData({ ...editFormData, amount: e.target.value })
                                }
                                placeholder="0.00"
                                className="w-20 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                              />

                              <button
                                onClick={handleSaveBudget}
                                className="px-3 py-1 bg-primary-600 hover:bg-primary-700 text-white text-sm rounded transition"
                              >
                                Save
                              </button>

                              <button
                                onClick={() => setEditingBudgetId(null)}
                                className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded transition"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : isCreating && isLeaf ? (
                            // Create Mode (Inline)
                            <div className="flex items-center space-x-2 flex-1 max-w-sm">
                              <input
                                type="number"
                                step="0.01"
                                value={editFormData.amount || ''}
                                onChange={(e) =>
                                  setEditFormData({ ...editFormData, amount: e.target.value })
                                }
                                placeholder="Enter amount"
                                autoFocus
                                className="w-20 px-2 py-1 bg-primary-700 border border-primary-600 rounded text-white text-sm font-semibold"
                              />

                              <button
                                onClick={() => handleSaveNewBudget(item.category.id)}
                                className="px-3 py-1 bg-primary-600 hover:bg-primary-700 text-white text-sm rounded transition font-semibold"
                              >
                                Save
                              </button>

                              <button
                                onClick={() => {
                                  setCreatingBudgetForCategory(null)
                                  setEditFormData({ amount: '' })
                                }}
                                className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded transition"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            // Display Mode
                            <div className="flex-1">
                              {!isLeaf ? (
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-300 font-semibold">
                                    {getCurrencySymbol(currency)}
                                    {budget?.amount.toFixed(2) || '0.00'}
                                  </span>
                                  <span className="text-xs text-slate-400">Read-only</span>
                                </div>
                              ) : !budget ? (
                                <button
                                  onClick={() => handleAddBudget(item.category.id)}
                                  className="text-slate-400 hover:text-primary-500 transition flex items-center space-x-1"
                                >
                                  <Plus className="w-4 h-4" />
                                  <span>Set budget</span>
                                </button>
                              ) : (
                                <>
                                  {/* Budget Progress Bar for Categories with Budgets */}
                                  <div className="space-y-2">
                                    {/* Budget Amount and Actions Row */}
                                    <div className="flex items-center justify-between">
                                      <div>
                                        <p className="text-xs text-slate-400 uppercase tracking-wide">Budget</p>
                                        <p className="text-white font-semibold">
                                          {getCurrencySymbol(currency)} {budget.amount.toFixed(2)}
                                        </p>
                                      </div>
                                      <div className="flex items-center space-x-2">
                                        <button
                                          onClick={() => handleEditStart(budget)}
                                          className="text-slate-400 hover:text-primary-500 transition"
                                          title="Edit budget"
                                        >
                                          ✏️
                                        </button>

                                        <button
                                          onClick={() => handleDeleteBudget(budget.id)}
                                          className="text-slate-400 hover:text-red-500 transition"
                                          title="Delete budget"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </div>

                                    {/* Progress Bar Section */}
                                    {(() => {
                                      const spending = categorySpending.get(item.category.id) || 0
                                      const status = getCategoryBudgetStatus(budget.amount, spending)
                                      const savings = budget.amount - spending

                                      return (
                                        <div className="space-y-1.5">
                                          {/* Progress Bar */}
                                          <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                                            <div
                                              className={`h-full ${status.color} transition-all duration-300 rounded-full`}
                                              style={{ width: `${Math.min(status.percentage, 100)}%` }}
                                            />
                                          </div>

                                          {/* Status Info Row */}
                                          <div className="flex items-center justify-between text-xs">
                                            <div>
                                              <span className="text-slate-400">Spent: </span>
                                              <span className="text-white font-medium">
                                                {getCurrencySymbol(currency)} {spending.toFixed(2)}
                                              </span>
                                            </div>
                                            <div className={`font-semibold ${status.textColor}`}>
                                              {status.percentage.toFixed(0)}% - {status.label}
                                            </div>
                                          </div>

                                          {/* Savings/Overage Row */}
                                          <div className="flex items-center justify-between text-xs">
                                            <span className={savings >= 0 ? 'text-green-400' : 'text-red-400'}>
                                              {savings >= 0 ? '✓ Savings:' : '⚠ Over by:'}
                                            </span>
                                            <span className={`font-semibold ${savings >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                              {getCurrencySymbol(currency)} {Math.abs(savings).toFixed(2)}
                                            </span>
                                          </div>
                                        </div>
                                      )
                                    })()}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
            )}
          </>
        )}

        {/* Categories List - Table View */}
        {viewMode === 'list' && (
          <>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-slate-800 rounded-lg animate-pulse"></div>
                ))}
              </div>
            ) : categories.length === 0 ? (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
                <p className="text-slate-400">No expense categories found. Create categories first in the Categories tab.</p>
              </div>
            ) : (
              <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700 bg-slate-900">
                      <th className="px-6 py-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Category</th>
                      <th className="px-6 py-4 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">Budget Amount</th>
                      <th className="px-6 py-4 text-center text-xs font-medium text-slate-400 uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {categories
                      .filter((c) => c.type !== 'income')
                      .map((cat) => {
                        const isLeaf = isLeafCategory(cat.id)
                        const isMainCategory = !cat.parent_id || cat.parent_id === cat.id
                        const budget = budgets.find(
                          (b) => b.category_id === cat.id && b.month === new Date().getMonth() + 1 && b.year === new Date().getFullYear()
                        )
                        const isEditing = editingBudgetId === budget?.id
                        const isCreating = creatingBudgetForCategory === cat.id

                        // For main categories, calculate budget from subcategories
                        let displayAmount = budget?.amount || 0
                        if (isMainCategory) {
                          displayAmount = getMainCategoryBudget(cat.id)
                        }

                        return (
                          <tr
                            key={cat.id}
                            className={`${!isMainCategory ? 'hover:bg-slate-700/50' : 'bg-slate-700/20'} transition ${isCreating ? 'bg-primary-900/20' : ''}`}
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center space-x-3">
                                <span className="text-2xl">{cat.icon}</span>
                                <div>
                                  <p className="text-white font-medium">{cat.name}</p>
                                  {isMainCategory && (
                                    <p className="text-xs text-slate-400">
                                      Sum of subcategories
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                              {isEditing && budget && isLeaf ? (
                                <div className="flex items-center justify-end space-x-2">
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={editFormData.amount || ''}
                                    onChange={(e) =>
                                      setEditFormData({ ...editFormData, amount: e.target.value })
                                    }
                                    placeholder="0.00"
                                    className="w-24 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm text-right"
                                  />
                                </div>
                              ) : isCreating && isLeaf ? (
                                <div className="flex items-center justify-end space-x-2">
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={editFormData.amount || ''}
                                    onChange={(e) =>
                                      setEditFormData({ ...editFormData, amount: e.target.value })
                                    }
                                    placeholder="Enter amount"
                                    autoFocus
                                    className="w-24 px-2 py-1 bg-primary-700 border border-primary-600 rounded text-white text-sm text-right font-semibold"
                                  />
                                </div>
                              ) : (
                                <span className={`font-semibold ${isMainCategory ? 'text-slate-300' : 'text-white'}`}>
                                  {getCurrencySymbol(currency)}
                                  {displayAmount.toFixed(2)}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-center space-x-2">
                                {isMainCategory ? (
                                  <span className="text-xs text-slate-400">Read-only</span>
                                ) : isEditing && budget ? (
                                  <>
                                    <button
                                      onClick={handleSaveBudget}
                                      className="px-3 py-1 bg-primary-600 hover:bg-primary-700 text-white text-xs rounded transition"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => setEditingBudgetId(null)}
                                      className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded transition"
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : isCreating ? (
                                  <>
                                    <button
                                      onClick={() => handleSaveNewBudget(cat.id)}
                                      className="px-3 py-1 bg-primary-600 hover:bg-primary-700 text-white text-xs rounded transition font-semibold"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => {
                                        setCreatingBudgetForCategory(null)
                                        setEditFormData({ amount: '' })
                                      }}
                                      className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded transition"
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    {!budget ? (
                                      <button
                                        onClick={() => handleAddBudget(cat.id)}
                                        className="text-slate-400 hover:text-primary-500 transition text-sm"
                                      >
                                        Set budget
                                      </button>
                                    ) : (
                                      <>
                                        <button
                                          onClick={() => handleEditStart(budget)}
                                          className="text-slate-400 hover:text-primary-500 transition"
                                          title="Edit budget"
                                        >
                                          ✏️
                                        </button>
                                        <button
                                          onClick={() => handleDeleteBudget(budget.id)}
                                          className="text-slate-400 hover:text-red-500 transition"
                                          title="Delete budget"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
                {categories.filter((c) => c.type !== 'income').length === 0 && (
                  <div className="p-8 text-center text-slate-400">No expense categories found</div>
                )}
              </div>
            )}
          </>
        )}

        {/* Categories List - Card View */}
        {viewMode === 'cards' && (
          <>
            {/* Card View - Month Summary */}
            {!loading && monthSummary && (
              <div className="mb-8 bg-gradient-to-r from-primary-600/20 to-primary-600/10 border border-primary-700/50 rounded-lg p-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {/* Month Label */}
                  <div>
                    <p className="text-primary-300 text-xs font-medium uppercase tracking-wide">Month</p>
                    <p className="text-white font-semibold text-lg">{monthSummary.monthLabel}</p>
                  </div>

                  {/* Total Budget */}
                  <div>
                    <p className="text-primary-300 text-xs font-medium uppercase tracking-wide">Total Budget</p>
                    <p className="text-white font-semibold text-lg">
                      {getCurrencySymbol(currency)} {monthSummary.totalBudget.toFixed(2)}
                    </p>
                  </div>

                  {/* Total Spent */}
                  <div>
                    <p className="text-primary-300 text-xs font-medium uppercase tracking-wide">Spent</p>
                    <p className="text-white font-semibold text-lg">
                      {getCurrencySymbol(currency)} {monthSummary.totalSpent.toFixed(2)}
                    </p>
                  </div>

                  {/* Days Remaining */}
                  <div>
                    <p className="text-primary-300 text-xs font-medium uppercase tracking-wide">Days Left</p>
                    <p className="text-white font-semibold text-lg">{monthSummary.daysRemaining}</p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-primary-300 uppercase tracking-wide">Month Progress</span>
                    <span className={`text-xs font-bold ${
                      monthSummary.percentageUsed <= 80 ? 'text-green-400' :
                      monthSummary.percentageUsed <= 99 ? 'text-orange-400' :
                      'text-red-400'
                    }`}>
                      {monthSummary.percentageUsed.toFixed(0)}% used
                    </span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        monthSummary.percentageUsed <= 80 ? 'bg-green-500' :
                        monthSummary.percentageUsed <= 99 ? 'bg-orange-500' :
                        'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(monthSummary.percentageUsed, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* AI Insights Card */}
            {!loading && monthSummary && budgetStats.length > 0 && (
              <div className="mb-8">
                <AIInsightsCard
                  context={{
                    totalBudget: monthSummary.totalBudget,
                    totalSpent: monthSummary.totalSpent,
                    percentageUsed: monthSummary.percentageUsed,
                    daysRemaining: monthSummary.daysRemaining,
                    budgetStatus:
                      monthSummary.percentageUsed <= 80
                        ? 'on-track'
                        : monthSummary.percentageUsed <= 99
                          ? 'warning'
                          : 'exceeded',
                    categories: budgetStats.map((stat) => ({
                      name: stat.categoryName,
                      budgetAmount: stat.budgetAmount,
                      actualSpent: stat.actualSpent,
                      status: stat.status,
                    })),
                    monthLabel: monthSummary.monthLabel,
                    currency: getCurrencySymbol(currency),
                  }}
                />
              </div>
            )}

            {/* Budget Recommendations Card */}
            {!loading && recommendations.length > 0 && (
              <div className="mb-8">
                <RecommendationsCard
                  recommendations={recommendations}
                  currencySymbol={getCurrencySymbol(currency)}
                  onApplyRecommendation={handleApplyRecommendation}
                  isLoading={loading}
                />
              </div>
            )}

            {/* Status Filter Buttons */}
            {!loading && budgetStats.length > 0 && (
              <div className="mb-6 flex flex-wrap gap-2">
                {(() => {
                  const counts = getStatusCounts()
                  return (
                    <>
                      <button
                        onClick={() => setStatusFilter('all')}
                        className={`px-4 py-2 rounded-lg font-medium transition ${
                          statusFilter === 'all'
                            ? 'bg-primary-600 text-white'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                      >
                        All ({counts.all})
                      </button>
                      <button
                        onClick={() => setStatusFilter('on-track')}
                        className={`px-4 py-2 rounded-lg font-medium transition ${
                          statusFilter === 'on-track'
                            ? 'bg-green-600 text-white'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                      >
                        ✓ On Track ({counts['on-track']})
                      </button>
                      <button
                        onClick={() => setStatusFilter('warning')}
                        className={`px-4 py-2 rounded-lg font-medium transition ${
                          statusFilter === 'warning'
                            ? 'bg-orange-600 text-white'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                      >
                        ⚠ Warning ({counts.warning})
                      </button>
                      <button
                        onClick={() => setStatusFilter('exceeded')}
                        className={`px-4 py-2 rounded-lg font-medium transition ${
                          statusFilter === 'exceeded'
                            ? 'bg-red-600 text-white'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                      >
                        ✗ Over Budget ({counts.exceeded})
                      </button>
                    </>
                  )
                })()}
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="h-56 bg-slate-800 rounded-lg animate-pulse"></div>
                ))}
              </div>
            ) : budgetStats.length === 0 ? (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
                <p className="text-slate-400">No budgets set yet. Click on a category in Grouped or List view to set a budget.</p>
              </div>
            ) : getFilteredStats().length === 0 ? (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
                <p className="text-slate-400">No budgets match the selected filter.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {getFilteredStats().map((stat) => {
                  const isExpanded = expandedCards.has(stat.categoryId)

                  return (
                    <div
                      key={stat.categoryId}
                      className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-lg overflow-hidden hover:border-slate-600 transition"
                    >
                      {/* Card Header - Always Visible */}
                      <button
                        onClick={() => toggleCardExpanded(stat.categoryId)}
                        className="w-full p-4 flex items-center justify-between hover:bg-slate-700/50 transition"
                      >
                        <div className="flex items-center space-x-3 flex-1">
                          <span className="text-3xl">{stat.categoryIcon}</span>
                          <div className="text-left">
                            <h3 className="text-white font-semibold">{stat.categoryName}</h3>
                            <p className={`text-xs font-medium ${
                              stat.statusColor === 'green' ? 'text-green-400' :
                              stat.statusColor === 'yellow' ? 'text-orange-400' :
                              'text-red-400'
                            }`}>
                              {stat.status === 'on-track' ? '✓ On Track' :
                               stat.status === 'warning' ? '⚠ Warning' :
                               '✗ Exceeded'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-slate-400" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-slate-400" />
                          )}
                        </div>
                      </button>

                      {/* Progress Bar - Always Visible */}
                      <div className="px-4 pb-4 border-t border-slate-700">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-slate-400 uppercase tracking-wide">Progress</span>
                          <span className={`text-xs font-bold ${
                            stat.statusColor === 'green' ? 'text-green-400' :
                            stat.statusColor === 'yellow' ? 'text-orange-400' :
                            'text-red-400'
                          }`}>
                            {stat.percentageUsed.toFixed(0)}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              stat.statusColor === 'green' ? 'bg-green-500' :
                              stat.statusColor === 'yellow' ? 'bg-orange-500' :
                              'bg-red-500'
                            }`}
                            style={{ width: `${Math.min(stat.percentageUsed, 100)}%` }}
                          />
                        </div>
                      </div>

                      {/* Expandable Details */}
                      {isExpanded && (
                        <>
                          {/* Budget Info */}
                          <div className="px-4 py-3 border-t border-slate-700 space-y-3">
                            {/* Budget Amount */}
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400 text-sm">Budget</span>
                              <span className="text-white font-semibold">
                                {getCurrencySymbol(currency)} {stat.budgetAmount.toFixed(2)}
                              </span>
                            </div>

                            {/* Actual Spent */}
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400 text-sm">Spent</span>
                              <span className="text-white font-semibold">
                                {getCurrencySymbol(currency)} {stat.actualSpent.toFixed(2)}
                              </span>
                            </div>

                            {/* Remaining/Overage */}
                            <div className="flex justify-between items-center pt-2 border-t border-slate-700">
                              <span className="text-slate-400 text-sm">
                                {stat.remaining >= 0 ? 'Remaining' : 'Over by'}
                              </span>
                              <span className={`font-semibold ${
                                stat.remaining >= 0 ? 'text-green-400' : 'text-red-400'
                              }`}>
                                {getCurrencySymbol(currency)} {Math.abs(stat.remaining).toFixed(2)}
                              </span>
                            </div>
                          </div>

                          {/* Action Button */}
                          <div className="px-4 py-3 border-t border-slate-700">
                            <button
                              onClick={() => setViewMode('grouped')}
                              className="w-full bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white py-2 rounded-lg transition text-sm font-medium"
                            >
                              Edit Budget
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
