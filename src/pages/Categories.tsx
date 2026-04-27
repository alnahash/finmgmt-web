import { useContext, useEffect, useState } from 'react'
import { AuthContext } from '../App'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, Edit2, ChevronRight } from 'lucide-react'

type Frequency = 'one_off' | 'weekly' | 'monthly' | 'yearly' | 'dynamic'

interface Category {
  id: string
  name: string
  icon: string
  color: string
  type: 'expense' | 'income'
  parent_id: string | null
  frequency: Frequency | null
  archived: boolean
}

const DEFAULT_EMOJIS = ['🍔', '🚗', '🎬', '🏠', '👕', '💊', '⚽', '📚', '✈️', '💇', '🛒', '🎁']

const FREQUENCY_OPTIONS: { value: Frequency; label: string; color: string }[] = [
  { value: 'one_off',  label: 'One Off',  color: 'bg-slate-600 text-slate-200' },
  { value: 'weekly',   label: 'Weekly',   color: 'bg-blue-900 text-blue-300' },
  { value: 'monthly',  label: 'Monthly',  color: 'bg-violet-900 text-violet-300' },
  { value: 'yearly',   label: 'Yearly',   color: 'bg-amber-900 text-amber-300' },
  { value: 'dynamic',  label: 'Dynamic',  color: 'bg-green-900 text-green-300' },
]

