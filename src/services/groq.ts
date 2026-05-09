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
- Specific category advice if relevant
- Positive reinforcement if doing well

Be encouraging but honest. If they're overspending, give specific advice.
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
    return {
      message: `⚠ You've exceeded your budget by ${context.currency} ${(context.totalSpent - context.totalBudget).toFixed(2)}. Consider reducing spending in high-usage categories.`,
      warning: true,
      confidence: 'high',
    }
  }

  if (pace > 1.1) {
    return {
      message: `💡 Your spending pace suggests you'll exceed your budget by month end. With ${context.daysRemaining} days left, consider reducing discretionary spending.`,
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
