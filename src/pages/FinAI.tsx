import { useContext, useEffect, useRef, useState } from 'react'
import { AuthContext } from '../App'
import { supabase } from '../lib/supabase'
import Layout from '../components/Layout'
import { Bot, Send, User, Sparkles, TrendingUp, TrendingDown, Loader2 } from 'lucide-react'
import {
  formatCurrency,
  getMonthPeriodKey,
  getPeriodDateRange,
} from '../lib/utils'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  isAI?: boolean
}

interface Category {
  id: string
  name: string
  icon: string
  color: string
  type: 'expense' | 'income'
  parent_id: string | null
}

interface Transaction {
  id: string
  amount: number
  description: string | null
  transaction_date: string
  category_id: string
}

interface UserProfile {
  full_name: string | null
  email: string | null
  currency: string
  monthly_budget: number
  month_start_day: number
}

const SUGGESTED_QUESTIONS = [
  'How much did I spend this month?',
  'What is my top spending category?',
  'How much did I save this month?',
  'Compare this month to last month',
  'What is my budget status?',
  'Show me recent transactions',
  'How much do I spend on average?',
  'What categories use my budget the most?',
  'What\'s my savings rate?',
  'How is my spending trending?',
  'Which categories increased?',
]

export default function FinAI() {
  const { user } = useContext(AuthContext)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [dataLoaded, setDataLoaded] = useState(false)
  const [usingGroq, setUsingGroq] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY

  useEffect(() => {
    if (user) {
      loadUserData()
      loadChatHistory()
    }
  }, [user])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    // Focus input when not loading and data is loaded
    if (!loading && dataLoaded) {
      inputRef.current?.focus()
    }
  }, [loading, dataLoaded])

  useEffect(() => {
    // Add global click listener to focus input unless clicking interactive elements
    const handlePageClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement

      // List of interactive element tags and classes to exclude
      const isInteractive =
        target.tagName === 'BUTTON' ||
        target.tagName === 'A' ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.closest('button') ||
        target.closest('a') ||
        target.closest('input') ||
        target.closest('select')

      // Focus input only if not clicking an interactive element and input is enabled
      if (!isInteractive && !loading && dataLoaded) {
        inputRef.current?.focus()
      }
    }

    // Add listener to document
    document.addEventListener('click', handlePageClick)

    // Cleanup
    return () => {
      document.removeEventListener('click', handlePageClick)
    }
  }, [loading, dataLoaded])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const loadUserData = async () => {
    if (!user) return

    try {
      // Fetch profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name, email, currency, monthly_budget, month_start_day')
        .eq('id', user.id)
        .single()

      if (profileData) setProfile(profileData)

      // Fetch categories
      const { data: catData } = await supabase
        .from('categories')
        .select('id, name, icon, color, type, parent_id')
        .eq('user_id', user.id)

      if (catData) setCategories(catData)

      // Fetch transactions (last 12 months)
      const oneYearAgo = new Date()
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
      const startDate = oneYearAgo.toISOString().split('T')[0]

      const { data: txData } = await supabase
        .from('transactions')
        .select('id, amount, description, transaction_date, category_id')
        .eq('user_id', user.id)
        .gte('transaction_date', startDate)
        .order('transaction_date', { ascending: false })

      if (txData) setTransactions(txData)

      setDataLoaded(true)
    } catch (error) {
      console.error('Error loading data:', error)
    }
  }

  const loadChatHistory = async () => {
    if (!user) return

    try {
      const { data: messagesData } = await supabase
        .from('chat_messages')
        .select('id, role, content, timestamp, is_ai')
        .eq('user_id', user.id)
        .order('timestamp', { ascending: true })

      if (messagesData && messagesData.length > 0) {
        // Load existing chat history
        const loadedMessages: Message[] = messagesData.map((msg) => ({
          id: msg.id,
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
          timestamp: new Date(msg.timestamp),
          isAI: msg.is_ai,
        }))
        setMessages(loadedMessages)
      } else {
        // No history - add welcome message
        const { data: profileData } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single()

        const welcomeName = profileData?.full_name?.split(' ')[0] || 'there'
        const welcomeMsg: Message = {
          id: `welcome-${Date.now()}`,
          role: 'assistant',
          content: `Hello ${welcomeName}! 👋 I'm FinAI, your personal finance assistant. I can analyze your spending, savings, categories, and trends. Ask me anything about your finances!`,
          timestamp: new Date(),
        }
        setMessages([welcomeMsg])

        // Save welcome message to database
        await supabase.from('chat_messages').insert({
          user_id: user.id,
          role: 'assistant',
          content: welcomeMsg.content,
          timestamp: new Date().toISOString(),
          is_ai: false,
        })
      }
    } catch (error) {
      console.error('Error loading chat history:', error)
      // Fallback: show welcome message if loading fails
      const welcomeMsg: Message = {
        id: `welcome-${Date.now()}`,
        role: 'assistant',
        content: `Hello! 👋 I'm FinAI, your personal finance assistant. I can analyze your spending, savings, categories, and trends. Ask me anything about your finances!`,
        timestamp: new Date(),
      }
      setMessages([welcomeMsg])
    }
  }

  const saveMessageToDatabase = async (message: Message) => {
    if (!user) return

    try {
      await supabase.from('chat_messages').insert({
        user_id: user.id,
        role: message.role,
        content: message.content,
        timestamp: message.timestamp.toISOString(),
        is_ai: message.isAI || false,
      })
    } catch (error) {
      console.error('Error saving message to database:', error)
    }
  }

  // ============== ANALYSIS HELPERS ==============

  const getCurrentPeriod = (): { startDate: string; endDate: string; label: string } => {
    if (!profile) return { startDate: '', endDate: '', label: '' }
    const today = new Date().toISOString().split('T')[0]
    const periodKey = getMonthPeriodKey(today, profile.month_start_day)
    const { startDate, endDate } = getPeriodDateRange(periodKey)
    return { startDate, endDate, label: 'this month' }
  }

  const getPreviousPeriod = (): { startDate: string; endDate: string; label: string } => {
    if (!profile) return { startDate: '', endDate: '', label: '' }
    const today = new Date()
    today.setMonth(today.getMonth() - 1)
    const dateStr = today.toISOString().split('T')[0]
    const periodKey = getMonthPeriodKey(dateStr, profile.month_start_day)
    const { startDate, endDate } = getPeriodDateRange(periodKey)
    return { startDate, endDate, label: 'last month' }
  }

  const getTransactionsInRange = (
    startDate: string,
    endDate: string,
    type?: 'expense' | 'income'
  ): Transaction[] => {
    const categoryTypeMap = new Map(categories.map((c) => [c.id, c.type]))
    return transactions.filter((t) => {
      const inRange =
        t.transaction_date >= startDate && t.transaction_date <= endDate
      if (!inRange) return false
      if (type) {
        return categoryTypeMap.get(t.category_id) === type
      }
      return true
    })
  }

  const sumAmount = (txns: Transaction[]): number =>
    txns.reduce((sum, t) => sum + Number(t.amount), 0)

  const getCategoryById = (id: string): Category | undefined =>
    categories.find((c) => c.id === id)

  const getCategoryBreakdown = (
    txns: Transaction[]
  ): { category: Category; amount: number; count: number }[] => {
    const map = new Map<string, { amount: number; count: number }>()
    txns.forEach((t) => {
      const existing = map.get(t.category_id) || { amount: 0, count: 0 }
      map.set(t.category_id, {
        amount: existing.amount + Number(t.amount),
        count: existing.count + 1,
      })
    })

    const result: { category: Category; amount: number; count: number }[] = []
    map.forEach((value, key) => {
      const cat = getCategoryById(key)
      if (cat) result.push({ category: cat, ...value })
    })
    return result.sort((a, b) => b.amount - a.amount)
  }

  const formatCurrencyAmount = (amount: number): string => {
    return formatCurrency(amount, profile?.currency || 'USD')
  }

  // ============== CALCULATION HELPERS FOR PHASE 1 ==============

  const calculateSavingsRate = (earned: number, spent: number): number => {
    return earned > 0 ? ((earned - spent) / earned) * 100 : 0
  }

  const calculateExpenseRatio = (earned: number, spent: number): number => {
    return earned > 0 ? (spent / earned) * 100 : 0
  }

  const calculateBudgetRemaining = (): number => {
    if (!profile) return 0
    const currentPeriod = getCurrentPeriod()
    const spent = sumAmount(
      getTransactionsInRange(currentPeriod.startDate, currentPeriod.endDate, 'expense')
    )
    return (profile.monthly_budget || 0) - spent
  }

  const calculateBudgetUsedPercent = (): number => {
    if (!profile || !profile.monthly_budget) return 0
    const currentPeriod = getCurrentPeriod()
    const spent = sumAmount(
      getTransactionsInRange(currentPeriod.startDate, currentPeriod.endDate, 'expense')
    )
    return (spent / profile.monthly_budget) * 100
  }

  const getTopCategoryThisMonth = (): { category: Category; amount: number } | null => {
    const currentPeriod = getCurrentPeriod()
    const currentExpenses = getTransactionsInRange(
      currentPeriod.startDate,
      currentPeriod.endDate,
      'expense'
    )
    const breakdown = getCategoryBreakdown(currentExpenses)
    return breakdown.length > 0 ? { category: breakdown[0].category, amount: breakdown[0].amount } : null
  }

  const getTopCategoryWithComparison = (): {
    category: Category
    amount: number
    previousAmount: number
    changePercent: number
    trendDirection: 'up' | 'down' | 'neutral'
  } | null => {
    const top = getTopCategoryThisMonth()
    if (!top) return null

    const previousPeriod = getPreviousPeriod()
    const previousExpenses = getTransactionsInRange(
      previousPeriod.startDate,
      previousPeriod.endDate,
      'expense'
    )
    const previousBreakdown = getCategoryBreakdown(previousExpenses)
    const previousAmount =
      previousBreakdown.find((cat) => cat.category.id === top.category.id)?.amount || 0

    const changePercent =
      previousAmount > 0
        ? ((top.amount - previousAmount) / previousAmount) * 100
        : top.amount > 0
        ? 100
        : 0

    const trendDirection =
      top.amount > previousAmount ? 'up' : top.amount < previousAmount ? 'down' : 'neutral'

    return {
      category: top.category,
      amount: top.amount,
      previousAmount,
      changePercent,
      trendDirection,
    }
  }

  const getTop3CategoriesWithChange = (): Array<{
    category: Category
    amount: number
    previousAmount: number
    changePercent: number
  }> => {
    const currentPeriod = getCurrentPeriod()
    const previousPeriod = getPreviousPeriod()

    const currentExpenses = getTransactionsInRange(
      currentPeriod.startDate,
      currentPeriod.endDate,
      'expense'
    )
    const previousExpenses = getTransactionsInRange(
      previousPeriod.startDate,
      previousPeriod.endDate,
      'expense'
    )

    const currentBreakdown = getCategoryBreakdown(currentExpenses)
    const previousMap = new Map<string, number>()

    getCategoryBreakdown(previousExpenses).forEach((item) => {
      previousMap.set(item.category.id, item.amount)
    })

    return currentBreakdown.slice(0, 3).map((item) => {
      const previousAmount = previousMap.get(item.category.id) || 0
      const changePercent =
        previousAmount > 0
          ? ((item.amount - previousAmount) / previousAmount) * 100
          : item.amount > 0
          ? 100
          : 0

      return {
        category: item.category,
        amount: item.amount,
        previousAmount,
        changePercent,
      }
    })
  }

  // ============== PHASE 2: BUDGET PERFORMANCE ==============

  interface CategoryBudgetPerformance {
    categoryId: string
    categoryName: string
    categoryIcon: string
    budgetAmount: number
    actualSpent: number
    remaining: number
    percentUsed: number
    isOver: boolean
  }

  // ============== PHASE 3: TRENDS & FORECASTING ==============

  interface CategoryTrend {
    categoryId: string
    categoryName: string
    categoryIcon: string
    data: Array<{
      month: string
      amount: number
    }>
    trend: 'increasing' | 'decreasing' | 'stable'
    trendPercent: number
    forecast: number
    confidence: number // 0-100%
  }

  const calculateCategoryTrends = (): CategoryTrend[] => {
    const oneYearAgo = new Date()
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

    const trends: CategoryTrend[] = []

    // Calculate trends for each expense category
    categories.filter(c => c.type === 'expense').forEach(category => {
      const monthlyData: Array<{ month: string; amount: number }> = []

      // Get spending for each of the last 12 months
      for (let i = 11; i >= 0; i--) {
        const targetDate = new Date()
        targetDate.setMonth(targetDate.getMonth() - i)

        const monthStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1)
        const monthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59)

        const monthTransactions = transactions.filter(
          t =>
            t.category_id === category.id &&
            new Date(t.transaction_date) >= monthStart &&
            new Date(t.transaction_date) <= monthEnd
        )

        const amount = monthTransactions.reduce((sum, t) => sum + t.amount, 0)
        const monthLabel = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`

        monthlyData.push({ month: monthLabel, amount })
      }

      // Get last 3 months of data
      const last3Months = monthlyData.slice(-3)
      if (last3Months.length < 2) return // Skip if less than 2 months of data

      // Calculate 3-month moving average
      const avg3Month = last3Months.reduce((sum, d) => sum + d.amount, 0) / last3Months.length

      // Calculate trend (compare last month to 2 months ago)
      const lastMonthAmount = last3Months[2].amount
      const twoMonthsAgoAmount = last3Months[1].amount
      const trendPercent =
        twoMonthsAgoAmount > 0 ? ((lastMonthAmount - twoMonthsAgoAmount) / twoMonthsAgoAmount) * 100 : 0

      // Determine trend direction
      let trend: 'increasing' | 'decreasing' | 'stable' = 'stable'
      if (trendPercent > 5) trend = 'increasing'
      else if (trendPercent < -5) trend = 'decreasing'

      // Simple forecast using average trend
      const forecast = avg3Month * (1 + trendPercent / 100)

      // Confidence decreases with volatility
      const volatility =
        Math.max(...last3Months.map(d => d.amount)) - Math.min(...last3Months.map(d => d.amount))
      const volatilityPercent = avg3Month > 0 ? (volatility / avg3Month) * 100 : 0
      const confidence = Math.max(30, Math.min(95, 100 - volatilityPercent / 2))

      trends.push({
        categoryId: category.id,
        categoryName: category.name,
        categoryIcon: category.icon,
        data: monthlyData,
        trend,
        trendPercent,
        forecast: Math.max(0, forecast),
        confidence,
      })
    })

    // Sort by trend importance (increasing trends first)
    return trends.sort((a, b) => Math.abs(b.trendPercent) - Math.abs(a.trendPercent))
  }

  // ============== PHASE 4: ANOMALY DETECTION ==============

  interface AnomalyAlert {
    type: 'large_transaction' | 'unusual_merchant' | 'category_spike'
    description: string
    severity: 'low' | 'medium' | 'high'
  }

  const detectAnomalies = (): AnomalyAlert[] => {
    const alerts: AnomalyAlert[] = []
    const currentPeriod = getCurrentPeriod()
    const currentExpenses = getTransactionsInRange(currentPeriod.startDate, currentPeriod.endDate, 'expense')

    if (currentExpenses.length === 0) return alerts

    // Calculate average transaction size by category
    const spendingByCategory = new Map<string, number[]>()
    currentExpenses.forEach(t => {
      const amounts = spendingByCategory.get(t.category_id) || []
      amounts.push(t.amount)
      spendingByCategory.set(t.category_id, amounts)
    })

    // Detect unusually large transactions using adaptive thresholds
    spendingByCategory.forEach((amounts, categoryId) => {
      if (amounts.length < 2) return

      // Use adaptive threshold based on learned baselines or current distribution
      const threshold = getAdaptiveAnomalyThreshold(categoryId, amounts)

      amounts.forEach(amount => {
        if (amount > threshold) {
          const category = categories.find(c => c.id === categoryId)
          alerts.push({
            type: 'large_transaction',
            description: `${category?.name}: unusually large transaction of ${formatCurrency(amount, profile!.currency)}`,
            severity: 'medium',
          })
        }
      })
    })

    // Limit to 3 most significant alerts
    return alerts.slice(0, 3)
  }

  // ============== PHASE 5: SCENARIO SUPPORT ==============

  const parseScenarioQuestion = (question: string): { isScenario: boolean; category?: string; reduction?: number } => {
    const lowerQ = question.toLowerCase()

    // Check if question is about "what if" scenarios
    if (!lowerQ.includes('what if') && !lowerQ.includes('suppose') && !lowerQ.includes('reduce') && !lowerQ.includes('cut')) {
      return { isScenario: false }
    }

    // Try to extract category and percentage from question
    let category: string | undefined
    let reduction: number | undefined

    // Find if question mentions reducing/cutting budget
    const percentMatch = question.match(/(\d+)%/);
    if (percentMatch) {
      reduction = parseInt(percentMatch[1])
    }

    // Find category mentions
    categories.forEach(cat => {
      if (lowerQ.includes(cat.name.toLowerCase())) {
        category = cat.name
      }
    })

    return {
      isScenario: true,
      category,
      reduction,
    }
  }

  const calculateScenarioImpact = (category: string | undefined, reduction: number | undefined): string => {
    if (!reduction || reduction <= 0) {
      return 'To analyze a scenario, please specify a percentage reduction (e.g., "reduce by 20%")'
    }

    // If no category specified, assume overall spending reduction
    if (!category) {
      const currentPeriod = getCurrentPeriod()
      const currentExpenses = getTransactionsInRange(currentPeriod.startDate, currentPeriod.endDate, 'expense')
      const currentSpent = sumAmount(currentExpenses)
      const currentIncome = sumAmount(getTransactionsInRange(currentPeriod.startDate, currentPeriod.endDate, 'income'))

      const savingsReduction = currentSpent * (reduction / 100)
      const newSpent = currentSpent - savingsReduction
      const newSavingsRate = calculateSavingsRate(currentIncome, newSpent)

      return `If you reduce spending by ${reduction}%:
- Current spending: ${formatCurrency(currentSpent, profile!.currency)}
- New spending: ${formatCurrency(newSpent, profile!.currency)}
- Additional savings: ${formatCurrency(savingsReduction, profile!.currency)}
- New savings rate: ${newSavingsRate.toFixed(1)}%
- Annual impact: ${formatCurrency(savingsReduction * 12, profile!.currency)} saved per year`
    }

    return 'Scenario analysis ready. Please let me know specific spending adjustments to model.'
  }

  const formatTrendAnalysis = (trends: CategoryTrend[]): string => {
    if (trends.length === 0) return 'Not enough data to analyze trends'

    return trends
      .slice(0, 5) // Show top 5 trends
      .map(t => {
        const trendIcon = t.trend === 'increasing' ? '📈' : t.trend === 'decreasing' ? '📉' : '➡️'
        const direction = t.trendPercent > 0 ? '↑' : t.trendPercent < 0 ? '↓' : '→'
        return `${trendIcon} ${t.categoryIcon} ${t.categoryName}: ${direction} ${Math.abs(t.trendPercent).toFixed(1)}% (forecast: ${formatCurrency(t.forecast, profile!.currency)}, confidence: ${t.confidence.toFixed(0)}%)`
      })
      .join('\n')
  }

  const fetchCategoryBudgetPerformance = async (): Promise<CategoryBudgetPerformance[]> => {
    if (!user) return []

    try {
      const currentPeriod = getCurrentPeriod()
      const monthKey = getMonthPeriodKey(currentPeriod.startDate, profile?.month_start_day || 1)

      // Extract year and month from monthKey (format: "202505-01" or "202505")
      const [yearMonth] = monthKey.split('-')
      const year = parseInt(yearMonth.substring(0, 4))
      const month = parseInt(yearMonth.substring(4))

      // Fetch category budgets for current period
      const { data: budgetsData } = await supabase
        .from('budgets')
        .select('category_id, amount')
        .eq('user_id', user.id)
        .eq('year', year)
        .eq('month', month)

      if (!budgetsData) return []

      // Create a map of category_id -> budget amount
      const budgetMap = new Map<string, number>(
        budgetsData.map(b => [b.category_id, b.amount])
      )

      // Calculate actual spending per category
      const currentExpenses = getTransactionsInRange(currentPeriod.startDate, currentPeriod.endDate, 'expense')
      const spendingByCategory = new Map<string, number>()

      currentExpenses.forEach(txn => {
        const current = spendingByCategory.get(txn.category_id) || 0
        spendingByCategory.set(txn.category_id, current + txn.amount)
      })

      // Build performance data for all budgeted categories
      const performance: CategoryBudgetPerformance[] = []

      budgetMap.forEach((budgetAmount, categoryId) => {
        const category = categories.find(c => c.id === categoryId)
        if (!category) return

        const actualSpent = spendingByCategory.get(categoryId) || 0
        const remaining = budgetAmount - actualSpent
        const percentUsed = budgetAmount > 0 ? (actualSpent / budgetAmount) * 100 : 0

        performance.push({
          categoryId,
          categoryName: category.name,
          categoryIcon: category.icon,
          budgetAmount,
          actualSpent,
          remaining,
          percentUsed,
          isOver: actualSpent > budgetAmount,
        })
      })

      return performance.sort((a, b) => b.percentUsed - a.percentUsed) // Sort by % used descending
    } catch (error) {
      console.error('Error fetching budget performance:', error)
      return []
    }
  }

  // ============== PHASE 3: ML-BASED LEARNING & SMART RECOMMENDATIONS ==============

  interface CategoryPattern {
    categoryId: string
    categoryName: string
    categoryIcon: string
    avgMonthly: number
    variance: number
    trend: 'increasing' | 'decreasing' | 'stable'
    trendPercent: number
    type: 'essential' | 'discretionary'
    monthlyData: Array<{ month: string; amount: number }>
  }

  interface CategoryBaseline {
    categoryId: string
    mean: number
    stdDev: number
    median: number
    lastUpdated: string
    dataPoints: number
  }

  interface BudgetRecommendation {
    categoryId: string
    categoryName: string
    categoryIcon: string
    currentBudget: number | null
    actualAvgMonthly: number
    recommendations: {
      sustainable: number // avg + 20%
      comfortable: number // avg + 10%
      aggressive: number // avg
    }
    savingsPotential: number // annual savings if reduced to aggressive
    status: 'well-aligned' | 'over-budgeted' | 'under-budgeted'
  }

  const analyzeCategoryPatterns = (): CategoryPattern[] => {
    const oneYearAgo = new Date()
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

    const patterns: CategoryPattern[] = []

    categories.filter(c => c.type === 'expense').forEach(category => {
      const monthlyData: Array<{ month: string; amount: number }> = []
      const amounts: number[] = []

      // Get spending for each of the last 12 months
      for (let i = 11; i >= 0; i--) {
        const targetDate = new Date()
        targetDate.setMonth(targetDate.getMonth() - i)

        const monthStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1)
        const monthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59)

        const monthTransactions = transactions.filter(
          t =>
            t.category_id === category.id &&
            new Date(t.transaction_date) >= monthStart &&
            new Date(t.transaction_date) <= monthEnd
        )

        const amount = monthTransactions.reduce((sum, t) => sum + t.amount, 0)
        const monthLabel = `${targetDate.toLocaleDateString('en-US', { month: 'short' })}`

        monthlyData.push({ month: monthLabel, amount })
        if (amount > 0) amounts.push(amount)
      }

      if (amounts.length === 0) return

      // Calculate statistics
      const avgMonthly = amounts.reduce((a, b) => a + b, 0) / amounts.length
      const variance = amounts.reduce((sum, val) => sum + Math.pow(val - avgMonthly, 2), 0) / amounts.length
      const stdDev = Math.sqrt(variance)
      const coefficientOfVariation = avgMonthly > 0 ? (stdDev / avgMonthly) * 100 : 0

      // Determine type: essential (low variance) vs discretionary (high variance)
      const type = coefficientOfVariation < 30 ? 'essential' : 'discretionary'

      // Calculate trend (first 6 months vs last 6 months)
      const firstHalf = amounts.slice(0, Math.ceil(amounts.length / 2))
      const secondHalf = amounts.slice(Math.ceil(amounts.length / 2))
      const avgFirstHalf = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
      const avgSecondHalf = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length
      const trendPercent = avgFirstHalf > 0 ? ((avgSecondHalf - avgFirstHalf) / avgFirstHalf) * 100 : 0
      const trend = trendPercent > 5 ? 'increasing' : trendPercent < -5 ? 'decreasing' : 'stable'

      patterns.push({
        categoryId: category.id,
        categoryName: category.name,
        categoryIcon: category.icon,
        avgMonthly,
        variance,
        trend,
        trendPercent,
        type,
        monthlyData,
      })
    })

    return patterns.sort((a, b) => b.avgMonthly - a.avgMonthly)
  }

  const generateBudgetRecommendations = (patterns: CategoryPattern[], budgetPerformance: CategoryBudgetPerformance[]): BudgetRecommendation[] => {
    const budgetMap = new Map<string, CategoryBudgetPerformance>(
      budgetPerformance.map(b => [b.categoryId, b])
    )

    return patterns.map(pattern => {
      const budget = budgetMap.get(pattern.categoryId)
      const currentBudget = budget?.budgetAmount || null

      const recommendations = {
        sustainable: Math.round(pattern.avgMonthly * 1.2 * 100) / 100, // avg + 20%
        comfortable: Math.round(pattern.avgMonthly * 1.1 * 100) / 100,  // avg + 10%
        aggressive: Math.round(pattern.avgMonthly * 100) / 100,          // avg
      }

      // Determine status based on actual budget
      let status: 'well-aligned' | 'over-budgeted' | 'under-budgeted'
      if (!currentBudget) {
        status = 'under-budgeted' // No budget set
      } else if (currentBudget >= recommendations.comfortable && currentBudget <= recommendations.sustainable) {
        status = 'well-aligned'
      } else if (currentBudget > recommendations.sustainable) {
        status = 'over-budgeted'
      } else {
        status = 'under-budgeted'
      }

      const savingsPotential = (pattern.avgMonthly - recommendations.aggressive) * 12

      return {
        categoryId: pattern.categoryId,
        categoryName: pattern.categoryName,
        categoryIcon: pattern.categoryIcon,
        currentBudget,
        actualAvgMonthly: pattern.avgMonthly,
        recommendations,
        savingsPotential,
        status,
      }
    })
  }

  const detectBehavioralPatterns = (): string => {
    if (transactions.length < 20) {
      return 'Need more transaction history to detect behavior patterns (at least 20 transactions)'
    }

    const dayOfWeekSpending = new Map<number, number>()
    const hourCounts = new Map<number, number>()
    const transactionSizesByCategory = new Map<string, number[]>()
    const dateSpending = new Map<string, number>() // For paycheck cycle detection

    // Get all expense transactions
    const expenseTransactions = getTransactionsInRange('1900-01-01', '2100-01-01', 'expense')

    // Analyze each transaction
    expenseTransactions.forEach(txn => {
      const date = new Date(txn.transaction_date)
      const dayOfWeek = date.getDay()
      const hour = date.getHours()
      const dateKey = date.toISOString().split('T')[0]

      // Day of week
      dayOfWeekSpending.set(dayOfWeek, (dayOfWeekSpending.get(dayOfWeek) || 0) + txn.amount)

      // Time of day
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1)

      // Transaction size by category
      const catSizes = transactionSizesByCategory.get(txn.category_id) || []
      catSizes.push(txn.amount)
      transactionSizesByCategory.set(txn.category_id, catSizes)

      // Date spending (for paycheck cycle)
      dateSpending.set(dateKey, (dateSpending.get(dateKey) || 0) + txn.amount)
    })

    // Analyze patterns
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const maxDay = Array.from(dayOfWeekSpending.entries()).reduce((a, b) => a[1] > b[1] ? a : b)
    const totalExpenses = sumAmount(getTransactionsInRange('1900-01-01', '2100-01-01', 'expense'))
    const topDayPercent = maxDay && totalExpenses > 0 ? (maxDay[1] / totalExpenses * 100).toFixed(0) : '0'

    const maxHour = Array.from(hourCounts.entries()).reduce((a, b) => a[1] > b[1] ? a : b)
    const activeHour = maxHour ? `${maxHour[0].toString().padStart(2, '0')}:00` : 'Unknown'

    const patterns: string[] = [
      `⏰ Peak spending day: ${dayNames[maxDay[0]]} (${topDayPercent}% of weekly spending)`,
      `🕐 Most active time: Around ${activeHour} (${maxHour[1]} transactions)`,
    ]

    // Detect paycheck cycle patterns
    const dates = Array.from(dateSpending.keys()).sort()
    if (dates.length > 10) {
      const firstDaySpends = dateSpending.get(dates[0]) || 0
      const fifteenthDaySpends = dates.length > 14 ? (dateSpending.get(dates[14]) || 0) : 0

      if (firstDaySpends > fifteenthDaySpends * 1.5) {
        patterns.push(`💰 Paycheck pattern detected: You spend more around the 1st-5th (payday spike)`)
      }
    }

    // Analyze category-specific transaction patterns
    const categoryPatterns: string[] = []
    transactionSizesByCategory.forEach((sizes, catId) => {
      const cat = categories.find(c => c.id === catId)
      if (!cat || sizes.length < 3) return

      const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length
      const minSize = Math.min(...sizes)
      const maxSize = Math.max(...sizes)

      if (maxSize / avgSize > 3) {
        // High variance in transaction size
        if (minSize < avgSize / 2) {
          categoryPatterns.push(`${cat.icon} ${cat.name}: Mix of small (${formatCurrencyAmount(minSize)}) and large (${formatCurrencyAmount(maxSize)}) transactions`)
        }
      }
    })

    if (categoryPatterns.length > 0) {
      patterns.push(`\n💳 Transaction Patterns by Category:`)
      patterns.push(...categoryPatterns.slice(0, 3))
    }

    return patterns.join('\n')
  }

  const storeBaseline = (categoryId: string, baseline: CategoryBaseline): void => {
    try {
      const baselines = JSON.parse(localStorage.getItem('finai_baselines') || '{}')
      baselines[categoryId] = baseline
      localStorage.setItem('finai_baselines', JSON.stringify(baselines))
    } catch (error) {
      console.error('Error storing baseline:', error)
    }
  }

  const loadBaseline = (categoryId: string): CategoryBaseline | null => {
    try {
      const baselines = JSON.parse(localStorage.getItem('finai_baselines') || '{}')
      return baselines[categoryId] || null
    } catch (error) {
      console.error('Error loading baseline:', error)
      return null
    }
  }

  const updateAnomalyBaselines = (): void => {
    const patterns = analyzeCategoryPatterns()
    const lastUpdateKey = 'finai_baseline_last_update'
    const lastUpdate = localStorage.getItem(lastUpdateKey)
    const today = new Date().toISOString().split('T')[0]

    // Only update once per month
    if (lastUpdate === today) return

    patterns.forEach(pattern => {
      const baseline: CategoryBaseline = {
        categoryId: pattern.categoryId,
        mean: pattern.avgMonthly,
        stdDev: Math.sqrt(pattern.variance),
        median: 0, // Simplified for now
        lastUpdated: today,
        dataPoints: pattern.monthlyData.length,
      }
      storeBaseline(pattern.categoryId, baseline)
    })

    localStorage.setItem(lastUpdateKey, today)
  }

  const getAdaptiveAnomalyThreshold = (categoryId: string, values: number[]): number => {
    if (values.length < 3) return Math.max(...values) * 1.5 // Fallback

    // Load learned baseline for this category
    const baseline = loadBaseline(categoryId)

    if (baseline && baseline.stdDev > 0) {
      // Use learned baseline: mean + 3 * std dev
      return baseline.mean + (3 * baseline.stdDev)
    }

    // Fallback: calculate from current values
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length
    const stdDev = Math.sqrt(variance)
    return mean + (3 * stdDev)
  }

  const formatCategoryPatterns = (patterns: CategoryPattern[]): string => {
    if (patterns.length === 0) return 'Not enough data for spending patterns'

    return patterns
      .slice(0, 5)
      .map(p => {
        const type = p.type === 'essential' ? '📌' : '🎯'
        const trend = p.trend === 'increasing' ? '📈' : p.trend === 'decreasing' ? '📉' : '➡️'
        return `${type} ${p.categoryIcon} ${p.categoryName}: Avg ${formatCurrency(p.avgMonthly, profile!.currency)}/month ${trend} ${p.trendPercent > 0 ? '+' : ''}${p.trendPercent.toFixed(1)}%`
      })
      .join('\n')
  }

  const formatBudgetRecommendations = (recommendations: BudgetRecommendation[]): string => {
    if (recommendations.length === 0) return 'No budget recommendations yet'

    const topOpportunities = recommendations
      .filter(r => r.savingsPotential > 0)
      .sort((a, b) => b.savingsPotential - a.savingsPotential)
      .slice(0, 3)

    if (topOpportunities.length === 0) return 'Your budgets are well-aligned with spending'

    return topOpportunities
      .map(r => {
        const impact = formatCurrency(r.savingsPotential, profile!.currency)
        return `${r.categoryIcon} ${r.categoryName}: Could save ${impact}/year by setting budget to ${formatCurrency(r.recommendations.aggressive, profile!.currency)}`
      })
      .join('\n')
  }


  // ============== GROQ API INTEGRATION ==============
  // All questions route through Groq AI for intelligent responses

  interface GroqMessage {
    role: 'system' | 'user' | 'assistant'
    content: string
  }

  const callGroqAPI = async (systemPrompt: string, conversationHistory: GroqMessage[]): Promise<string | null> => {
    if (!GROQ_API_KEY) {
      console.warn('Groq API key not configured')
      return null
    }

    try {
      const messages: GroqMessage[] = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory, // Include full conversation context
      ]

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages,
          max_tokens: 500,
          temperature: 0.7,
        }),
      })

      if (!response.ok) {
        console.error('Groq API error:', response.status)
        return null
      }

      const data = await response.json()
      return data.choices?.[0]?.message?.content || null
    } catch (error) {
      console.error('Groq API call failed:', error)
      return null
    }
  }

  // ============== RESPONSE GENERATION ==============

  const generateResponse = async (userMessage: string): Promise<string> => {
    if (!profile || !dataLoaded) {
      return 'I am still loading your data. Please give me a moment...'
    }

    if (transactions.length === 0) {
      return "I don't see any transactions yet. Start adding some on the Transactions page, then come back to ask me about them!"
    }

    // Always use Groq AI for all questions
    if (GROQ_API_KEY) {
      // Build financial context for Groq
      const currentPeriod = getCurrentPeriod()
      const previousPeriod = getPreviousPeriod()

      const currentExpenses = getTransactionsInRange(currentPeriod.startDate, currentPeriod.endDate, 'expense')
      const currentIncome = getTransactionsInRange(currentPeriod.startDate, currentPeriod.endDate, 'income')
      const currentSpent = sumAmount(currentExpenses)
      const currentEarned = sumAmount(currentIncome)

      const previousExpenses = getTransactionsInRange(previousPeriod.startDate, previousPeriod.endDate, 'expense')
      const previousSpent = sumAmount(previousExpenses)

      const allTimeExpenses = getTransactionsInRange('1900-01-01', '2100-01-01', 'expense')
      const allTimeSpent = sumAmount(allTimeExpenses)

      // Phase 1: Calculate advanced metrics
      const savingsRate = calculateSavingsRate(currentEarned, currentSpent)
      const expenseRatio = calculateExpenseRatio(currentEarned, currentSpent)
      const budgetRemaining = calculateBudgetRemaining()
      const budgetUsedPercent = calculateBudgetUsedPercent()
      const top3Categories = getTop3CategoriesWithChange()

      // Format top 3 categories with change indicators
      const top3Text = top3Categories.length > 0
        ? top3Categories
          .map(
            (item) =>
              `${item.category.name}: ${formatCurrency(item.amount, profile.currency)} (${
                item.changePercent > 0 ? '↑' : item.changePercent < 0 ? '↓' : '→'
              } ${Math.abs(item.changePercent).toFixed(1)}%)`
          )
          .join(', ')
        : 'No spending yet'

      // Phase 2: Fetch budget performance data
      const categoryBudgetPerformance = await fetchCategoryBudgetPerformance()

      // Format category budgets for context
      const budgetBreakdownText = categoryBudgetPerformance.length > 0
        ? categoryBudgetPerformance
          .map(perf => {
            const status = perf.isOver ? '🔴 OVER' : perf.percentUsed >= 80 ? '🟡 WARNING' : '🟢 OK'
            return `${perf.categoryIcon} ${perf.categoryName}: ${formatCurrency(perf.actualSpent, profile.currency)} / ${formatCurrency(perf.budgetAmount, profile.currency)} (${perf.percentUsed.toFixed(0)}%) ${status}`
          })
          .join('\n')
        : 'No category budgets set yet'

      // Phase 3: Calculate spending trends and forecasts
      const categoryTrends = calculateCategoryTrends()
      const trendAnalysisText = formatTrendAnalysis(categoryTrends)

      // Phase 3: Analyze category spending patterns and generate recommendations
      const categoryPatterns = analyzeCategoryPatterns()
      const patternsText = formatCategoryPatterns(categoryPatterns)

      const budgetRecommendations = generateBudgetRecommendations(categoryPatterns, categoryBudgetPerformance)
      const recommendationsText = formatBudgetRecommendations(budgetRecommendations)

      const behavioralPatternsText = detectBehavioralPatterns()

      // Update anomaly baselines monthly
      updateAnomalyBaselines()

      // Phase 4: Detect anomalies
      const anomalies = detectAnomalies()
      const anomalyText = anomalies.length > 0
        ? anomalies.map(a => `⚠️ ${a.description}`).join('\n')
        : 'No unusual spending patterns detected'

      // Phase 5: Check if this is a scenario question
      const scenario = parseScenarioQuestion(userMessage)
      const scenarioImpactText = scenario.isScenario ? calculateScenarioImpact(scenario.category, scenario.reduction) : ''

      const financialContext = `
User Profile:
- Name: ${profile.full_name || 'Friend'}
- Email: ${profile.email || 'Not provided'}

User's Financial Summary:
- Currency: ${profile.currency}
- Monthly Budget: ${formatCurrency(profile.monthly_budget, profile.currency)}
- Budget Used: ${budgetUsedPercent.toFixed(1)}% (${formatCurrency(budgetRemaining, profile.currency)} ${budgetRemaining >= 0 ? 'remaining' : 'OVER'})

Current Period (This Month):
- Earned: ${formatCurrency(currentEarned, profile.currency)}
- Spent: ${formatCurrency(currentSpent, profile.currency)}
- Saved: ${formatCurrency(currentEarned - currentSpent, profile.currency)}
- Savings Rate: ${savingsRate.toFixed(1)}% (${savingsRate >= 30 ? '✅ Excellent' : savingsRate >= 20 ? '✅ Good' : savingsRate >= 10 ? '⚠️ Fair' : '❌ Needs attention'})
- Expense Ratio: ${expenseRatio.toFixed(1)}%
- Transactions: ${currentExpenses.length} expense(s), ${currentIncome.length} income

Previous Period (Last Month):
- Spent: ${formatCurrency(previousSpent, profile.currency)}
- Change: ${previousSpent > 0 ? ((currentSpent - previousSpent) / previousSpent * 100).toFixed(1) : 0}% ${previousSpent > 0 && currentSpent > previousSpent ? '📈 (Higher)' : previousSpent > 0 && currentSpent < previousSpent ? '📉 (Lower)' : '(New data)'}

Top 3 Spending Categories This Month (with change):
${top3Text}

Category Budget Performance (This Month):
${budgetBreakdownText}
- Categories over budget will show 🔴 OVER
- Categories at 80%+ of budget will show 🟡 WARNING
- Categories under budget will show 🟢 OK

Spending Trends (Last 3 Months):
${trendAnalysisText}
- 📈 indicates increasing spending trend
- 📉 indicates decreasing spending trend
- ➡️ indicates stable spending
- Confidence level shows forecast reliability (higher = more reliable)

Category Spending Patterns (Last 12 Months):
${patternsText}
- 📌 Essential categories have low spending variance
- 🎯 Discretionary categories have higher variance
- Trend shows if category is increasing (📈), decreasing (📉), or stable (➡️)

Smart Budget Recommendations:
${recommendationsText}
- Recommendations are based on actual spending patterns
- Aggressive: Tight control based on average
- Comfortable: Average + 10% flexibility
- Sustainable: Average + 20% buffer

Behavioral Spending Patterns:
${behavioralPatternsText}
- When user tends to spend most
- How transactions vary by day, time, and category
- Potential paycheck cycles and spending habits

Anomaly Alerts:
${anomalyText}

${scenario.isScenario ? `Scenario Impact Analysis:\n${scenarioImpactText}\n` : ''}

Year-to-Date:
- All-Time Spent: ${formatCurrency(allTimeSpent, profile.currency)}
- Total Transactions: ${transactions.length}
- Expense Categories: ${categories.filter(c => c.type === 'expense').map(c => c.name).join(', ')}

KEY INSIGHTS & ALERTS (Improvement C - Better Prompt Engineering):
- Budget Status: ${budgetRemaining < 0 ? '🔴 CRITICAL - Over budget by ' + formatCurrency(Math.abs(budgetRemaining), profile.currency) : budgetRemaining < profile.monthly_budget * 0.1 ? '🟡 WARNING - Less than 10% budget remaining' : '🟢 On track'}
- Savings Target: ${savingsRate >= 30 ? '✅ Exceeding 30% savings rate' : savingsRate >= 20 ? '✅ Meeting 20%+ savings rate' : '⚠️ Below recommended 20% savings rate'}
- Spending Trend: ${previousSpent > 0 && currentSpent > previousSpent ? `📈 Spending increased by ${(((currentSpent - previousSpent) / previousSpent) * 100).toFixed(1)}% vs last month` : previousSpent > 0 && currentSpent < previousSpent ? `📉 Spending decreased by ${(((previousSpent - currentSpent) / previousSpent) * 100).toFixed(1)}% vs last month` : 'First month of data'}`

      // Phase 2: Build conversation history context
      // Get last 10 messages to maintain conversation context (excluding current message)
      const conversationHistoryForGroq: GroqMessage[] = messages
        .slice(-10) // Get last 10 messages
        .map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        }))

      // Add current user message
      conversationHistoryForGroq.push({
        role: 'user',
        content: userMessage,
      })

      // Enhanced system prompt with conversation awareness and budget analysis
      const systemPrompt = `You are a helpful financial analysis assistant. You have access to conversation history and can reference previous questions and answers.

IMPORTANT - What you CAN do:
- Analyze spending patterns and trends
- Answer questions about finances
- Provide insights and recommendations
- Compare periods (months, categories, budgets)
- Identify savings opportunities
- Suggest budget improvements
- Reference previous messages in the conversation
- Analyze category budget performance (over/under budget)
- Recommend budget adjustments based on spending patterns
- Track spending across categories and periods

IMPORTANT - What you CANNOT do:
- Create, add, or modify categories (users must use the Categories page)
- Create, add, or modify transactions (users must use the Transactions page)
- Delete anything
- Set budgets (users must use the Budgets page)
- Make account changes

CONVERSATION CONTEXT:
- You have access to the conversation history above
- Feel free to reference previous questions or answers
- You can provide follow-up analysis based on earlier messages
- Build on context from previous messages rather than restating information

BUDGET ANALYSIS:
- Review the Category Budget Performance section above
- Identify categories that are over budget (🔴 OVER)
- Flag categories at 80%+ of budget (🟡 WARNING)
- Highlight categories performing well (🟢 OK)
- Suggest reallocation if user is approaching overall budget

TREND ANALYSIS:
- Review the Spending Trends section showing last 3 months of data
- Identify accelerating categories (📈) that may exceed budget
- Highlight categories with decreasing spend (📉) as wins
- Use forecast values to predict next month spending
- Consider confidence levels when making predictions (high confidence = more reliable)
- Alert user to concerning trends early

SPENDING PATTERNS & INSIGHTS (Phase 3 - NEW):
- Review Category Spending Patterns section showing 12-month analysis
- Identify if categories are essential (consistent) or discretionary (variable)
- Use trend data to understand where user's money goes
- Recognize high-impact categories (highest spending)
- Consider type of category when making recommendations

SMART BUDGET RECOMMENDATIONS (Phase 3 - NEW):
- Review Smart Budget Recommendations section
- Explain why certain budgets are recommended
- Focus on highest-impact savings opportunities first
- When user asks about budgets, reference the recommendations
- Use annual savings potential to show impact of changes
- Suggest realistic adjustments that won't be too restrictive

BEHAVIORAL PATTERNS (Phase 3 - NEW):
- Use Behavioral Spending Patterns to understand when and how user spends
- Reference day-of-week patterns when relevant
- Mention time-of-day preferences when discussing spending habits
- Alert user to paycheck cycles if detected
- Use these insights to make personalized recommendations
- Help user understand their unique spending style

ANOMALY DETECTION:
- Review Anomaly Alerts section for unusual spending patterns
- Use adaptive baselines that learn from user's own spending patterns
- Warn about transactions that are unusual for that specific category
- Consider user's typical variance (high-variance categories more lenient)
- Alert user if new patterns emerge

SCENARIO ANALYSIS:
- When user asks "what if" questions, use Scenario Impact Analysis data
- Provide clear projections of how changes affect savings rate and annual impact
- Be supportive of spending reduction goals

If users ask you to perform actions like "create a category" or "add a transaction":
- Politely explain that you cannot perform actions
- Suggest they use the appropriate app feature instead (e.g., "Please create this category in the Categories page, then I can analyze it")

FINANCIAL DATA:
${financialContext}

RESPONSE FORMATTING (Enhanced - Improvement C):
- Be concise, friendly, and actionable
- Use currency symbols correctly: BHD (Bahraini Dinar), USD ($), EUR (€), etc.

MARKDOWN STRUCTURE:
- Use ## headers for major sections (e.g., ## Budget Analysis, ## Spending Trends)
- Use ### subheaders for detailed breakdowns
- Use --- or ___ for dividers between sections
- Format tables with pipe-separated cells for organized data display
- Use code blocks (```data) for complex financial tables or data
- Use bullet points for lists of items or simple recommendations
- Use **bold** for key numbers and metrics
- Use *italic* for context or explanations

TABLE FORMATTING:
- Create tables for comparing categories, periods, or budget status
- Header row format: | Category | Amount | Status |
- Include separator row: | --- | --- | --- |
- Example:
  | Category | This Month | Last Month | Change |
  | --- | --- | --- | --- |
  | Dining | BHD 450 | BHD 400 | ↑12.5% |

SPENDING INSIGHTS:
- Always include confidence levels: "Based on X months of data, I'm 85% confident that..."
- When showing trends, use ↑ for increases, ↓ for decreases, → for no change
- Highlight top 3 spending categories first
- Explain the "why" behind patterns when possible (paydays, seasonal, habits)
- Use 🔴 🟡 🟢 emojis for budget status
- Use 📈 for accelerating categories and 📉 for decreasing categories

KEY RECOMMENDATIONS STYLE:
- Start with the highest-impact recommendation
- Use specific numbers: "Save BHD 600/year by reducing dining by 20%"
- Make recommendations realistic and achievable
- Tie savings to user's goals or context
- Suggest small wins alongside major opportunities
- Use comparison context: "This is X% less than last month"

CONVERSATION STYLE:
- Reference specific previous messages when available
- Build on earlier analysis rather than repeating information
- Ask clarifying questions when user's intent is ambiguous
- Provide follow-up suggestions based on conversation context
- If user asks about something unrelated to finances, politely redirect

MARKDOWN EXAMPLES:
Example 1 - Budget Analysis with Table:
## Budget Analysis

Your budget status is strong this month:

| Category | Budget | Spent | Status |
| --- | --- | --- | --- |
| Dining | BHD 300 | BHD 250 | 🟢 OK |
| Transport | BHD 200 | BHD 210 | 🟡 WARNING |
| Entertainment | BHD 100 | BHD 150 | 🔴 OVER |

**Action:** Reduce entertainment spending by BHD 50 to stay on track.

Example 2 - Spending Trends:
## Spending Trends

📈 Your spending is increasing:

- **Dining:** BHD 400 → BHD 450 (+12.5%)
- **Transport:** BHD 200 → BHD 220 (+10%)
- **Entertainment:** Stable at BHD 100

**Forecast:** Next month likely BHD 2,300 (+8% vs this month)

Example 3 - Key Recommendations:
## Recommendations

### Highest Impact Opportunity
Reduce dining by 20% → Save BHD 2,400/year

### Quick Wins
- Cancel unused subscriptions (estimated BHD 50-100/month)
- Use public transport 2x/week (save BHD 30/month)

---

**Summary:** Focus on dining and transportation for maximum savings impact.`

      const groqResponse = await callGroqAPI(systemPrompt, conversationHistoryForGroq)
      if (groqResponse) {
        setUsingGroq(true)
        return groqResponse
      }
    }

    // Fallback if Groq not configured
    return `I'm here to help with your finances, but I need the AI service to be configured. Try asking about your spending, savings, budget, or specific spending categories!`
  }


  // ============== UI HANDLERS ==============

  const handleSend = async () => {
    if (!input.trim() || loading) return

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)
    setUsingGroq(false)

    // Save user message to database
    await saveMessageToDatabase(userMsg)

    // Wait a moment for better UX, then generate response
    await new Promise(resolve => setTimeout(resolve, 300))

    const response = await generateResponse(userMsg.content)
    const assistantMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: response,
      timestamp: new Date(),
      isAI: usingGroq,
    }
    setMessages((prev) => [...prev, assistantMsg])

    // Save assistant message to database
    await saveMessageToDatabase(assistantMsg)

    setLoading(false)
  }

  const handleSuggestion = (question: string) => {
    setInput(question)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Enhanced markdown rendering with tables, headers, and better formatting
  const renderContent = (content: string) => {
    const lines = content.split('\n')
    const elements: JSX.Element[] = []
    let i = 0

    while (i < lines.length) {
      const line = lines[i]
      const trimmed = line.trim()

      // Handle section headers (##, ###)
      if (trimmed.startsWith('## ')) {
        elements.push(
          <div key={`header-${i}`} className="mt-4 mb-3">
            <h2 className="text-lg font-bold text-white">
              {renderLineContent(trimmed.substring(3))}
            </h2>
            <div className="h-1 bg-gradient-to-r from-primary-500 to-transparent rounded-full mt-2" />
          </div>
        )
        i++
        continue
      }

      if (trimmed.startsWith('### ')) {
        elements.push(
          <div key={`header3-${i}`} className="mt-3 mb-2">
            <h3 className="text-base font-bold text-primary-400">
              {renderLineContent(trimmed.substring(4))}
            </h3>
          </div>
        )
        i++
        continue
      }

      // Handle horizontal rules (---)
      if (trimmed === '---' || trimmed === '___' || trimmed === '***') {
        elements.push(
          <div key={`divider-${i}`} className="my-3 h-1 bg-slate-700 rounded-full" />
        )
        i++
        continue
      }

      // Handle code blocks (```...```)
      if (trimmed.startsWith('```')) {
        let codeContent = ''
        let codeLanguage = trimmed.substring(3).trim()
        i++
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeContent += lines[i] + '\n'
          i++
        }
        elements.push(
          <div
            key={`code-${i}`}
            className="my-3 bg-slate-800 border border-slate-700 rounded-lg p-3 overflow-x-auto"
          >
            {codeLanguage && (
              <div className="text-xs text-slate-400 mb-2">{codeLanguage}</div>
            )}
            <pre className="text-sm text-slate-200 font-mono whitespace-pre-wrap break-words">
              {codeContent.trim()}
            </pre>
          </div>
        )
        i++
        continue
      }

      // Handle table rows (lines with pipes and proper alignment)
      if (trimmed.includes('|')) {
        let tableLines = [trimmed]
        let j = i + 1

        // Collect all consecutive table rows
        while (j < lines.length && lines[j].trim().includes('|')) {
          tableLines.push(lines[j].trim())
          j++
        }

        // Check if this is a table (has separator row with dashes)
        const hasSeparator = tableLines.some(row =>
          row.split('|').every(cell => !cell.trim() || /^-+$/.test(cell.trim()))
        )

        if (hasSeparator && tableLines.length >= 3) {
          const rows = tableLines.map(row =>
            row.split('|').map(cell => cell.trim()).filter(cell => cell)
          )

          elements.push(
            <div key={`table-${i}`} className="my-3 overflow-x-auto">
              <div className="bg-slate-800 border border-slate-700 rounded-lg">
                {rows.map((row, rowIdx) => {
                  // Skip separator rows
                  if (row.every(cell => /^-+$/.test(cell))) return null

                  return (
                    <div
                      key={`row-${rowIdx}`}
                      className={`flex border-b border-slate-700 last:border-b-0 ${
                        rowIdx === 0 ? 'bg-slate-700/50 font-semibold' : ''
                      }`}
                    >
                      {row.map((cell, cellIdx) => (
                        <div
                          key={`cell-${cellIdx}`}
                          className={`flex-1 px-3 py-2 text-sm ${
                            rowIdx === 0 ? 'text-primary-300' : 'text-slate-200'
                          }`}
                        >
                          {renderLineContent(cell)}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          )
          i = j
          continue
        }
      }

      // Handle bullet points
      if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
        elements.push(
          <div key={`bullet-${i}`} className="ml-4 text-slate-200 flex items-start space-x-2">
            <span className="text-primary-400 flex-shrink-0 mt-1">•</span>
            <div>{renderLineContent(trimmed.substring(2))}</div>
          </div>
        )
        i++
        continue
      }

      // Handle numbered lists
      if (/^\d+\.\s/.test(trimmed)) {
        const match = trimmed.match(/^(\d+)\.\s(.*)/)
        elements.push(
          <div key={`number-${i}`} className="ml-4 text-slate-200 flex items-start space-x-2">
            <span className="text-primary-400 flex-shrink-0 font-semibold">{match?.[1]}.</span>
            <div>{renderLineContent(match?.[2] || '')}</div>
          </div>
        )
        i++
        continue
      }

      // Handle empty lines
      if (trimmed === '') {
        elements.push(<div key={`empty-${i}`} className="h-2" />)
        i++
        continue
      }

      // Handle regular lines
      elements.push(
        <div key={`line-${i}`} className="text-slate-200 leading-relaxed">
          {renderLineContent(trimmed)}
        </div>
      )
      i++
    }

    return elements
  }

  // Enhanced helper to render line content with bold, italic, code, and links
  const renderLineContent = (text: string) => {
    const parts: JSX.Element[] = []
    let lastIndex = 0

    // Handle **bold**, *italic*, and `code`
    const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
    let match

    while ((match = regex.exec(text)) !== null) {
      // Add text before match
      if (match.index > lastIndex) {
        parts.push(
          <span key={`text-${lastIndex}`}>
            {text.substring(lastIndex, match.index)}
          </span>
        )
      }

      // Add formatted match
      if (match[0].startsWith('**') && match[0].endsWith('**')) {
        parts.push(
          <strong key={`bold-${match.index}`} className="text-white font-semibold">
            {match[0].slice(2, -2)}
          </strong>
        )
      } else if (match[0].startsWith('*') && match[0].endsWith('*')) {
        parts.push(
          <em key={`italic-${match.index}`} className="text-slate-300 italic">
            {match[0].slice(1, -1)}
          </em>
        )
      } else if (match[0].startsWith('`') && match[0].endsWith('`')) {
        parts.push(
          <code
            key={`code-${match.index}`}
            className="bg-slate-800 text-primary-300 px-1.5 py-0.5 rounded text-xs font-mono"
          >
            {match[0].slice(1, -1)}
          </code>
        )
      }

      lastIndex = match.index + match[0].length
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(
        <span key={`text-${lastIndex}`}>
          {text.substring(lastIndex)}
        </span>
      )
    }

    return parts.length > 0 ? parts : <span>{text}</span>
  }

  return (
    <Layout>
      <div className="flex flex-col h-screen max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center space-x-3 mb-2">
            <div className="bg-gradient-to-br from-primary-500 to-primary-700 p-2 rounded-lg">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">FinAI</h1>
            </div>
          </div>
        </div>

        {/* Quick Stats Card - Phase 1 Enhanced (Improvement B) */}
        {dataLoaded && profile && (
          <div className="bg-gradient-to-r from-slate-800 to-slate-900 border border-slate-700 rounded-lg p-4 mb-4">
            <div className="grid grid-cols-3 gap-4">
              {/* Top Category with Comparison */}
              <div className="hover:bg-slate-700/30 p-2 rounded-md transition">
                <div className="text-xs text-slate-400 mb-1 font-medium">TOP CATEGORY</div>
                {getTopCategoryWithComparison() ? (
                  <div>
                    <div className="text-lg font-semibold text-white flex items-center justify-between mb-1">
                      <span>
                        {getTopCategoryWithComparison()!.category.icon} {getTopCategoryWithComparison()!.category.name}
                      </span>
                      {getTopCategoryWithComparison()!.trendDirection === 'up' && (
                        <span className="text-xs text-red-400 flex items-center space-x-0.5">
                          <TrendingUp className="w-3 h-3" />
                          {Math.abs(getTopCategoryWithComparison()!.changePercent).toFixed(0)}%
                        </span>
                      )}
                      {getTopCategoryWithComparison()!.trendDirection === 'down' && (
                        <span className="text-xs text-green-400 flex items-center space-x-0.5">
                          <TrendingDown className="w-3 h-3" />
                          {Math.abs(getTopCategoryWithComparison()!.changePercent).toFixed(0)}%
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-slate-300">
                      {formatCurrencyAmount(getTopCategoryWithComparison()!.amount)}
                    </div>
                    {getTopCategoryWithComparison()!.previousAmount > 0 && (
                      <div className="text-xs text-slate-500 mt-1">
                        vs {formatCurrencyAmount(getTopCategoryWithComparison()!.previousAmount)} last period
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-slate-500 text-sm">No spending</div>
                )}
              </div>

              {/* Budget Status */}
              <div className="hover:bg-slate-700/30 p-2 rounded-md transition">
                <div className="text-xs text-slate-400 mb-1 font-medium">BUDGET STATUS</div>
                <div className="mb-2">
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        calculateBudgetUsedPercent() > 100
                          ? 'bg-red-500'
                          : calculateBudgetUsedPercent() > 80
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(calculateBudgetUsedPercent(), 100)}%` }}
                    ></div>
                  </div>
                </div>
                <div className="text-sm font-semibold text-white">
                  {calculateBudgetUsedPercent().toFixed(0)}%
                </div>
                <div className={`text-xs mt-1 ${
                  calculateBudgetRemaining() < 0
                    ? 'text-red-400 font-medium'
                    : calculateBudgetRemaining() < profile.monthly_budget * 0.1
                    ? 'text-yellow-400'
                    : 'text-slate-400'
                }`}>
                  {calculateBudgetRemaining() >= 0
                    ? `${formatCurrencyAmount(calculateBudgetRemaining())} left`
                    : `${formatCurrencyAmount(Math.abs(calculateBudgetRemaining()))} over`}
                </div>
              </div>

              {/* Savings Rate with Status */}
              <div className="hover:bg-slate-700/30 p-2 rounded-md transition">
                <div className="text-xs text-slate-400 mb-1 font-medium">SAVINGS RATE</div>
                {(() => {
                  const earned = sumAmount(
                    getTransactionsInRange(
                      getCurrentPeriod().startDate,
                      getCurrentPeriod().endDate,
                      'income'
                    )
                  )
                  const spent = sumAmount(
                    getTransactionsInRange(
                      getCurrentPeriod().startDate,
                      getCurrentPeriod().endDate,
                      'expense'
                    )
                  )
                  const rate = calculateSavingsRate(earned, spent)
                  return (
                    <>
                      <div className={`text-lg font-semibold ${
                        rate >= 30
                          ? 'text-green-400'
                          : rate >= 20
                          ? 'text-emerald-400'
                          : rate >= 10
                          ? 'text-yellow-400'
                          : 'text-red-400'
                      }`}>
                        {rate.toFixed(1)}%
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        {earned > 0 ? formatCurrencyAmount(earned - spent) : 'No income'} saved
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Stats Bar */}
        {dataLoaded && profile && (
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 flex items-center space-x-2">
              <TrendingDown className="w-4 h-4 text-red-400" />
              <div>
                <div className="text-xs text-slate-400">Expenses (12mo)</div>
                <div className="text-sm font-semibold text-white">
                  {formatCurrencyAmount(
                    sumAmount(
                      transactions.filter(
                        (t) => getCategoryById(t.category_id)?.type === 'expense'
                      )
                    )
                  )}
                </div>
              </div>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-green-400" />
              <div>
                <div className="text-xs text-slate-400">Income (12mo)</div>
                <div className="text-sm font-semibold text-white">
                  {formatCurrencyAmount(
                    sumAmount(
                      transactions.filter(
                        (t) => getCategoryById(t.category_id)?.type === 'income'
                      )
                    )
                  )}
                </div>
              </div>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 flex items-center space-x-2">
              <Bot className="w-4 h-4 text-primary-400" />
              <div>
                <div className="text-xs text-slate-400">Transactions</div>
                <div className="text-sm font-semibold text-white">{transactions.length}</div>
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 bg-slate-900 border border-slate-800 rounded-lg overflow-y-auto p-4 mb-4">
          {messages.length === 0 && !dataLoaded && (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
            </div>
          )}

          <div className="space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`flex items-start space-x-2 max-w-[85%] ${
                    msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''
                  }`}
                >
                  <div
                    className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                      msg.role === 'user'
                        ? 'bg-primary-600'
                        : 'bg-gradient-to-br from-primary-500 to-primary-700'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <User className="w-4 h-4 text-white" />
                    ) : (
                      <Sparkles className="w-4 h-4 text-white" />
                    )}
                  </div>
                  <div className="flex flex-col">
                    <div
                      className={`rounded-lg px-4 py-3 text-sm ${
                        msg.role === 'user'
                          ? 'bg-primary-600 text-white'
                          : 'bg-slate-800 text-slate-200 border border-slate-700'
                      }`}
                    >
                      {renderContent(msg.content)}
                    </div>
                    {msg.role === 'assistant' && msg.isAI && (
                      <div className="text-xs text-slate-500 mt-1 ml-1">
                        ⚡ Powered by Groq AI
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="flex items-start space-x-2">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-3">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                      <div
                        className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                        style={{ animationDelay: '0.2s' }}
                      ></div>
                      <div
                        className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                        style={{ animationDelay: '0.4s' }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Suggested Questions */}
        {messages.length <= 1 && dataLoaded && (
          <div className="mb-4">
            <p className="text-xs text-slate-400 mb-2">Try asking:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSuggestion(q)}
                  className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 px-3 py-1.5 rounded-full transition"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="flex space-x-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Ask me about your finances..."
            disabled={!dataLoaded || loading}
            className="flex-1 px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-primary-500 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading || !dataLoaded}
            className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg transition flex items-center space-x-2"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Send</span>
          </button>
        </div>
      </div>
    </Layout>
  )
}
