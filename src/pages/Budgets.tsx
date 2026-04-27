import { useContext, useEffect, useState } from 'react'
import { AuthContext } from '../App'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { Plus, Trash2 } from 'lucide-react'

interface Budget {
  id: string
  category_id: string
  amount: number
  month: number
  year: number
  category_name?: string
  category_icon?: string
}

interface Category {
  id: string
  name: string
  icon: string
}

export default function Budgets() {
  const { user } = useContext(AuthContext)
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [categories, setCategories] = useState<Map<string, Category>>(new Map())
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    category_id: '',
    amount: '',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  })

  useEffect(() => {
    fetchData()
  }, [user])

  const fetchData = async () => {
    if (!user) return
    setLoading(true)

    try {
      // Fetch categories
      const { data: cats } = await supabase
        .from('categories')
        .select('id, name, icon')
        .eq('user_id', user.id)

      const catMap = new Map()
      cats?.forEach((cat) => catMap.set(cat.id, cat))
      setCategories(catMap)

      // Fetch budgets
      const { data: budgs } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_id', user.id)
        .order('month', { ascending: false })

      const enriched = budgs?.map((b) => ({
        ...b,
        category_name: catMap.get(b.category_id)?.name || 'Uncategorized',
        category_icon: catMap.get(b.category_id)?.icon || '📁',
      })) || []

      setBudgets(enriched)
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !formData.category_id || !formData.amount) return

    try {
      await supabase.from('budgets').insert([
        {
          user_id: user.id,
          category_id: formData.category_id,
          amount: parseFloat(formData.amount),
          month: formData.month,
          year: formData.year,
        },
      ])

      setFormData({
        category_id: '',
        amount: '',
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
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

  const monthName = new Date(formData.year, formData.month - 1).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  })

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
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <label className="block text-sm font-medium text-slate-300 mb-2">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Month</label>
                <select
                  value={formData.month}
                  onChange={(e) =>
                    setFormData({ ...formData, month: parseInt(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                >
                  {Array.from({ length: 12 }, (_, i) => {
                    const d = new Date(2024, i)
                    return (
                      <option key={i + 1} value={i + 1}>
                        {d.toLocaleString('en-US', { month: 'long' })}
                      </option>
                    )
                  })}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Year</label>
                <input
                  type="number"
                  value={formData.year}
                  onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                />
              </div>

              <div className="md:col-span-2 flex space-x-2">
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
                      month: new Date().getMonth() + 1,
                      year: new Date().getFullYear(),
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
                    <p className="text-white font-medium">{b.category_name}</p>
                    <p className="text-slate-400 text-sm">
                      {new Date(b.year, b.month - 1).toLocaleString('en-US', {
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <p className="text-white font-semibold text-lg">${b.amount.toFixed(2)}</p>
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
