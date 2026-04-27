import { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthContext } from '../App'
import { supabase } from '../lib/supabase'
import { ArrowRight, Check } from 'lucide-react'

const DEFAULT_CATEGORIES = [
  { name: 'Food & Dining', icon: '🍔', color: '#f97316', type: 'expense' },
  { name: 'Transportation', icon: '🚗', color: '#f97316', type: 'expense' },
  { name: 'Entertainment', icon: '🎬', color: '#f97316', type: 'expense' },
  { name: 'Housing', icon: '🏠', color: '#f97316', type: 'expense' },
  { name: 'Clothing', icon: '👕', color: '#f97316', type: 'expense' },
  { name: 'Health & Fitness', icon: '💪', color: '#f97316', type: 'expense' },
  { name: 'Shopping', icon: '🛒', color: '#f97316', type: 'expense' },
  { name: 'Education', icon: '📚', color: '#f97316', type: 'expense' },
  { name: 'Travel', icon: '✈️', color: '#f97316', type: 'expense' },
  { name: 'Salary', icon: '💰', color: '#10b981', type: 'income' },
]

export default function Onboarding() {
  const { user } = useContext(AuthContext)
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    full_name: '',
    currency: 'USD',
    monthly_budget: 0,
    month_start_day: 1,
  })

  useEffect(() => {
    if (user?.user_metadata?.full_name) {
      setFormData((prev) => ({
        ...prev,
        full_name: user.user_metadata.full_name,
      }))
    }
  }, [user])

  const handleNext = async () => {
    if (step === 1) {
      if (!formData.full_name) return
      setStep(2)
    } else if (step === 2) {
      setStep(3)
    } else if (step === 3) {
      await completeOnboarding()
    }
  }

  const completeOnboarding = async () => {
    if (!user) return
    setLoading(true)

    try {
      // Update profile
      await supabase
        .from('profiles')
        .upsert([
          {
            id: user.id,
            full_name: formData.full_name,
            currency: formData.currency,
            monthly_budget: formData.monthly_budget,
            month_start_day: formData.month_start_day,
            onboarded: true,
          },
        ])

      // Create default categories
      const categories = DEFAULT_CATEGORIES.map((cat) => ({
        user_id: user.id,
        ...cat,
        is_default: true,
      }))

      await supabase.from('categories').insert(categories)

      navigate('/')
    } catch (error) {
      console.error('Error completing onboarding:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="bg-slate-900 border border-slate-800 rounded-lg shadow-xl p-8">
          {/* Progress */}
          <div className="flex items-center justify-between mb-8">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition ${
                    s <= step
                      ? 'bg-primary-600 text-white'
                      : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  {s < step ? <Check className="w-5 h-5" /> : s}
                </div>
                {s < 3 && (
                  <div
                    className={`h-1 w-12 mx-2 transition ${
                      s < step ? 'bg-primary-600' : 'bg-slate-700'
                    }`}
                  ></div>
                )}
              </div>
            ))}
          </div>

          {/* Step 1: Profile */}
          {step === 1 && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Welcome to FinMgmt! 👋</h2>
              <p className="text-slate-400 mb-8">Let's set up your account</p>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Full Name</label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) =>
                    setFormData({ ...formData, full_name: e.target.value })
                  }
                  placeholder="John Doe"
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-primary-500 mb-6"
                  autoFocus
                />
              </div>

              <button
                onClick={handleNext}
                disabled={!formData.full_name}
                className="w-full flex items-center justify-center space-x-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition"
              >
                <span>Continue</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Step 2: Preferences */}
          {step === 2 && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Your Preferences</h2>
              <p className="text-slate-400 mb-8">Customize your experience</p>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Currency</label>
                  <select
                    value={formData.currency}
                    onChange={(e) =>
                      setFormData({ ...formData, currency: e.target.value })
                    }
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
                  >
                    <option value="USD">US Dollar (USD)</option>
                    <option value="EUR">Euro (EUR)</option>
                    <option value="GBP">British Pound (GBP)</option>
                    <option value="BHD">Bahraini Dinar (BHD)</option>
                    <option value="AED">UAE Dirham (AED)</option>
                    <option value="SAR">Saudi Riyal (SAR)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Month Start Day
                  </label>
                  <select
                    value={formData.month_start_day}
                    onChange={(e) =>
                      setFormData({ ...formData, month_start_day: parseInt(e.target.value) })
                    }
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
                  >
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                      <option key={day} value={day}>
                        Day {day}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-400 mt-1">When should your monthly budget reset?</p>
                </div>
              </div>

              <div className="flex space-x-2 mt-8">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 rounded-lg transition"
                >
                  Back
                </button>
                <button
                  onClick={handleNext}
                  className="flex-1 flex items-center justify-center space-x-2 bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 rounded-lg transition"
                >
                  <span>Continue</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Budget */}
          {step === 3 && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Monthly Budget</h2>
              <p className="text-slate-400 mb-8">Set a spending limit (optional)</p>

              <div className="mb-8">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Monthly Budget ({formData.currency})
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.monthly_budget || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      monthly_budget: e.target.value ? parseFloat(e.target.value) : 0,
                    })
                  }
                  placeholder="e.g., 5000"
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-primary-500"
                />
                <p className="text-xs text-slate-400 mt-1">
                  You can change this anytime in settings
                </p>
              </div>

              <div className="flex space-x-2">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 rounded-lg transition"
                >
                  Back
                </button>
                <button
                  onClick={handleNext}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center space-x-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition"
                >
                  <span>{loading ? 'Setting up...' : 'Complete Setup'}</span>
                  {!loading && <Check className="w-5 h-5" />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
