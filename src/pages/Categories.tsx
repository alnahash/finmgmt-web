import { useContext, useEffect, useState } from 'react'
import { AuthContext } from '../App'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, Edit2 } from 'lucide-react'

interface Category {
  id: string
  name: string
  icon: string
  color: string
  type: 'expense' | 'income'
  archived: boolean
}

const DEFAULT_EMOJIS = ['🍔', '🚗', '🎬', '🏠', '👕', '💊', '⚽', '📚', '✈️', '💇', '🛒', '🎁']

export default function Categories() {
  const { user } = useContext(AuthContext)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    icon: '📁',
    color: '#f97316',
    type: 'expense' as 'expense' | 'income',
  })

  useEffect(() => {
    fetchCategories()
  }, [user])

  const fetchCategories = async () => {
    if (!user) return
    setLoading(true)

    try {
      const { data } = await supabase
        .from('categories')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      setCategories(data || [])
    } catch (error) {
      console.error('Error fetching categories:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !formData.name) return

    try {
      if (editingId) {
        await supabase
          .from('categories')
          .update(formData)
          .eq('id', editingId)
          .eq('user_id', user.id)
      } else {
        await supabase.from('categories').insert([
          {
            user_id: user.id,
            ...formData,
          },
        ])
      }

      setFormData({ name: '', icon: '📁', color: '#f97316', type: 'expense' })
      setEditingId(null)
      setShowForm(false)
      fetchCategories()
    } catch (error) {
      console.error('Error saving category:', error)
    }
  }

  const handleDelete = async (id: string) => {
    if (!user || !confirm('Delete this category?')) return

    try {
      await supabase
        .from('categories')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)

      fetchCategories()
    } catch (error) {
      console.error('Error deleting category:', error)
    }
  }

  const handleEdit = (cat: Category) => {
    setEditingId(cat.id)
    setFormData({
      name: cat.name,
      icon: cat.icon,
      color: cat.color,
      type: cat.type,
    })
    setShowForm(true)
  }

  const expenseCategories = categories.filter((c) => c.type === 'expense')
  const incomeCategories = categories.filter((c) => c.type === 'income')

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-white">Categories</h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center space-x-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg transition"
          >
            <Plus className="w-5 h-5" />
            <span>Add Category</span>
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-8">
            <h2 className="text-lg font-semibold text-white mb-4">
              {editingId ? 'Edit Category' : 'New Category'}
            </h2>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Food, Transport, etc."
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Icon</label>
                <div className="flex flex-wrap gap-2">
                  {DEFAULT_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setFormData({ ...formData, icon: emoji })}
                      className={`text-2xl p-2 rounded ${
                        formData.icon === emoji
                          ? 'bg-primary-600'
                          : 'bg-slate-700 hover:bg-slate-600'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Color</label>
                <input
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-full h-10 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Type</label>
                <select
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({ ...formData, type: e.target.value as 'expense' | 'income' })
                  }
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </div>

              <div className="md:col-span-2 flex space-x-2">
                <button
                  type="submit"
                  className="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 rounded-lg transition"
                >
                  {editingId ? 'Update' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false)
                    setEditingId(null)
                    setFormData({ name: '', icon: '📁', color: '#f97316', type: 'expense' })
                  }}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 rounded-lg transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Categories Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-slate-800 rounded-lg animate-pulse"></div>
            ))}
          </div>
        ) : categories.length === 0 ? (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
            <p className="text-slate-400">No categories yet</p>
          </div>
        ) : (
          <>
            {expenseCategories.length > 0 && (
              <>
                <h2 className="text-lg font-semibold text-white mb-4">Expenses</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                  {expenseCategories.map((cat) => (
                    <div
                      key={cat.id}
                      className="bg-slate-800 border border-slate-700 rounded-lg p-4 hover:border-primary-500 transition"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-3">
                          <span className="text-3xl">{cat.icon}</span>
                          <div>
                            <p className="text-white font-medium">{cat.name}</p>
                            <p className="text-slate-400 text-xs">Expense</p>
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleEdit(cat)}
                            className="text-slate-400 hover:text-primary-500 transition"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(cat.id)}
                            className="text-slate-400 hover:text-red-500 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {incomeCategories.length > 0 && (
              <>
                <h2 className="text-lg font-semibold text-white mb-4">Income</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {incomeCategories.map((cat) => (
                    <div
                      key={cat.id}
                      className="bg-slate-800 border border-slate-700 rounded-lg p-4 hover:border-green-500 transition"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-3">
                          <span className="text-3xl">{cat.icon}</span>
                          <div>
                            <p className="text-white font-medium">{cat.name}</p>
                            <p className="text-green-400 text-xs">Income</p>
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleEdit(cat)}
                            className="text-slate-400 hover:text-primary-500 transition"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(cat.id)}
                            className="text-slate-400 hover:text-red-500 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
