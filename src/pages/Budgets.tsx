import { useContext, useEffect, useState } from 'react'
import { AuthContext } from '../App'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, Info } from 'lucide-react'
import { getPeriodLabel, getUniquePeriodKeys, getCurrencySymbol } from '../lib/utils'

interface Budget {
  id: string
  category_id: string
  amount: number
  month_period_key: string
  is_recurring: boolean
  category_name?: string
  category_icon?: string
  category_type?: string
}

interface Category {
  id: string
  name: string
  icon: string
  type?: string
}

interface Profile {
  month_start_day: number
  currency: string
}

export default function Budgets() {
  const { user } = useContext(AuthContext)
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [categories, setCategories] = useState<Map<string, Category>>(new Map())
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [currency, setCurrency] = useState('USD')
  const [availablePeriods, setAvailablePeriods] = useState<string[]>([])
  const [formData, setFormData] = useState({
    category_id: '',
    amount: '',
    month_period_key: '',
    is_recurring: true,
  })

  useEffect(() => {
    fetchData()
  }, [user])

  const fetchData = async () => {
    if (!user) return
    setLoading(true)

    try {
      // Fetch profile for month_start_day and currency
      const { data: profile } = await supabase
        .from('profiles')
        .select('month_start_day, currency')
        .eq('id', user.id)
        .single() as { data: Profile | null }

      const startDay = profile?.month_start_day || 1
      const curr = profile?.currency || 'USD'
      setCurrency(curr)

      // Fetch categories
      const { data: cats } = await supabase
        .from('categories')
        .select('id, name, icon, type')
        .eq('user_id', user.id)

      const catMap = new Map()
      cats?.forEach((cat) => catMap.set(cat.id, cat))
      setCategories(catMap)

      // Fetch all transactions to generate available periods
      const { data: transactions } = await supabase
        .from('transactions')
        .select('transaction_date')
        .eq('user_id', user.id)

      let generatedPeriods: string[] = []
      if (transactions && transactions.length > 0) {
        generatedPeriods = getUniquePeriodKeys(
          transactions.map((t) => t.transaction_date),
          startDay
        )
        setAvailablePeriods(generatedPeriods)
      }

      // Fetch budgets
      const { data: budgs } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_id', user.id)
        .order('month_period_key', { ascending: false })

      const enriched = budgs?.map((b) => ({
        ...b,
        category_name: catMap.get(b.category_id)?.name || 'Uncategorized',
        category_icon: catMap.get(b.category_id)?.icon || '📁',
        category_type: catMap.get(b.category_id)?.type,
      })) || []

      setBudgets(enriched)

      // Set initial period in form to current period
      if (generatedPeriods && generatedPeriods.length > 0) {
        setFormData((prev) => ({
          ...prev,
          month_period_key: generatedPeriods[0],
        }))
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !formData.category_id || !formData.amount || !formData.month_period_key) return

    try {
      await supabase.from('budgets').insert([
        {
          user_id: user.id,
          category_id: formData.category_id,
          amount: parseFloat(formData.amount),
          month_period_key: formData.month_period_key,
          is_recurring: formData.is_recurring,
        },
      ])

      setFormData({
        category_id: '',
        amount: '',
        month_period_key: availablePeriods.length > 0 ? availablePeriods[0] : '',
        is_recurring: true,
      })
      setShowForm(false)
      fetchData()
    } catch (error) {
      console.error('Error saving budget:', error)
    }
  }

  const handleDelete = async (id: string) => {
    if (!user || !confirm('Delete this budget?')) return

    try {
      await supabase
        .from('budgets')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)

      fetchData()
    } catch (error) {
      console.error('Error deleting budget:', error)
    }
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-white">Budgets</h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center space-x-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg transition"
          >
            <Plus className="w-5 h-5" />
            <span>Set Budget</span>
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-8">
            <h2 className="text-lg font-semibold text-white mb-4">Create New Budget</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Info box */}
              <div className="bg-slate-700 border border-slate-600 rounded-lg p-4 flex items-start space-x-3">
                <Info className="w-5 h-5 text-primary-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-slate-300">
                  <p className="font-medium text-white mb-1">How budgets work:</p>
                  <p>Set a spending limit for a category. Enable "Apply to all periods" to use the same budget for every month/cycle, or leave it off for a one-time budget for a specific period.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Category</label>
                  <select
                    value={formData.category_id}
                    onChange={(e) =>
                      setFormData({ ...formData, category_id: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                    required
                  >
                    <option value="">Select category</option>
                    {Array.from(categories.values()).map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.icon} {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Budget Amount</label>
                  <div className="flex items-center space-x-2">
                    <span className="text-slate-400">{getCurrencySymbol(currency)}</span>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      placeholder="0.00"
                      className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Period</label>
                  <select
                    value={formData.month_period_key}
                    onChange={(e) =>
                      setFormData({ ...formData, month_period_key: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                    required
                  >
                    <option value="">Select period</option>
                    {availablePeriods.map((period) => (
                      <option key={period} value={period}>
                        {getPeriodLabel(period)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_recurring}
                      onChange={(e) =>
                        setFormData({ ...formData, is_recurring: e.target.checked })
                      }
                      className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-primary-600 cursor-pointer"
                    />
                    <span className="text-sm font-medium text-slate-300">Apply to all periods</span>
                  </label>
                </div>
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 rounded-lg transition"
                >
                  Create Budget
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false)
                    setFormData({
                      category_id: '',
                      amount: '',
                      month_period_key: availablePeriods.length > 0 ? availablePeriods[0] : '',
                      is_recurring: true,
                    })
                  }}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 rounded-lg transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Budgets List */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-slate-800 rounded-lg animate-pulse"></div>
            ))}
          </div>
        ) : budgets.length === 0 ? (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
            <p className="text-slate-400">No budgets set yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {budgets.map((b) => (
              <div
                key={b.id}
                className="bg-slate-800 border border-slate-700 rounded-lg p-4 flex items-center justify-between hover:border-primary-500 transition"
              >
                <div className="flex items-center space-x-4 flex-1">
                  <span className="text-2xl">{b.category_icon}</span>
                  <div>
                    <div className="flex items-center space-x-2">
                      <p className="text-white font-medium">{b.category_name}</p>
                      {b.is_recurring && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-primary-900 text-primary-300 rounded-full">
                          Recurring
                        </span>
                      )}
                    </div>
                    <p className="text-slate-400 text-sm mt-1">
                      {getPeriodLabel(b.month_period_key)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <p className="text-white font-semibold text-lg">{getCurrencySymbol(currency)}{b.amount.toFixed(2)}</p>
                  <button
                    onClick={() => handleDelete(b.id)}
                    className="text-slate-400 hover:text-red-500 transition"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