function FreqBadge({ freq }: { freq: Frequency | null }) {
  if (!freq) return null
  const opt = FREQUENCY_OPTIONS.find(o => o.value === freq)
  if (!opt) return null
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${opt.color}`}>
      {opt.label}
    </span>
  )
}

const emptyForm = {
  name: '',
  icon: '📁',
  color: '#f97316',
  type: 'expense' as 'expense' | 'income',
  parent_id: null as string | null,
  frequency: null as Frequency | null,
}

export default function Categories() {
  const { user } = useContext(AuthContext)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState(emptyForm)

  useEffect(() => { fetchCategories() }, [user])

  const fetchCategories = async () => {
    if (!user) return
    setLoading(true)
    try {
      const { data } = await supabase
        .from('categories')
        .select('*')
        .eq('user_id', user.id)
        .order('type', { ascending: true })
        .order('parent_id', { ascending: true, nullsFirst: true })
        .order('name', { ascending: true })
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
      const payload = {
        name: formData.name,
        icon: formData.icon,
        color: formData.color,
        type: formData.type,
        parent_id: formData.parent_id || null,
        frequency: formData.frequency || null,
      }
      if (editingId) {
        await supabase.from('categories').update(payload).eq('id', editingId).eq('user_id', user.id)
      } else {
        await supabase.from('categories').insert([{ user_id: user.id, ...payload }])
      }
      setFormData(emptyForm)
      setEditingId(null)
      setShowForm(false)
      fetchCategories()
    } catch (error) {
      console.error('Error saving category:', error)
    }
  }

  const handleDelete = async (id: string) => {
    if (!user || !confirm('Delete this category and all its sub-categories?')) return
    try {
      await supabase.from('categories').delete().eq('id', id).eq('user_id', user.id)
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
      parent_id: cat.parent_id,
      frequency: cat.frequency,
    })
    setShowForm(true)
  }

  const cancelForm = () => {
    setShowForm(false)
    setEditingId(null)
    setFormData(emptyForm)
  }

  // Build hierarchy: parents first, children nested under them
  const parents = categories.filter(c => !c.parent_id)
  const childrenOf = (parentId: string) => categories.filter(c => c.parent_id === parentId)

  // Parent options for the "sub-category of" dropdown (exclude currently-editing item and its children)
  const parentOptions = categories.filter(c =>
    !c.parent_id && c.id !== editingId
  )

  const renderCard = (cat: Category, isChild = false) => {
    const children = childrenOf(cat.id)
    const accentColor = cat.type === 'income' ? 'hover:border-green-500' : 'hover:border-primary-500'
    const typeLabel = cat.type === 'income' ? 'text-green-400' : 'text-slate-400'

    return (
      <div key={cat.id}>
        <div className={`bg-slate-800 border border-slate-700 rounded-lg p-4 ${accentColor} transition ${isChild ? 'ml-6 mt-2' : ''}`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3 min-w-0">
              {isChild && <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />}
              <span className="text-2xl shrink-0">{cat.icon}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-white font-medium truncate">{cat.name}</p>
                  <FreqBadge freq={cat.frequency} />
                </div>
                <p className={`text-xs mt-0.5 ${typeLabel} capitalize`}>
                  {cat.type}{isChild ? ' · sub-category' : ''}
                </p>
              </div>
            </div>
            <div className="flex space-x-2 shrink-0 ml-2">
              <button onClick={() => handleEdit(cat)} className="text-slate-400 hover:text-primary-500 transition">
                <Edit2 className="w-4 h-4" />
              </button>
              <button onClick={() => handleDelete(cat.id)} className="text-slate-400 hover:text-red-500 transition">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        {children.map(child => renderCard(child, true))}
      </div>
    )
  }

  const expenseParents = parents.filter(c => c.type === 'expense')
  const incomeParents = parents.filter(c => c.type === 'income')

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-white">Categories</h1>
          <button
            onClick={() => { setShowForm(!showForm); if (showForm) cancelForm() }}
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

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Food, Transport, etc."
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                  required
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Type</label>
                <select
                  value={formData.type}
                  onChange={e => setFormData({ ...formData, type: e.target.value as 'expense' | 'income', parent_id: null })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </div>

              {/* Sub-category of */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Sub-category of <span className="text-slate-500">(optional)</span>
                </label>
                <select
                  value={formData.parent_id || ''}
                  onChange={e => setFormData({ ...formData, parent_id: e.target.value || null })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                >
                  <option value="">— Top-level category —</option>
                  {parentOptions
                    .filter(p => p.type === formData.type)
                    .map(p => (
                      <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
                    ))
                  }
                </select>
              </div>

              {/* Frequency */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Frequency <span className="text-slate-500">(optional)</span>
                </label>
                <select
                  value={formData.frequency || ''}
                  onChange={e => setFormData({ ...formData, frequency: (e.target.value as Frequency) || null })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                >
                  <option value="">— No frequency —</option>
                  {FREQUENCY_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* Icon */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-300 mb-2">Icon</label>
                <div className="flex flex-wrap gap-2">
                  {DEFAULT_EMOJIS.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setFormData({ ...formData, icon: emoji })}
                      className={`text-2xl p-2 rounded transition ${formData.icon === emoji ? 'bg-primary-600' : 'bg-slate-700 hover:bg-slate-600'}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Color</label>
                <input
                  type="color"
                  value={formData.color}
                  onChange={e => setFormData({ ...formData, color: e.target.value })}
                  className="w-full h-10 rounded-lg cursor-pointer"
                />
              </div>

              {/* Actions */}
              <div className="md:col-span-2 flex space-x-2">
                <button type="submit" className="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 rounded-lg transition">
                  {editingId ? 'Update' : 'Create'}
                </button>
                <button type="button" onClick={cancelForm} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 rounded-lg transition">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-20 bg-slate-800 rounded-lg animate-pulse" />)}
          </div>
        ) : categories.length === 0 ? (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center text-slate-400">
            No categories yet. Click "Add Category" to get started.
          </div>
        ) : (
          <div className="space-y-8">
            {expenseParents.length > 0 && (
              <div>
                <h2 className="text-base font-semibold text-slate-400 uppercase tracking-wide mb-3">Expenses</h2>
                <div className="space-y-3">
                  {expenseParents.map(cat => renderCard(cat))}
                </div>
              </div>
            )}
            {incomeParents.length > 0 && (
              <div>
                <h2 className="text-base font-semibold text-slate-400 uppercase tracking-wide mb-3">Income</h2>
                <div className="space-y-3">
                  {incomeParents.map(cat => renderCard(cat))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}
