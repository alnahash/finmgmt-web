/**
 * Groq API Service for AI-powered budget insights
 * Uses the free tier of Groq for real-time financial analysis
 */

export interface BudgetContext {
  totalBudget: number
  totalSpent: number
  percentageUsed: number
  daysRemaining: number
  budgetStatus: 'on-track' | 'warning' | 'exceeded'
  categories: {
    name: string
    budgetAmount: number
    actualSpent: number
    status: 'on-track' | 'warning' | 'exceeded'
  }[]
  monthLabel: string
  currency: string
}

export interface AIInsight {
  message: string
  warning: boolean
  confidence: 'high' | 'medium' | 'low'
}

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'mixtral-8x7b-32768' // Fast, free tier model

export const generateBudgetInsights = async (
  context: BudgetContext
): Promise<AIInsight> => {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY

  if (!apiKey) {
    return {
      message: 'AI insights unavailable - API key not configured',
      warning: false,
      confidence: 'low',
    }
  }

  // Build a detailed prompt for Groq
  const systemPrompt = `You are a friendly and insightful financial advisor. Analyze the user's budget data and provide ONE concise, actionable insight.

Focus on:
- Budget status (on-track, warning, or exceeded)
- Spending patterns and trends
- Days remaining in the month and spending pace
- SPECIFIC DAILY BUDGET LIMITS if overspending (e.g., "Reduce dining to BHD 10/day" or "Don't spend more than BHD 5/day on this category")
- Which categories need the most attention (prioritize highest overages)
- Positive reinforcement if doing well

Be encouraging but honest. If they're overspending:
- Calculate the daily limit they need: (remaining budget) / (days remaining) where remaining = total budget - total spent
- Give specific action: "You have BHD X left. To stay on budget over Y days, limit spending to BHD Z/day"
- Format example: "You have BHD 150 remaining. With 15 days left, limit spending to BHD 10/day to stay on track"

Keep response under 150 words. Start with an emoji that matches the sentiment (✓ for good, ⚠ for warning, 💡 for insight).`

  const userPrompt = `Monthly Budget Analysis for ${context.monthLabel}:

Budget Status: ${context.budgetStatus.toUpperCase()}
Total Budget: ${context.currency} ${context.totalBudget.toFixed(2)}
Actual Spending: ${context.currency} ${context.totalSpent.toFixed(2)}
Percentage Used: ${context.percentageUsed.toFixed(1)}%
Days Remaining: ${context.daysRemaining}

Category Breakdown:
${context.categories
  .map(
    (cat) =>
      `- ${cat.name}: ${context.currency} ${cat.actualSpent.toFixed(2)} / ${context.currency} ${cat.budgetAmount.toFixed(2)} (${cat.status})`
  )
  .join('\n')}

Provide ONE key insight about their budget status and spending habits.`

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 200,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Groq API error:', error)
      return {
        message: 'Unable to generate insights at this moment. Try again later.',
        warning: false,
        confidence: 'low',
      }
    }

    const data = await response.json()
    const message = data.choices?.[0]?.message?.content || ''

    // Determine if it's a warning based on budget status
    const warning = context.budgetStatus !== 'on-track'

    return {
      message,
      warning,
      confidence: 'high',
    }
  } catch (error) {
    console.error('Error generating budget insights:', error)
    return {
      message: 'Could not connect to AI service. Please try again.',
      warning: false,
      confidence: 'low',
    }
  }
}

// Alternative: Lightweight insights without API call (fallback)
export const generateFallbackInsights = (context: BudgetContext): AIInsight => {
  const daysSpent = new Date().getDate() - 1
  const totalDays = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const daysRatio = daysSpent / totalDays
  const spendingRatio = context.percentageUsed / 100
  const pace = spendingRatio / daysRatio

  // Analyze spending pace
  if (context.budgetStatus === 'exceeded') {
    const overage = context.totalSpent - context.totalBudget

    // Find which categories are over budget for prioritization
    const overBudgetCategories = context.categories
      .filter(cat => cat.status === 'exceeded')
      .sort((a, b) => (b.actualSpent - b.budgetAmount) - (a.actualSpent - a.budgetAmount))

    let specificRecommendation = ''
    if (overBudgetCategories.length > 0) {
      const topCategory = overBudgetCategories[0]
      const categoryOverage = topCategory.actualSpent - topCategory.budgetAmount
      specificRecommendation = `Focus on reducing ${topCategory.name} (over by ${context.currency} ${categoryOverage.toFixed(2)}).`
    }

    return {
      message: `⚠ You've exceeded your budget by ${context.currency} ${overage.toFixed(2)}. ${specificRecommendation} With ${context.daysRemaining} days left, minimize additional spending.`,
      warning: true,
      confidence: 'high',
    }
  }

  if (pace > 1.1) {
    // Calculate actual daily spending limit to stay on budget
    const remainingBudget = context.totalBudget - context.totalSpent
    const dailyLimit = Math.ceil((remainingBudget / context.daysRemaining) * 100) / 100

    // Find which categories are over budget for prioritization
    const overBudgetCategories = context.categories
      .filter(cat => cat.status === 'exceeded')
      .sort((a, b) => (b.actualSpent - b.budgetAmount) - (a.actualSpent - a.budgetAmount))

    let specificRecommendation = ''
    if (overBudgetCategories.length > 0) {
      const topCategory = overBudgetCategories[0]
      const categoryOverage = topCategory.actualSpent - topCategory.budgetAmount
      const dailyLimitForCategory = Math.ceil(((topCategory.budgetAmount - categoryOverage) / context.daysRemaining) * 100) / 100
      specificRecommendation = `Focus on reducing ${topCategory.name} to ${context.currency} ${dailyLimitForCategory}/day.`
    }

    return {
      message: `⚠ Your spending pace suggests you'll exceed your budget by month end. You have ${context.currency} ${remainingBudget.toFixed(2)} left. To stay on budget over ${context.daysRemaining} days, limit spending to ${context.currency} ${dailyLimit}/day. ${specificRecommendation}`,
      warning: true,
      confidence: 'medium',
    }
  }

  if (context.percentageUsed > 75) {
    return {
      message: `✓ You're at ${context.percentageUsed.toFixed(0)}% of budget with ${context.daysRemaining} days left. Keep up the discipline!`,
      warning: false,
      confidence: 'high',
    }
  }

  return {
    message: `✓ Great job! You're on track with ${context.percentageUsed.toFixed(0)}% of budget used. Keep maintaining this spending pattern.`,
    warning: false,
    confidence: 'high',
  }
}
