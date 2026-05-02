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

    // Detect unusually large transactions (>2 std devs from mean)
    spendingByCategory.forEach((amounts, categoryId) => {
      if (amounts.length < 2) return

      const avg = amounts.reduce((a, b) => a + b) / amounts.length
      const stdDev = Math.sqrt(amounts.reduce((sum, val) => sum + Math.pow(val - avg, 2)) / amounts.length)
      const threshold = avg + stdDev * 2

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
- Budget Used: ${budgetUsedPercent.toFixed(1)}% (${formatCurrency(budgetRemaining, profile.currency)} remaining)

Current Period (This Month):
- Earned: ${formatCurrency(currentEarned, profile.currency)}
- Spent: ${formatCurrency(currentSpent, profile.currency)}
- Saved: ${formatCurrency(currentEarned - currentSpent, profile.currency)}
- Savings Rate: ${savingsRate.toFixed(1)}%
- Expense Ratio: ${expenseRatio.toFixed(1)}%
- Transactions: ${currentExpenses.length} expense(s), ${currentIncome.length} income

Previous Period (Last Month):
- Spent: ${formatCurrency(previousSpent, profile.currency)}
- Change: ${previousSpent > 0 ? ((currentSpent - previousSpent) / previousSpent * 100).toFixed(1) : 0}%

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

Anomaly Alerts:
${anomalyText}

${scenario.isScenario ? `Scenario Impact Analysis:\n${scenarioImpactText}\n` : ''}

Overall:
- All-Time Spent: ${formatCurrency(allTimeSpent, profile.currency)}
- Total Transactions: ${transactions.length}
- Expense Categories: ${categories.filter(c => c.type === 'expense').map(c => c.name).join(', ')}`

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

ANOMALY DETECTION:
- Review Anomaly Alerts section for unusual spending patterns
- Warn about large transactions (unusually high for that category)
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

RESPONSE FORMATTING:
- Be concise and friendly
- Use currency symbols correctly: BHD (Bahraini Dinar), USD ($), EUR (€), etc.
- Format spending lists as tables with emoji icons:
  🍽️  Dining:        BHD 450.00 (↑15%)
  🚗 Transport:     BHD 320.00 (→ same)
  🎬 Entertainment: BHD 200.00 (↓5%)
- Use ↑ for increases, ↓ for decreases, → for no change
- Include confidence levels for predictions: "Based on X months of data, I'm 85% confident that..."
- Use bullet points for lists
- Highlight key insights and actionable recommendations
- Use 🔴 🟡 🟢 emojis for budget status indicators`

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

  // Render message content with enhanced markdown (bold, lists, tables, emojis)
  const renderContent = (content: string) => {
    const lines = content.split('\n')
    return lines.map((line, i) => {
      const trimmed = line.trim()

      // Handle bullet points
      if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
        return (
          <div key={i} className="ml-4 text-slate-200">
            <span className="text-primary-400">•</span> {renderLineContent(trimmed.substring(2))}
          </div>
        )
      }

      // Handle numbered lists
      if (/^\d+\.\s/.test(trimmed)) {
        const content = trimmed.replace(/^\d+\.\s/, '')
        return (
          <div key={i} className="ml-4 text-slate-200">
            {renderLineContent(content)}
          </div>
        )
      }

      // Handle empty lines
      if (trimmed === '') {
        return <div key={i} className="h-2" />
      }

      // Handle regular lines with bold and formatting
      return (
        <div key={i} className="text-slate-200">
          {renderLineContent(trimmed)}
        </div>
      )
    })
  }

  // Helper to render line content with bold text, links, and preserved emojis
  const renderLineContent = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g)
    return parts.map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={j} className="text-white font-semibold">
            {part.slice(2, -2)}
          </strong>
        )
      }
      // Preserve emojis and numbers in currency formatting
      return <span key={j}>{part}</span>
    })
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

        {/* Quick Stats Card - Phase 1 */}
        {dataLoaded && profile && (
          <div className="bg-gradient-to-r from-slate-800 to-slate-900 border border-slate-700 rounded-lg p-4 mb-4">
            <div className="grid grid-cols-3 gap-4">
              {/* Top Category */}
              <div>
                <div className="text-xs text-slate-400 mb-1">Top Category</div>
                {getTopCategoryThisMonth() ? (
                  <div>
                    <div className="text-lg font-semibold text-white">
                      {getTopCategoryThisMonth()!.category.icon} {getTopCategoryThisMonth()!.category.name}
                    </div>
                    <div className="text-sm text-slate-300">
                      {formatCurrencyAmount(getTopCategoryThisMonth()!.amount)}
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-500">No spending</div>
                )}
              </div>

              {/* Budget Status */}
              <div>
                <div className="text-xs text-slate-400 mb-1">Budget Status</div>
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
                <div className="text-sm text-white">
                  {calculateBudgetUsedPercent().toFixed(0)}% • {formatCurrencyAmount(calculateBudgetRemaining())} left
                </div>
              </div>

              {/* Savings Rate */}
              <div>
                <div className="text-xs text-slate-400 mb-1">Savings Rate</div>
                <div className="text-lg font-semibold text-green-400">
                  {calculateSavingsRate(
                    sumAmount(
                      getTransactionsInRange(
                        getCurrentPeriod().startDate,
                        getCurrentPeriod().endDate,
                        'income'
                      )
                    ),
                    sumAmount(
                      getTransactionsInRange(
                        getCurrentPeriod().startDate,
                        getCurrentPeriod().endDate,
                        'expense'
                      )
                    )
                  ).toFixed(1)}%
                </div>
                <div className="text-xs text-slate-400">of income saved</div>
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
