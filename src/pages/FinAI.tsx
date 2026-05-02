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
  const [usingGroq, setUsingGroq] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY

  useEffect(() => {
    if (user) {
      loadUserData()
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


  // ============== GROQ API INTEGRATION ==============
  // All questions route through Groq AI for intelligent responses

  const callGroqAPI = async (prompt: string): Promise<string | null> => {
    if (!GROQ_API_KEY) {
      console.warn('Groq API key not configured')
      return null
    }

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: `You are a helpful financial assistant analyzing spending data. Be concise and friendly.
              Use these currency symbols correctly: BHD (Bahraini Dinar), USD ($), EUR (€), etc.
              Focus on actionable insights about the user's finances.`,
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
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

      const categoryBreakdown = getCategoryBreakdown(currentExpenses)
      const topCategoryText = categoryBreakdown.length > 0
        ? `${categoryBreakdown[0].category.name}: ${formatCurrency(categoryBreakdown[0].amount, profile.currency)}`
        : 'No spending yet'

      const allTimeExpenses = getTransactionsInRange('1900-01-01', '2100-01-01', 'expense')
      const allTimeSpent = sumAmount(allTimeExpenses)

      const financialContext = `
User's Financial Summary:
- Currency: ${profile.currency}
- Monthly Budget: ${formatCurrency(profile.monthly_budget, profile.currency)}
- This Month Spent: ${formatCurrency(currentSpent, profile.currency)} (${currentExpenses.length} transactions)
- This Month Earned: ${formatCurrency(currentEarned, profile.currency)}
- Last Month Spent: ${formatCurrency(previousSpent, profile.currency)}
- All-Time Spent: ${formatCurrency(allTimeSpent, profile.currency)}
- Top Category This Month: ${topCategoryText}
- Total Transactions: ${transactions.length}
- Categories: ${categories.filter(c => c.type === 'expense').map(c => c.name).join(', ')}`

      const groqPrompt = `You are a helpful personal finance assistant. Answer the user's question about their finances based on their data.

${financialContext}

User's Question: "${userMessage}"

Provide a helpful, concise, and friendly response. Use the currency symbol (${profile.currency === 'USD' ? '$' : profile.currency === 'EUR' ? '€' : profile.currency === 'BHD' ? 'BD' : profile.currency}) when mentioning amounts. Give actionable insights when relevant.`

      const groqResponse = await callGroqAPI(groqPrompt)
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
