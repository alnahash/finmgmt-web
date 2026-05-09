/**
 * Budget Recommendations Engine
 * Analyzes historical spending patterns and suggests optimal budgets
 */

export interface SpendingPattern {
  categoryId: string
  categoryName: string
  categoryIcon: string
  averageMonthly: number
  minMonthly: number
  maxMonthly: number
  variance: number // Standard deviation
  trend: 'increasing' | 'decreasing' | 'stable'
  isEssential: boolean // Essential vs discretionary
  monthlyDataPoints: number
}

export interface BudgetRecommendation {
  categoryId: string
  categoryName: string
  categoryIcon: string
  currentBudget: number
  recommendedBudget: number
  aggressiveBudget: number // Mean (tighter control)
  comfortableBudget: number // Mean + 15% (balanced)
  sustainableBudget: number // Mean + 25% (flexible)
  averageSpending: number
  potentialSavings: number
  alignment: 'under-budgeted' | 'well-aligned' | 'over-budgeted'
  priority: number // 1-10 (highest impact first)
}

/**
 * Analyze 6+ months of spending history for each category
 */
export const analyzeSpendingPatterns = (
  transactions: Array<{ amount: number; category_id: string; transaction_date: string }>,
  categories: Array<{ id: string; name: string; icon: string }>,
  categoryTypeMap: Map<string, string>
): SpendingPattern[] => {
  // Group transactions by category and month
  const categoryMonthlyData = new Map<string, number[]>()

  transactions.forEach((txn) => {
    const catType = categoryTypeMap.get(txn.category_id)
    if (catType === 'income') return // Skip income

    const key = txn.category_id

    if (!categoryMonthlyData.has(key)) {
      categoryMonthlyData.set(key, [])
    }

    const monthData = categoryMonthlyData.get(key)!
    // Aggregate amounts in the array (we'll need to reorganize by month later)
    monthData.push(txn.amount)
  })

  // Calculate patterns for each category
  const patterns: SpendingPattern[] = []

  categories.forEach((cat) => {
    if (categoryTypeMap.get(cat.id) === 'income') return

    const amounts = categoryMonthlyData.get(cat.id) || []
    if (amounts.length === 0) return

    const average = amounts.reduce((a, b) => a + b, 0) / amounts.length
    const min = Math.min(...amounts)
    const max = Math.max(...amounts)

    // Calculate variance (standard deviation)
    const squaredDiffs = amounts.map((x) => Math.pow(x - average, 2))
    const variance = Math.sqrt(
      squaredDiffs.reduce((a, b) => a + b, 0) / amounts.length
    )

    // Determine if essential or discretionary based on variance
    // Low variance = essential (groceries, utilities), high variance = discretionary (dining, entertainment)
    const cvRatio = variance / average // Coefficient of variation
    const isEssential = cvRatio < 0.3 // Less than 30% variation = essential

    // Determine trend (comparing last 3 months vs previous 3 months if available)
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable'
    if (amounts.length >= 6) {
      const firstHalf = amounts.slice(0, Math.floor(amounts.length / 2))
      const secondHalf = amounts.slice(Math.floor(amounts.length / 2))
      const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
      const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length
      const changePercent = ((avgSecond - avgFirst) / avgFirst) * 100

      if (changePercent > 5) trend = 'increasing'
      else if (changePercent < -5) trend = 'decreasing'
    }

    patterns.push({
      categoryId: cat.id,
      categoryName: cat.name,
      categoryIcon: cat.icon,
      averageMonthly: average,
      minMonthly: min,
      maxMonthly: max,
      variance,
      trend,
      isEssential,
      monthlyDataPoints: amounts.length,
    })
  })

  return patterns.sort((a, b) => b.averageMonthly - a.averageMonthly)
}

/**
 * Generate budget recommendations based on spending patterns
 */
export const generateRecommendations = (
  patterns: SpendingPattern[],
  currentBudgets: Map<string, number>
): BudgetRecommendation[] => {
  const recommendations: BudgetRecommendation[] = []

  patterns.forEach((pattern) => {
    const current = currentBudgets.get(pattern.categoryId) || 0
    const avg = pattern.averageMonthly

    // Calculate budget tiers
    const aggressive = Math.ceil(avg)
    const comfortable = Math.ceil(avg * 1.15) // +15% for flexibility
    const sustainable = Math.ceil(avg * 1.25) // +25% for peace of mind

    // Determine recommendation (default to comfortable for balance)
    const recommended = comfortable

    // Calculate savings impact
    const potentialSavings = current > 0 ? Math.max(0, current - aggressive) : 0

    // Determine alignment
    let alignment: 'under-budgeted' | 'well-aligned' | 'over-budgeted'
    if (current === 0) {
      alignment = 'under-budgeted'
    } else if (current > avg * 1.1) {
      alignment = 'over-budgeted'
    } else if (current < avg * 0.9) {
      alignment = 'under-budgeted'
    } else {
      alignment = 'well-aligned'
    }

    // Priority: over-budgeted categories with high spending = highest priority for savings
    const priority = alignment === 'over-budgeted' ? Math.min(10, Math.ceil((pattern.averageMonthly / 10) * 0.1)) : 0

    recommendations.push({
      categoryId: pattern.categoryId,
      categoryName: pattern.categoryName,
      categoryIcon: pattern.categoryIcon,
      currentBudget: current,
      recommendedBudget: recommended,
      aggressiveBudget: aggressive,
      comfortableBudget: comfortable,
      sustainableBudget: sustainable,
      averageSpending: avg,
      potentialSavings,
      alignment,
      priority,
    })
  })

  // Sort by priority (impact)
  return recommendations.sort((a, b) => b.priority - a.priority)
}

/**
 * Generate AI coaching message about recommendations
 */
export const getRecommendationSummary = (
  recommendations: BudgetRecommendation[]
): string => {
  const overBudgeted = recommendations.filter((r) => r.alignment === 'over-budgeted')
  const underBudgeted = recommendations.filter((r) => r.alignment === 'under-budgeted')
  const totalSavings = overBudgeted.reduce((sum, r) => sum + r.potentialSavings, 0)

  if (overBudgeted.length === 0 && underBudgeted.length === 0) {
    return 'Your budgets are well-aligned with your actual spending. Keep up the great work!'
  }

  let summary = ''

  if (overBudgeted.length > 0) {
    const topCategory = overBudgeted[0]
    summary += `📊 You have room to optimize ${topCategory.categoryName} - currently budgeting $${topCategory.currentBudget.toFixed(2)} but averaging $${topCategory.averageSpending.toFixed(2)}. `

    if (totalSavings > 0) {
      summary += `Adjusting overbudgeted categories could save ~$${totalSavings.toFixed(2)}/month.`
    }
  }

  if (underBudgeted.length > 0) {
    const topUnder = underBudgeted[0]
    summary += `⚠️ ${topUnder.categoryName} is under-budgeted (budgeting $${topUnder.currentBudget.toFixed(2)} but spending $${topUnder.averageSpending.toFixed(2)}). Consider increasing to avoid exceeding budget.`
  }

  return summary
}
