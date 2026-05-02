import { useContext, useEffect, useState } from 'react'
import { AuthContext } from '../App'
import { supabase } from '../lib/supabase'
import Layout from '../components/Layout'
import {
  Lightbulb,
  Sparkles,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Target,
  Zap,
  PiggyBank,
  RefreshCw,
  Loader2,
  Brain,
  DollarSign,
  Calendar,
} from 'lucide-react'
import { formatCurrency, getMonthPeriodKey, getPeriodDateRange } from '../lib/utils'

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
  id: string
  full_name: string | null
  email: string | null
  currency: string
  monthly_budget: number
  month_start_day: number
}

interface MonthlyData {
  periodKey: string
  label: string
  expenses: number
  income: number
  byCategory: Map<string, number>
}

interface CategoryAnalysis {
  category: Category
  totalAmount: number
  transactionCount: number
  avgPerTransaction: number
  percentOfTotal: number
  monthlyAvg: number
  growthPct: number
  recentMonth: number
  previousMonth: number
}

interface InsightSection {
  title: string
  icon: typeof Lightbulb
  color: string
  content: string
}

export default function Insights() {
  const { user } = useContext(AuthContext)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [dataLoaded, setDataLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [insights, setInsights] = useState<InsightSection[] | null>(null)
  const [lastGenerated, setLastGenerated] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY

  useEffect(() => {
    if (user) loadUserData()
  }, [user])

  const loadUserData = async () => {
    if (!user) return

    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, full_name, email, currency, monthly_budget, month_start_day')
        .eq('id', user.id)
        .single()

      if (profileData) setProfile(profileData)

      const { data: catData } = await supabase
        .from('categories')
        .select('id, name, icon, color, type, parent_id')
        .eq('user_id', user.id)

      if (catData) setCategories(catData)

      const sixMonthsAgo = new Date()
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
      const startDate = sixMonthsAgo.toISOString().split('T')[0]

      const { data: txData } = await supabase
        .from('transactions')
        .select('id, amount, description, transaction_date, category_id')
        .eq('user_id', user.id)
        .gte('transaction_date', startDate)
        .order('transaction_date', { ascending: false })

      if (txData) setTransactions(txData)
      setDataLoaded(true)
    } catch (err) {
      console.error('Error loading data:', err)
      setError('Failed to load financial data')
    }
  }

  // ============== ANALYSIS ENGINE ==============

  const getCategoryById = (id: string) => categories.find((c) => c.id === id)

  /**
   * Get monthly breakdown for last 6 months
   */
  const getMonthlyBreakdown = (): MonthlyData[] => {
    if (!profile) return []

    const months: MonthlyData[] = []
    const today = new Date()

    for (let i = 5; i >= 0; i--) {
      const date = new Date(today)
      date.setMonth(date.getMonth() - i)
      const dateStr = date.toISOString().split('T')[0]
      const periodKey = getMonthPeriodKey(dateStr, profile.month_start_day)
      const { startDate, endDate } = getPeriodDateRange(periodKey)

      const byCategory = new Map<string, number>()
      let expenses = 0
      let income = 0

      transactions.forEach((t) => {
        if (t.transaction_date >= startDate && t.transaction_date <= endDate) {
          const cat = getCategoryById(t.category_id)
          if (!cat) return
          const amt = Number(t.amount)
          if (cat.type === 'expense') {
            expenses += amt
            byCategory.set(t.category_id, (byCategory.get(t.category_id) || 0) + amt)
          } else {
            income += amt
          }
        }
      })

      const monthName = date.toLocaleString('default', { month: 'short', year: 'numeric' })
      months.push({ periodKey, label: monthName, expenses, income, byCategory })
    }

    return months
  }

  /**
   * Analyze top spending categories with trends
   */
  const analyzeCategories = (monthlyData: MonthlyData[]): CategoryAnalysis[] => {
    const categoryTotals = new Map<string, { total: number; count: number }>()
    const totalExpenses = monthlyData.reduce((sum, m) => sum + m.expenses, 0)

    transactions.forEach((t) => {
      const cat = getCategoryById(t.category_id)
      if (!cat || cat.type !== 'expense') return
      const existing = categoryTotals.get(t.category_id) || { total: 0, count: 0 }
      categoryTotals.set(t.category_id, {
        total: existing.total + Number(t.amount),
        count: existing.count + 1,
      })
    })

    const recentMonth = monthlyData[monthlyData.length - 1]
    const previousMonth = monthlyData[monthlyData.length - 2]

    const analysis: CategoryAnalysis[] = []
    categoryTotals.forEach((value, catId) => {
      const cat = getCategoryById(catId)
      if (!cat) return

      const recentAmount = recentMonth?.byCategory.get(catId) || 0
      const previousAmount = previousMonth?.byCategory.get(catId) || 0
      const growthPct =
        previousAmount > 0 ? ((recentAmount - previousAmount) / previousAmount) * 100 : 0

      analysis.push({
        category: cat,
        totalAmount: value.total,
        transactionCount: value.count,
        avgPerTransaction: value.total / value.count,
        percentOfTotal: totalExpenses > 0 ? (value.total / totalExpenses) * 100 : 0,
        monthlyAvg: value.total / Math.max(monthlyData.length, 1),
        growthPct,
        recentMonth: recentAmount,
        previousMonth: previousAmount,
      })
    })

    return analysis.sort((a, b) => b.totalAmount - a.totalAmount)
  }

  /**
   * Find categories with many small transactions (death by 1000 cuts)
   */
  const findFrequentSmallSpending = (catAnalysis: CategoryAnalysis[]) => {
    return catAnalysis
      .filter((c) => c.transactionCount >= 5 && c.avgPerTransaction < 20)
      .slice(0, 5)
  }

  /**
   * Build comprehensive analysis brief
   */
  const buildAnalysisBrief = () => {
    if (!profile) return null

    const monthlyData = getMonthlyBreakdown()
    const catAnalysis = analyzeCategories(monthlyData)

    const totalExpenses = monthlyData.reduce((sum, m) => sum + m.expenses, 0)
    const totalIncome = monthlyData.reduce((sum, m) => sum + m.income, 0)
    const savings = totalIncome - totalExpenses
    const savingsRate = totalIncome > 0 ? (savings / totalIncome) * 100 : 0

    const topCategories = catAnalysis.slice(0, 5)
    const growthCategories = catAnalysis
      .filter((c) => c.growthPct > 20 && c.recentMonth > 10)
      .slice(0, 5)
    const frequentSmall = findFrequentSmallSpending(catAnalysis)

    const monthsWithData = monthlyData.filter((m) => m.expenses > 0 || m.income > 0).length

    return {
      profile,
      monthsAnalyzed: monthsWithData,
      totalIncome,
      totalExpenses,
      savings,
      savingsRate,
      avgMonthlyExpenses: totalExpenses / Math.max(monthsWithData, 1),
      avgMonthlyIncome: totalIncome / Math.max(monthsWithData, 1),
      monthlyData,
      topCategories,
      growthCategories,
      frequentSmall,
      transactionCount: transactions.length,
    }
  }

  /**
   * Format brief into Groq prompt
   */
  const formatBriefForGroq = (brief: ReturnType<typeof buildAnalysisBrief>) => {
    if (!brief) return ''

    const { profile, monthsAnalyzed, totalIncome, totalExpenses, savings, savingsRate } = brief
    const currency = profile.currency

    let text = `User Profile:
Name: ${profile.full_name || 'Friend'}
Email: ${profile.email || 'Not provided'}

Financial Analysis (Last ${monthsAnalyzed} months):

Currency: ${currency}
Monthly Budget Set: ${profile.monthly_budget > 0 ? formatCurrency(profile.monthly_budget, currency) : 'Not set'}
Total Income: ${formatCurrency(totalIncome, currency)}
Total Expenses: ${formatCurrency(totalExpenses, currency)}
Net Savings: ${formatCurrency(savings, currency)}
Savings Rate: ${savingsRate.toFixed(1)}%
Avg Monthly Income: ${formatCurrency(brief.avgMonthlyIncome, currency)}
Avg Monthly Expenses: ${formatCurrency(brief.avgMonthlyExpenses, currency)}

Monthly Spending Trend:`

    brief.monthlyData.forEach((m) => {
      text += `\n- ${m.label}: Spent ${formatCurrency(m.expenses, currency)}, Earned ${formatCurrency(m.income, currency)}`
    })

    text += `\n\nTop 5 Expense Categories (Last 6 Months):`
    brief.topCategories.forEach((c, i) => {
      text += `\n${i + 1}. ${c.category.name}: ${formatCurrency(c.totalAmount, currency)} (${c.percentOfTotal.toFixed(1)}% of total, ${c.transactionCount} transactions, avg ${formatCurrency(c.avgPerTransaction, currency)}/transaction, monthly avg ${formatCurrency(c.monthlyAvg, currency)})`
    })

    if (brief.growthCategories.length > 0) {
      text += `\n\nCategories with Recent Spending Spikes (>20% growth):`
      brief.growthCategories.forEach((c) => {
        text += `\n- ${c.category.name}: ${formatCurrency(c.previousMonth, currency)} → ${formatCurrency(c.recentMonth, currency)} (+${c.growthPct.toFixed(0)}%)`
      })
    }

    if (brief.frequentSmall.length > 0) {
      text += `\n\nDeath-by-1000-Cuts Categories (many small transactions):`
      brief.frequentSmall.forEach((c) => {
        text += `\n- ${c.category.name}: ${c.transactionCount} transactions, total ${formatCurrency(c.totalAmount, currency)} (avg ${formatCurrency(c.avgPerTransaction, currency)} each)`
      })
    }

    return text
  }

  /**
   * Call Groq AI for structured advice
   */
  const callGroqForAdvice = async (analysisBrief: string): Promise<string | null> => {
    if (!GROQ_API_KEY) return null

    const currency = profile?.currency || 'USD'
    const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'BHD' ? 'BD' : currency
    const userName = profile?.full_name ? profile.full_name.split(' ')[0] : 'Friend'

    const prompt = `You are an expert personal finance advisor. Analyze this user's financial data and provide structured, actionable advice tailored to their specific situation.

${analysisBrief}

Provide your response in EXACTLY this format with these 5 sections (use ${symbol} for amounts). Personalize your advice for ${userName}:

## QUICK_WINS
List 3-5 specific, actionable savings opportunities with EXACT amounts in ${symbol}. Format each as a bullet point starting with "•". Address ${userName} by name and be concrete (e.g., "• Coffee Shop: ${symbol}75/mo — Brew at home 3 days/week → Save ${symbol}45/mo").

## CATEGORY_BUDGETS
For each top expense category, suggest a target monthly budget with brief reasoning. Format as bullet points. Reference ${userName}'s current spending patterns.

## WARNING_SIGNS
List 2-4 spending patterns or trends to watch out for. Be honest but encouraging. Use ${userName}'s name to make it personal.

## BEHAVIORAL_INSIGHTS
Provide 2-3 insights about spending habits and what they reveal about ${userName}'s financial behavior. Suggest mental frameworks or tips tailored to their occupation if provided.

## LONG_TERM_STRATEGY
Outline a realistic 6-month savings goal with monthly milestones for ${userName}. Be specific with numbers and account for their monthly budget target.

IMPORTANT:
- Use the section headers exactly as shown (## SECTION_NAME)
- Use ${symbol} consistently for all currency mentions
- Address ${userName} directly by name in the advice
- Be specific with numbers, not vague
- Be encouraging but realistic
- Focus on actionable advice, not generic platitudes
- Reference their actual spending data and patterns`

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content:
                'You are an expert personal finance advisor providing structured, actionable advice based on real spending data.',
            },
            { role: 'user', content: prompt },
          ],
          max_tokens: 2000,
          temperature: 0.7,
        }),
      })

      if (!response.ok) {
        console.error('Groq error:', response.status)
        return null
      }

      const data = await response.json()
      return data.choices?.[0]?.message?.content || null
    } catch (err) {
      console.error('Groq call failed:', err)
      return null
    }
  }

  /**
   * Parse Groq response into sections
   */
  const parseInsights = (text: string): InsightSection[] => {
    const sectionConfig = [
      { key: 'QUICK_WINS', title: 'Quick Wins', icon: Zap, color: 'text-yellow-400' },
      { key: 'CATEGORY_BUDGETS', title: 'Category Recommendations', icon: Target, color: 'text-blue-400' },
      { key: 'WARNING_SIGNS', title: 'Warning Signs', icon: AlertTriangle, color: 'text-red-400' },
      { key: 'BEHAVIORAL_INSIGHTS', title: 'Behavioral Insights', icon: Brain, color: 'text-purple-400' },
      { key: 'LONG_TERM_STRATEGY', title: '6-Month Strategy', icon: PiggyBank, color: 'text-green-400' },
    ]

    const sections: InsightSection[] = []
    sectionConfig.forEach((cfg) => {
      const regex = new RegExp(`##\\s*${cfg.key}\\s*\\n([\\s\\S]*?)(?=##\\s*[A-Z_]+|$)`, 'i')
      const match = text.match(regex)
      if (match && match[1]) {
        sections.push({
          title: cfg.title,
          icon: cfg.icon,
          color: cfg.color,
          content: match[1].trim(),
        })
      }
    })

    // Fallback: if parsing failed, show raw response
    if (sections.length === 0) {
      sections.push({
        title: 'AI Analysis',
        icon: Sparkles,
        color: 'text-primary-400',
        content: text,
      })
    }

    return sections
  }

  const generateInsights = async () => {
    setLoading(true)
    setError(null)
    setInsights(null)

    try {
      if (transactions.length === 0) {
        setError('No transactions found. Add some transactions first to get insights!')
        return
      }

      if (!GROQ_API_KEY) {
        setError('AI service not configured. Please contact support.')
        return
      }

      const brief = buildAnalysisBrief()
      if (!brief) {
        setError('Unable to build analysis. Please try again.')
        return
      }

      const briefText = formatBriefForGroq(brief)
      const aiResponse = await callGroqForAdvice(briefText)

      if (!aiResponse) {
        setError('AI service is temporarily unavailable. Please try again.')
        return
      }

      const parsed = parseInsights(aiResponse)
      setInsights(parsed)
      setLastGenerated(new Date())
    } catch (err) {
      console.error('Insights generation failed:', err)
      setError('Failed to generate insights. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ============== RENDERING ==============

  const formatCurrencyAmount = (amount: number) =>
    formatCurrency(amount, profile?.currency || 'USD')

  // Render content with bullet points and bold formatting
  const renderInsightContent = (content: string) => {
    const lines = content.split('\n').filter((l) => l.trim())
    return lines.map((line, i) => {
      const trimmed = line.trim()
      const isBullet = trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')
      const cleanLine = isBullet ? trimmed.substring(1).trim() : trimmed

      // Parse bold **text**
      const parts = cleanLine.split(/(\*\*[^*]+\*\*)/g)
      const formatted = parts.map((part, j) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={j} className="text-white font-semibold">
              {part.slice(2, -2)}
            </strong>
          )
        }
        return <span key={j}>{part}</span>
      })

      if (isBullet) {
        return (
          <div key={i} className="flex items-start space-x-2 mb-2">
            <span className="text-primary-400 mt-1">•</span>
            <div className="flex-1 text-slate-200">{formatted}</div>
          </div>
        )
      }
      return (
        <p key={i} className="text-slate-200 mb-2">
          {formatted}
        </p>
      )
    })
  }

  // Quick stats from analysis
  const quickStats = (() => {
    if (!dataLoaded || !profile) return null
    const brief = buildAnalysisBrief()
    if (!brief) return null
    return brief
  })()

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center space-x-3">
              <div className="bg-gradient-to-br from-yellow-500 to-orange-600 p-2 rounded-lg">
                <Lightbulb className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Financial Insights</h1>
                <p className="text-sm text-slate-400">
                  AI-powered analysis of your spending and personalized advice
                </p>
              </div>
            </div>
            {lastGenerated && (
              <div className="text-xs text-slate-500">
                Last generated: {lastGenerated.toLocaleString()}
              </div>
            )}
          </div>
        </div>

        {/* Quick Stats Bar */}
        {quickStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
              <div className="flex items-center space-x-2 mb-1">
                <TrendingUp className="w-4 h-4 text-green-400" />
                <span className="text-xs text-slate-400">Income (6mo)</span>
              </div>
              <div className="text-lg font-semibold text-white">
                {formatCurrencyAmount(quickStats.totalIncome)}
              </div>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
              <div className="flex items-center space-x-2 mb-1">
                <TrendingDown className="w-4 h-4 text-red-400" />
                <span className="text-xs text-slate-400">Expenses (6mo)</span>
              </div>
              <div className="text-lg font-semibold text-white">
                {formatCurrencyAmount(quickStats.totalExpenses)}
              </div>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
              <div className="flex items-center space-x-2 mb-1">
                <PiggyBank className="w-4 h-4 text-primary-400" />
                <span className="text-xs text-slate-400">Savings Rate</span>
              </div>
              <div
                className={`text-lg font-semibold ${
                  quickStats.savingsRate >= 20
                    ? 'text-green-400'
                    : quickStats.savingsRate >= 0
                    ? 'text-yellow-400'
                    : 'text-red-400'
                }`}
              >
                {quickStats.savingsRate.toFixed(1)}%
              </div>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
              <div className="flex items-center space-x-2 mb-1">
                <Calendar className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-slate-400">Months Analyzed</span>
              </div>
              <div className="text-lg font-semibold text-white">
                {quickStats.monthsAnalyzed}
              </div>
            </div>
          </div>
        )}

        {/* Generate Button / Loading */}
        {!insights && !loading && (
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-lg p-8 text-center mb-6">
            <Sparkles className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">
              Get Your Personalized Financial Report
            </h2>
            <p className="text-slate-400 mb-6 max-w-2xl mx-auto">
              I'll analyze your last 6 months of spending, identify patterns, and provide
              specific recommendations to help you save more money.
            </p>
            <button
              onClick={generateInsights}
              disabled={!dataLoaded || transactions.length === 0}
              className="bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-600 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-8 py-3 rounded-lg transition flex items-center space-x-2 mx-auto"
            >
              <Brain className="w-5 h-5" />
              <span>Generate AI Report</span>
            </button>
            {transactions.length === 0 && dataLoaded && (
              <p className="text-xs text-slate-500 mt-4">
                Add some transactions first to enable analysis
              </p>
            )}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center mb-6">
            <Loader2 className="w-12 h-12 text-primary-500 animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Analyzing your finances...</h3>
            <p className="text-slate-400 text-sm">
              Crunching numbers and consulting AI. This usually takes 5-10 seconds.
            </p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 mb-6 flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-red-200">{error}</p>
            </div>
          </div>
        )}

        {/* Insights Sections */}
        {insights && (
          <div className="space-y-4">
            {insights.map((section, i) => {
              const Icon = section.icon
              return (
                <div
                  key={i}
                  className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-slate-600 transition"
                >
                  <div className="flex items-center space-x-3 mb-4">
                    <Icon className={`w-6 h-6 ${section.color}`} />
                    <h3 className="text-lg font-semibold text-white">{section.title}</h3>
                  </div>
                  <div className="text-sm leading-relaxed">
                    {renderInsightContent(section.content)}
                  </div>
                </div>
              )
            })}

            {/* Regenerate Button */}
            <div className="flex justify-center pt-4">
              <button
                onClick={generateInsights}
                disabled={loading}
                className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white px-6 py-2 rounded-lg transition flex items-center space-x-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Regenerate Report</span>
              </button>
            </div>
          </div>
        )}

        {/* Initial Loading */}
        {!dataLoaded && !error && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
          </div>
        )}

        {/* Powered by footer */}
        {insights && (
          <div className="text-center mt-6 text-xs text-slate-500">
            <DollarSign className="w-3 h-3 inline mr-1" />
            Insights generated by Groq AI based on your spending data
          </div>
        )}
      </div>
    </Layout>
  )
}
