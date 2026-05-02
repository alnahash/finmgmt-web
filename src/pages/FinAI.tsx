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
  full_name: string
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
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (user) {
      loadUserData()
    }
  }, [user])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const loadUserData = async () => {
    if (!user) return

    try {
      // Fetch profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name, currency, monthly_budget, month_start_day')
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

      // Add welcome message
      const welcomeName = profileData?.full_name?.split(' ')[0] || 'there'
      setMessages([
        {
          id: '1',
          role: 'assistant',
          content: `Hello ${welcomeName}! 👋 I'm FinAI, your personal finance assistant. I can analyze your spending, savings, categories, and trends. Ask me anything about your finances!`,
          timestamp: new Date(),
        },
      ])
    } catch (error) {
      console.error('Error loading data:', error)
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

  // ============== PERIOD PARSING ==============

  const MONTH_NAMES = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
  ]

  const MONTH_ABBREV = [
    'jan', 'feb', 'mar', 'apr', 'may', 'jun',
    'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
  ]

  const parseMonthAndYear = (text: string): { month: number; year: number } | null => {
    const lower = text.toLowerCase()

    // Try to find month abbreviation first (Jan, Feb, Mar, etc.)
    let monthIndex = -1
    for (let i = 0; i < MONTH_ABBREV.length; i++) {
      if (lower.includes(MONTH_ABBREV[i])) {
        monthIndex = i
        break
      }
    }

    // If no abbreviation found, try full month names
    if (monthIndex === -1) {
      for (let i = 0; i < MONTH_NAMES.length; i++) {
        if (lower.includes(MONTH_NAMES[i])) {
          monthIndex = i
          break
        }
      }
    }

    if (monthIndex === -1) return null

    // Try to find year (4-digit number starting with 20)
    const yearMatch = text.match(/\b(202[0-9])\b/)
    const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear()

    return { month: monthIndex + 1, year }
  }

  const getPeriodForMonthYear = (month: number, year: number): { startDate: string; endDate: string; label: string } => {
    if (!profile) return { startDate: '', endDate: '', label: '' }

    // Create a date in the specified month
    const dateInMonth = new Date(year, month - 1, 15) // 15th of the month
    const dateStr = dateInMonth.toISOString().split('T')[0]
    const periodKey = getMonthPeriodKey(dateStr, profile.month_start_day)
    const { startDate, endDate } = getPeriodDateRange(periodKey)

    const monthName = MONTH_NAMES[month - 1].charAt(0).toUpperCase() + MONTH_NAMES[month - 1].slice(1)
    return { startDate, endDate, label: `${monthName} ${year}` }
  }

  // ============== INTENT DETECTION ==============

  const detectIntent = (text: string): string => {
    const lower = text.toLowerCase()

    // Check for specific month/year first
    if (parseMonthAndYear(text)) {
      // If there's a month/year, check what they're asking about
      if (/biggest|top|highest|most.*spend|most.*expensive|where.*money/.test(lower)) {
        return 'top_categories_specific_month'
      }
      if (/spent|spend|spending|expense|expenses|cost|paid/.test(lower)) {
        return 'total_spent_specific_month'
      }
      if (/save|saving|saved|net|income.*expense/.test(lower)) {
        return 'savings_specific_month'
      }
      return 'total_spent_specific_month' // default for specific month
    }

    // Greeting
    if (/^(hi|hello|hey|greetings|good (morning|afternoon|evening))\b/.test(lower)) {
      return 'greeting'
    }

    // Help
    if (/help|what can you|what.*ask|examples|guide/.test(lower)) {
      return 'help'
    }

    // Budget
    if (/budget|remaining|left.*budget|budget.*left/.test(lower)) {
      return 'budget'
    }

    // Savings / Income vs expense
    if (/save|saving|saved|net|income.*expense|profit/.test(lower)) {
      return 'savings'
    }

    // Income only
    if (/income|earned|earn|made|salary|received/.test(lower) && !/expense/.test(lower)) {
      return 'income'
    }

    // Comparison
    if (/compare|vs|versus|difference|diff.*month|change/.test(lower)) {
      return 'compare'
    }

    // Top category
    if (/top|biggest|highest|most.*spend|most.*expensive|where.*money/.test(lower)) {
      return 'top_categories'
    }

    // Specific category
    const matchedCategory = findCategoryInText(text)
    if (matchedCategory) {
      return 'category_specific'
    }

    // Recent transactions
    if (/recent|latest|last.*transaction|history|past.*spend/.test(lower)) {
      return 'recent'
    }

    // Average
    if (/average|avg|mean|typical|per.*day|per.*transaction/.test(lower)) {
      return 'average'
    }

    // Trend
    if (/trend|over time|monthly|how.*changing|going up|going down|increase|decrease/.test(lower)) {
      return 'trend'
    }

    // Total spent
    if (/spent|spend|spending|expense|expenses|cost|paid/.test(lower)) {
      return 'total_spent'
    }

    // Count
    if (/how many|count|number of/.test(lower)) {
      return 'count'
    }

    // Categories list
    if (/categor(y|ies)|list.*categor/.test(lower)) {
      return 'list_categories'
    }

    return 'unknown'
  }

  const findCategoryInText = (text: string): Category | null => {
    const lower = text.toLowerCase()
    // Match against category names
    for (const cat of categories) {
      if (lower.includes(cat.name.toLowerCase())) {
        return cat
      }
    }
    return null
  }

  const detectPeriod = (text: string): 'current' | 'previous' | 'all' => {
    const lower = text.toLowerCase()
    if (/last month|previous month|past month/.test(lower)) return 'previous'
    if (/all time|total|overall|ever|year/.test(lower)) return 'all'
    return 'current'
  }

  // ============== RESPONSE GENERATION ==============

  const generateResponse = (userMessage: string): string => {
    if (!profile || !dataLoaded) {
      return 'I am still loading your data. Please give me a moment...'
    }

    if (transactions.length === 0) {
      return "I don't see any transactions yet. Start adding some on the Transactions page, then come back to ask me about them!"
    }

    const intent = detectIntent(userMessage)
    const period = detectPeriod(userMessage)

    const { startDate, endDate, label } =
      period === 'previous'
        ? getPreviousPeriod()
        : period === 'all'
        ? { startDate: '1900-01-01', endDate: '2100-01-01', label: 'all time' }
        : getCurrentPeriod()

    switch (intent) {
      case 'top_categories_specific_month': {
        const parsed = parseMonthAndYear(userMessage)
        if (parsed) {
          const { startDate, endDate, label } = getPeriodForMonthYear(parsed.month, parsed.year)
          return generateTopCategoriesResponse(startDate, endDate, label)
        }
        return 'Could not parse the month/year. Try "March 2025" or "April 2024".'
      }

      case 'total_spent_specific_month': {
        const parsed = parseMonthAndYear(userMessage)
        if (parsed) {
          const { startDate, endDate, label } = getPeriodForMonthYear(parsed.month, parsed.year)
          return generateTotalSpentResponse(startDate, endDate, label)
        }
        return 'Could not parse the month/year. Try "March 2025" or "April 2024".'
      }

      case 'savings_specific_month': {
        const parsed = parseMonthAndYear(userMessage)
        if (parsed) {
          const { startDate, endDate, label } = getPeriodForMonthYear(parsed.month, parsed.year)
          return generateSavingsResponse(startDate, endDate, label)
        }
        return 'Could not parse the month/year. Try "March 2025" or "April 2024".'
      }

      case 'greeting':
        return `Hello! 😊 I'm here to help you understand your finances. Try asking me about your spending, savings, or specific categories.`

      case 'help':
        return `I can help you with:\n\n💰 **Spending**: "How much did I spend this month?"\n📊 **Categories**: "What's my top spending category?"\n💵 **Savings**: "How much did I save this month?"\n📈 **Comparison**: "Compare this month to last month"\n🎯 **Budget**: "What's my budget status?"\n📋 **History**: "Show me recent transactions"\n📉 **Trends**: "How is my spending trending?"\n\nJust ask in plain English!`

      case 'budget':
        return generateBudgetResponse()

      case 'savings':
        return generateSavingsResponse(startDate, endDate, label)

      case 'income':
        return generateIncomeResponse(startDate, endDate, label)

      case 'compare':
        return generateCompareResponse()

      case 'top_categories':
        return generateTopCategoriesResponse(startDate, endDate, label)

      case 'category_specific': {
        const cat = findCategoryInText(userMessage)
        if (cat) return generateCategoryResponse(cat, startDate, endDate, label)
        return 'I could not find that category. Try asking about one of your existing categories.'
      }

      case 'recent':
        return generateRecentTransactionsResponse()

      case 'average':
        return generateAverageResponse(startDate, endDate, label)

      case 'trend':
        return generateTrendResponse()

      case 'total_spent':
        return generateTotalSpentResponse(startDate, endDate, label)

      case 'count':
        return generateCountResponse(startDate, endDate, label)

      case 'list_categories':
        return generateCategoryListResponse()

      default:
        return `I'm not sure I understood that. 🤔 Try asking me about:\n\n• Your spending this month\n• Top spending categories\n• How much you saved\n• Budget status\n• A specific category like "Food & Dining"\n\nOr type "help" to see all I can do!`
    }
  }

  // ============== RESPONSE BUILDERS ==============

  const generateTotalSpentResponse = (
    startDate: string,
    endDate: string,
    label: string
  ): string => {
    const expenses = getTransactionsInRange(startDate, endDate, 'expense')
    const total = sumAmount(expenses)

    if (total === 0) {
      return `You haven't recorded any expenses ${label} yet. 📝`
    }

    const breakdown = getCategoryBreakdown(expenses)
    const topCat = breakdown[0]

    let response = `You've spent **${formatCurrencyAmount(total)}** ${label} across ${expenses.length} transactions.`

    if (topCat) {
      const pct = ((topCat.amount / total) * 100).toFixed(1)
      response += `\n\n🏆 Top category: ${topCat.category.icon} **${topCat.category.name}** at ${formatCurrencyAmount(topCat.amount)} (${pct}%)`
    }

    return response
  }

  const generateBudgetResponse = (): string => {
    if (!profile?.monthly_budget || profile.monthly_budget === 0) {
      return `You haven't set a monthly budget yet. Head to Settings to set one and I'll track it for you! 🎯`
    }

    const { startDate, endDate } = getCurrentPeriod()
    const expenses = getTransactionsInRange(startDate, endDate, 'expense')
    const totalSpent = sumAmount(expenses)
    const remaining = profile.monthly_budget - totalSpent
    const pctUsed = (totalSpent / profile.monthly_budget) * 100

    let status = '✅ On track'
    let emoji = '🎯'
    if (pctUsed >= 100) {
      status = '⚠️ Over budget'
      emoji = '🚨'
    } else if (pctUsed >= 80) {
      status = '⚡ Approaching limit'
      emoji = '⚠️'
    }

    return `${emoji} **Budget Status**\n\n• Budget: ${formatCurrencyAmount(profile.monthly_budget)}\n• Spent: ${formatCurrencyAmount(totalSpent)} (${pctUsed.toFixed(1)}%)\n• Remaining: ${formatCurrencyAmount(remaining)}\n\nStatus: ${status}`
  }

  const generateSavingsResponse = (
    startDate: string,
    endDate: string,
    label: string
  ): string => {
    const income = sumAmount(getTransactionsInRange(startDate, endDate, 'income'))
    const expenses = sumAmount(getTransactionsInRange(startDate, endDate, 'expense'))
    const savings = income - expenses

    if (income === 0 && expenses === 0) {
      return `No transactions found ${label}. 📭`
    }

    const savingsRate = income > 0 ? ((savings / income) * 100).toFixed(1) : '0'
    const trend = savings >= 0 ? '📈' : '📉'

    return `${trend} **Savings ${label.charAt(0).toUpperCase() + label.slice(1)}**\n\n• Income: ${formatCurrencyAmount(income)}\n• Expenses: ${formatCurrencyAmount(expenses)}\n• **${savings >= 0 ? 'Saved' : 'Overspent'}: ${formatCurrencyAmount(Math.abs(savings))}**\n${income > 0 ? `\nSavings rate: ${savingsRate}%` : ''}`
  }

  const generateIncomeResponse = (
    startDate: string,
    endDate: string,
    label: string
  ): string => {
    const incomeTxns = getTransactionsInRange(startDate, endDate, 'income')
    const total = sumAmount(incomeTxns)

    if (total === 0) {
      return `No income recorded ${label}. 💼`
    }

    const breakdown = getCategoryBreakdown(incomeTxns)
    let response = `💰 You earned **${formatCurrencyAmount(total)}** ${label} from ${incomeTxns.length} sources.`

    if (breakdown.length > 0) {
      response += `\n\n**Breakdown:**`
      breakdown.slice(0, 3).forEach((b) => {
        response += `\n${b.category.icon} ${b.category.name}: ${formatCurrencyAmount(b.amount)}`
      })
    }

    return response
  }

  const generateCompareResponse = (): string => {
    const current = getCurrentPeriod()
    const previous = getPreviousPeriod()

    const currentExpenses = sumAmount(
      getTransactionsInRange(current.startDate, current.endDate, 'expense')
    )
    const previousExpenses = sumAmount(
      getTransactionsInRange(previous.startDate, previous.endDate, 'expense')
    )

    if (currentExpenses === 0 && previousExpenses === 0) {
      return `No data to compare. Add some transactions first! 📊`
    }

    const diff = currentExpenses - previousExpenses
    const pctChange =
      previousExpenses > 0 ? ((diff / previousExpenses) * 100).toFixed(1) : 'N/A'
    const direction = diff > 0 ? '⬆️ increased' : diff < 0 ? '⬇️ decreased' : '➡️ unchanged'
    const color = diff > 0 ? '🔴' : '🟢'

    let response = `📊 **Month Comparison**\n\n• Last month: ${formatCurrencyAmount(previousExpenses)}\n• This month: ${formatCurrencyAmount(currentExpenses)}\n• Difference: ${color} ${formatCurrencyAmount(Math.abs(diff))} ${direction}`

    if (typeof pctChange === 'string' && pctChange !== 'N/A') {
      response += ` (${pctChange}%)`
    }

    if (diff > 0) {
      response += `\n\n💡 You're spending more this month. Consider reviewing your top categories.`
    } else if (diff < 0) {
      response += `\n\n🎉 Great job reducing spending compared to last month!`
    }

    return response
  }

  const generateTopCategoriesResponse = (
    startDate: string,
    endDate: string,
    label: string
  ): string => {
    const expenses = getTransactionsInRange(startDate, endDate, 'expense')
    const breakdown = getCategoryBreakdown(expenses)
    const total = sumAmount(expenses)

    if (breakdown.length === 0) {
      return `No expense data for ${label}. 📭`
    }

    let response = `🏆 **Top Spending Categories ${label.charAt(0).toUpperCase() + label.slice(1)}**\n\n`
    breakdown.slice(0, 5).forEach((b, i) => {
      const pct = ((b.amount / total) * 100).toFixed(1)
      const emoji = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
      response += `${emoji} ${b.category.icon} **${b.category.name}**: ${formatCurrencyAmount(b.amount)} (${pct}%)\n`
    })

    response += `\nTotal: ${formatCurrencyAmount(total)}`
    return response
  }

  const generateCategoryResponse = (
    category: Category,
    startDate: string,
    endDate: string,
    label: string
  ): string => {
    const catTxns = getTransactionsInRange(startDate, endDate).filter(
      (t) => t.category_id === category.id
    )
    const total = sumAmount(catTxns)

    if (total === 0) {
      return `No ${category.icon} **${category.name}** transactions ${label}. 📭`
    }

    const avg = total / catTxns.length

    // Compare to last period
    const previous = getPreviousPeriod()
    const prevTxns = getTransactionsInRange(previous.startDate, previous.endDate).filter(
      (t) => t.category_id === category.id
    )
    const prevTotal = sumAmount(prevTxns)

    let response = `${category.icon} **${category.name}** ${label}\n\n• Total: ${formatCurrencyAmount(total)}\n• Transactions: ${catTxns.length}\n• Average: ${formatCurrencyAmount(avg)}`

    if (prevTotal > 0 && label !== 'last month') {
      const diff = total - prevTotal
      const pctChange = ((diff / prevTotal) * 100).toFixed(1)
      const trend = diff > 0 ? `⬆️ up ${pctChange}%` : diff < 0 ? `⬇️ down ${Math.abs(parseFloat(pctChange))}%` : '➡️ unchanged'
      response += `\n• vs last month: ${trend} (${formatCurrencyAmount(prevTotal)})`
    }

    return response
  }

  const generateRecentTransactionsResponse = (): string => {
    const recent = transactions.slice(0, 5)
    if (recent.length === 0) {
      return `No transactions found. Start by adding some! 📝`
    }

    let response = `📋 **Recent Transactions**\n\n`
    recent.forEach((t) => {
      const cat = getCategoryById(t.category_id)
      const icon = cat?.icon || '💰'
      const sign = cat?.type === 'income' ? '+' : '-'
      const date = new Date(t.transaction_date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
      response += `${icon} ${date}: ${sign}${formatCurrencyAmount(Number(t.amount))}`
      if (t.description) response += ` (${t.description})`
      response += `\n`
    })

    return response
  }

  const generateAverageResponse = (
    startDate: string,
    endDate: string,
    label: string
  ): string => {
    const expenses = getTransactionsInRange(startDate, endDate, 'expense')
    if (expenses.length === 0) {
      return `No expenses ${label} to calculate averages. 📊`
    }

    const total = sumAmount(expenses)
    const avgPerTransaction = total / expenses.length

    // Days in period
    const start = new Date(startDate)
    const end = new Date(endDate)
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    const avgPerDay = total / days

    // Unique days with transactions
    const uniqueDays = new Set(expenses.map((t) => t.transaction_date)).size

    return `📊 **Spending Averages ${label}**\n\n• Per transaction: ${formatCurrencyAmount(avgPerTransaction)}\n• Per day: ${formatCurrencyAmount(avgPerDay)}\n• Active spending days: ${uniqueDays} / ${days}\n• Total: ${formatCurrencyAmount(total)}`
  }

  const generateTrendResponse = (): string => {
    if (!profile) return 'Loading...'

    // Get last 6 months
    const monthlyTotals: { label: string; amount: number; key: string }[] = []
    const today = new Date()

    for (let i = 5; i >= 0; i--) {
      const date = new Date(today)
      date.setMonth(date.getMonth() - i)
      const dateStr = date.toISOString().split('T')[0]
      const periodKey = getMonthPeriodKey(dateStr, profile.month_start_day)
      const { startDate, endDate } = getPeriodDateRange(periodKey)
      const expenses = sumAmount(getTransactionsInRange(startDate, endDate, 'expense'))
      const monthLabel = date.toLocaleDateString('en-US', { month: 'short' })
      monthlyTotals.push({ label: monthLabel, amount: expenses, key: periodKey })
    }

    const nonZero = monthlyTotals.filter((m) => m.amount > 0)
    if (nonZero.length === 0) {
      return `Not enough data to show trends. Keep tracking! 📈`
    }

    let response = `📈 **6-Month Spending Trend**\n\n`
    monthlyTotals.forEach((m, i) => {
      const prev = i > 0 ? monthlyTotals[i - 1].amount : 0
      const trend = i === 0 ? '' : m.amount > prev ? ' ⬆️' : m.amount < prev ? ' ⬇️' : ' ➡️'
      response += `${m.label}: ${formatCurrencyAmount(m.amount)}${trend}\n`
    })

    // Overall trend
    const firstNonZero = nonZero[0].amount
    const lastNonZero = nonZero[nonZero.length - 1].amount
    if (nonZero.length > 1) {
      const overallChange = ((lastNonZero - firstNonZero) / firstNonZero) * 100
      const trendDirection = overallChange > 5 ? 'increasing 📈' : overallChange < -5 ? 'decreasing 📉' : 'stable ➡️'
      response += `\n💡 Overall trend: **${trendDirection}**`
    }

    return response
  }

  const generateCountResponse = (
    startDate: string,
    endDate: string,
    label: string
  ): string => {
    const txns = getTransactionsInRange(startDate, endDate)
    const expenses = txns.filter((t) => getCategoryById(t.category_id)?.type === 'expense')
    const incomes = txns.filter((t) => getCategoryById(t.category_id)?.type === 'income')

    return `📊 **Transaction Count ${label}**\n\n• Total: ${txns.length}\n• Expenses: ${expenses.length}\n• Income: ${incomes.length}`
  }

  const generateCategoryListResponse = (): string => {
    const expenseCats = categories.filter((c) => c.type === 'expense' && !c.parent_id)
    const incomeCats = categories.filter((c) => c.type === 'income' && !c.parent_id)

    let response = `📂 **Your Categories**\n\n`
    if (expenseCats.length > 0) {
      response += `**Expense Categories (${expenseCats.length}):**\n`
      expenseCats.forEach((c) => (response += `${c.icon} ${c.name}\n`))
    }
    if (incomeCats.length > 0) {
      response += `\n**Income Categories (${incomeCats.length}):**\n`
      incomeCats.forEach((c) => (response += `${c.icon} ${c.name}\n`))
    }
    return response
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

    // Simulate thinking delay for better UX
    setTimeout(() => {
      const response = generateResponse(userMsg.content)
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, assistantMsg])
      setLoading(false)
    }, 600)
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

  // Render message content with basic markdown (bold)
  const renderContent = (content: string) => {
    const lines = content.split('\n')
    return lines.map((line, i) => {
      const parts = line.split(/(\*\*[^*]+\*\*)/g)
      return (
        <div key={i} className={line.trim() === '' ? 'h-2' : ''}>
          {parts.map((part, j) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return (
                <strong key={j} className="text-white font-semibold">
                  {part.slice(2, -2)}
                </strong>
              )
            }
            return <span key={j}>{part}</span>
          })}
        </div>
      )
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
              <p className="text-sm text-slate-400">
                Your personal finance assistant • No external APIs • 100% private
              </p>
            </div>
          </div>
        </div>

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
                  <div
                    className={`rounded-lg px-4 py-3 text-sm ${
                      msg.role === 'user'
                        ? 'bg-primary-600 text-white'
                        : 'bg-slate-800 text-slate-200 border border-slate-700'
                    }`}
                  >
                    {renderContent(msg.content)}
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
