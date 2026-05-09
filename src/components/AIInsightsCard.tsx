import { useEffect, useState } from 'react'
import { Sparkles, AlertCircle, CheckCircle } from 'lucide-react'
import {
  generateBudgetInsights,
  generateFallbackInsights,
  BudgetContext,
  AIInsight,
} from '../services/groq'

interface AIInsightsCardProps {
  context: BudgetContext
  isLoading?: boolean
}

export default function AIInsightsCard({ context, isLoading = false }: AIInsightsCardProps) {
  const [insight, setInsight] = useState<AIInsight | null>(null)
  const [loading, setLoading] = useState(isLoading)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchInsights = async () => {
      setLoading(true)
      setError(null)

      try {
        // Try Groq API first
        const groqInsight = await generateBudgetInsights(context)
        setInsight(groqInsight)

        // If Groq fails or returns low confidence, use fallback
        if (groqInsight.confidence === 'low') {
          const fallbackInsight = generateFallbackInsights(context)
          setInsight(fallbackInsight)
        }
      } catch (err) {
        console.error('Error fetching insights:', err)
        // Use fallback on error
        const fallbackInsight = generateFallbackInsights(context)
        setInsight(fallbackInsight)
      } finally {
        setLoading(false)
      }
    }

    fetchInsights()
  }, [context])

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-6">
        <div className="flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-red-300 font-semibold">Insights Unavailable</h3>
            <p className="text-red-200 text-sm mt-1">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`rounded-lg p-6 border transition ${
        insight?.warning
          ? 'bg-orange-900/20 border-orange-700/50'
          : 'bg-gradient-to-br from-primary-900/30 to-primary-900/10 border-primary-700/50'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Sparkles
            className={`w-5 h-5 ${
              insight?.warning ? 'text-orange-400' : 'text-primary-400'
            }`}
          />
          <h3
            className={`font-semibold ${
              insight?.warning ? 'text-orange-300' : 'text-primary-300'
            }`}
          >
            AI Budget Insights
          </h3>
        </div>
        {insight && (
          <span
            className={`text-xs font-medium ${
              insight.confidence === 'high'
                ? 'text-green-400'
                : insight.confidence === 'medium'
                  ? 'text-yellow-400'
                  : 'text-slate-400'
            }`}
          >
            {insight.confidence === 'high' ? '●' : '○'} {insight.confidence}
          </span>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-2">
          <div className="h-4 bg-slate-700/50 rounded animate-pulse w-3/4"></div>
          <div className="h-4 bg-slate-700/50 rounded animate-pulse w-full"></div>
          <div className="h-4 bg-slate-700/50 rounded animate-pulse w-2/3"></div>
        </div>
      ) : insight ? (
        <div className="flex items-start space-x-3">
          {insight.warning ? (
            <AlertCircle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
          ) : (
            <CheckCircle className="w-5 h-5 text-primary-400 flex-shrink-0 mt-0.5" />
          )}
          <p
            className={`text-sm leading-relaxed ${
              insight.warning ? 'text-orange-100' : 'text-primary-100'
            }`}
          >
            {insight.message}
          </p>
        </div>
      ) : null}

      {/* Footer */}
      <div
        className={`mt-4 pt-4 border-t ${
          insight?.warning
            ? 'border-orange-700/30 text-orange-300'
            : 'border-primary-700/30 text-primary-300'
        } text-xs`}
      >
        💡 Powered by Groq AI - Real-time budget analysis
      </div>
    </div>
  )
}
