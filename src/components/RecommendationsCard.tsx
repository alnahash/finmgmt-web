import { useState } from 'react'
import { ChevronDown, ChevronUp, Zap, AlertCircle } from 'lucide-react'
import { BudgetRecommendation } from '../services/recommendations'

interface RecommendationsCardProps {
  recommendations: BudgetRecommendation[]
  currencySymbol: string
  onApplyRecommendation?: (categoryId: string, amount: number) => void
  isLoading?: boolean
}

export default function RecommendationsCard({
  recommendations,
  currencySymbol,
  onApplyRecommendation,
  isLoading = false,
}: RecommendationsCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [selectedLevel, setSelectedLevel] = useState<'comfortable' | 'aggressive' | 'sustainable'>(
    'comfortable'
  )

  if (recommendations.length === 0) {
    return null
  }

  // Calculate total potential savings
  const totalSavings = recommendations.reduce((sum, r) => sum + r.potentialSavings, 0)
  const overBudgeted = recommendations.filter((r) => r.alignment === 'over-budgeted')

  // Get recommendation level amounts
  const getBudgetForLevel = (rec: BudgetRecommendation) => {
    switch (selectedLevel) {
      case 'aggressive':
        return rec.aggressiveBudget
      case 'sustainable':
        return rec.sustainableBudget
      default:
        return rec.comfortableBudget
    }
  }

  return (
    <div className="bg-gradient-to-br from-blue-900/30 to-blue-900/10 border border-blue-700/50 rounded-lg p-6">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between hover:opacity-80 transition"
      >
        <div className="flex items-center space-x-3">
          <Zap className="w-5 h-5 text-blue-400" />
          <div className="text-left">
            <h3 className="font-semibold text-blue-300">Budget Optimization</h3>
            <p className="text-xs text-blue-200 mt-1">
              {overBudgeted.length} categories to optimize •{' '}
              {totalSavings > 0 && `Save ${currencySymbol}${totalSavings.toFixed(2)}/month`}
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-blue-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-blue-400" />
        )}
      </button>

      {/* Expanded Content */}
      {expanded && (
        <>
          {/* Recommendation Level Selector */}
          <div className="mt-4 p-3 bg-blue-900/20 rounded-lg">
            <p className="text-xs text-blue-300 font-medium mb-2 uppercase tracking-wide">
              Budget Level
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setSelectedLevel('aggressive')}
                className={`px-3 py-2 rounded text-xs font-medium transition ${
                  selectedLevel === 'aggressive'
                    ? 'bg-red-600/80 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                💪 Aggressive
              </button>
              <button
                onClick={() => setSelectedLevel('comfortable')}
                className={`px-3 py-2 rounded text-xs font-medium transition ${
                  selectedLevel === 'comfortable'
                    ? 'bg-blue-600/80 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                ⚖️ Comfortable
              </button>
              <button
                onClick={() => setSelectedLevel('sustainable')}
                className={`px-3 py-2 rounded text-xs font-medium transition ${
                  selectedLevel === 'sustainable'
                    ? 'bg-green-600/80 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                🛡️ Sustainable
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              {selectedLevel === 'aggressive' &&
                'Tight control - your actual average (best for savings)'}
              {selectedLevel === 'comfortable' &&
                'Balanced - room for variation while staying on track'}
              {selectedLevel === 'sustainable' &&
                'Flexible - maximum peace of mind'}
            </p>
          </div>

          {/* Recommendations List */}
          <div className="mt-4 space-y-3 max-h-96 overflow-y-auto">
            {recommendations.map((rec) => {
              const recommendedAmount = getBudgetForLevel(rec)
              const savings = Math.max(0, rec.currentBudget - recommendedAmount)
              const needsAttention = rec.alignment !== 'well-aligned'

              return (
                <div
                  key={rec.categoryId}
                  className={`p-3 rounded-lg border transition ${
                    needsAttention
                      ? 'bg-slate-700/50 border-slate-600'
                      : 'bg-slate-800/30 border-slate-700/30'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-2xl">{rec.categoryIcon}</span>
                      <div>
                        <p className="text-white font-medium text-sm">{rec.categoryName}</p>
                        <p className="text-xs text-slate-400">
                          {rec.alignment === 'over-budgeted' && '📌 Over-budgeted'}
                          {rec.alignment === 'under-budgeted' && '⚠️ Under-budgeted'}
                          {rec.alignment === 'well-aligned' && '✓ Well-aligned'}
                        </p>
                      </div>
                    </div>
                    {needsAttention && (
                      <AlertCircle className="w-4 h-4 text-orange-400 flex-shrink-0" />
                    )}
                  </div>

                  {/* Budget Comparison */}
                  <div className="space-y-1.5 text-xs mb-2">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Actual Average:</span>
                      <span className="text-blue-300 font-medium">
                        {currencySymbol}
                        {rec.averageSpending.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Current Budget:</span>
                      <span className="text-white font-medium">
                        {currencySymbol}
                        {rec.currentBudget.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-slate-700 pt-1">
                      <span className="text-slate-300">Recommended ({selectedLevel}):</span>
                      <span className={`font-bold ${
                        savings > 0 ? 'text-green-400' : 'text-orange-400'
                      }`}>
                        {currencySymbol}
                        {recommendedAmount.toFixed(2)}
                        {savings > 0 && ` (save ${currencySymbol}${savings.toFixed(2)})`}
                      </span>
                    </div>
                  </div>

                  {/* Insight */}
                  <p className="text-xs text-slate-300 italic mb-2">
                    {rec.alignment === 'over-budgeted' &&
                      `You budget ${currencySymbol}${rec.currentBudget.toFixed(2)} but actually spend ${currencySymbol}${rec.averageSpending.toFixed(2)}. Opportunity to redirect ${currencySymbol}${(rec.currentBudget - rec.averageSpending).toFixed(2)}.`}
                    {rec.alignment === 'under-budgeted' &&
                      `You budget ${currencySymbol}${rec.currentBudget.toFixed(2)} but spend ${currencySymbol}${rec.averageSpending.toFixed(2)}. Increase budget to stay on track.`}
                    {rec.alignment === 'well-aligned' &&
                      `Your budget matches your spending well. Keep this allocation.`}
                  </p>

                  {/* Apply Button */}
                  {rec.alignment !== 'well-aligned' && onApplyRecommendation && (
                    <button
                      onClick={() => onApplyRecommendation(rec.categoryId, recommendedAmount)}
                      disabled={isLoading}
                      className="w-full px-2 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white text-xs font-medium rounded transition"
                    >
                      {isLoading ? 'Applying...' : `Apply ${currencySymbol}${recommendedAmount.toFixed(2)}`}
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {/* Summary Footer */}
          {totalSavings > 0 && (
            <div className="mt-4 p-3 bg-green-900/20 border border-green-700/50 rounded-lg">
              <p className="text-green-300 text-sm font-medium">
                💰 Potential Monthly Savings: {currencySymbol}
                {totalSavings.toFixed(2)}
              </p>
              <p className="text-green-200 text-xs mt-1">
                = {currencySymbol}
                {(totalSavings * 12).toFixed(2)} saved per year if applied
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
