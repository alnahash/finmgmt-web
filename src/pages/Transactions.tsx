import { useContext, useEffect, useState } from 'react'
import { AuthContext } from '../App'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, Edit2, Filter } from 'lucide-react'

interface Transaction {
  id: string
  category_id: string
  amount: number
  description: string
  transaction_date: string
  created_at: string
  category_name?: string
  category_icon?: string
}

interface Category {
  id: string
  name: string
  icon: string
}

export default function Transactions() {
  const { user } = useContext(AuthContext)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Map<string, Category>>(new Map())
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    amount: '',
    description: '',
    category_id: '',
    transaction_date: new Date().toISOString().split('T')[0],
  })
  const [filterDate, setFilterDate] = useState('')

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

      // Fetch transactions
      const { data: txns } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('transaction_date', { ascending: false })

      const enriched = txns?.map((t) => ({
        ...t,
        category_name: catMap.get(t.category_id)?.name || 'Uncategorized',
        category_icon: catMap.get(t.category_id)?.icon || '📁',
      })) || []

      setTransactions(enriched)
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
      if (editingId) {
        // Update
        await supabase
          .from('transactions')
          .update({
            amount: parseFloat(formData.amount),
            description: formData.description,
            category_id: formData.category_id,
            transaction_date: formData.transaction_date,
          })
          .eq('id', editingId)
          .eq('user_id', user.id)
      } else {
        // Insert
        await supabase.from('transactions').insert([
          {
            user_id: user.id,
            amount: parseFloat(formData.amount),
            description: formData.description,
            category_id: formData.category_id,
            transaction_date: formData.transaction_date,
          },
        ])
      }

      setFormData({
        amount: '',
        description: '',
        category_id: '',
        transaction_date: new Date().toISOString().split('T')[0],
      })
      setEditingId(null)
      setShowForm(false)
      fetchData()
    } catch (error) {
      console.error('Error saving transaction:', error)
    }
  }

  const handleDelete = async (id: string) => {
    if (!user || !confirm('Delete this transaction?')) return

    try {
      await supabase
        .from('transactions')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)

      fetchData()
    } catch (error) {
      console.error('Error deleting transaction:', error)
    }
  }

  const handleEdit = (t: Transaction) => {
    setEditingId(t.id)
    setFormData({
      amount: t.amount.toString(),
      description: t.description,
      category_id: t.category_id,
      transaction_date: t.transaction_date,
    })
    setShowForm(true)
  }

  const filteredTransactions = filterDate
    ? transactions.filter((t) => t.transaction_date === filterDate)
    : transactions

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-white">Transactions</h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center space-x-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg transition"
          >
            <Plus className="w-5 h-5" />
            <span>Add Transaction</span>
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-8">
            <h2 className="text-lg font-semibold text-white mb-4">
              {editingId ? 'Edit Transaction' : 'New Transaction'}
            </h2>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Date</label>
                <input
                  type="date"
                  value={formData.transaction_date}
                  onChange={(e) =>
                    setFormData({ ...formData, transaction_date: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                />
              </div>

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
                <label className="block text-sm font-medium text-slate-300 mb-2">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Optional notes"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                />
              </div>

              <div className="md:col-span-2 flex space-x-2">
                <button
                  type="submit"
                  className="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 rounded-lg transition"
                >
                  {editingId ? 'Update' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false)
                    setEditingId(null)
                    setFormData({
                      amount: '',
                      description: '',
                      category_id: '',
                      transaction_date: new Date().toISOString().split('T')[0],
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

        {/* Filter */}
        <div className="mb-6">
          <div className="flex items-center space-x-2">
            <Filter className="w-5 h-5 text-slate-400" />
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 focus:outline-none focus:border-primary-500"
            />
            {filterDate && (
              <button
                onClick={() => setFilterDate('')}
                className="text-slate-400 hover:text-white text-sm"
              >
                Clear filter
              </button>
            )}
          </div>
        </div>

        {/* Transactions List */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-slate-800 rounded-lg animate-pulse"></div>
            ))}
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
            <p className="text-slate-400">No transactions yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTransactions.map((t) => (
              <div key={t.id} className="bg-slate-800 border border-slate-700 rounded-lg p-4 flex items-center justify-between hover:border-primary-500 transition">
                <div className="flex items-center space-x-4 flex-1">
                  <span className="text-2xl">{t.category_icon}</span>
                  <div>
                    <p className="text-white font-medium">{t.category_name}</p>
                    {t.description && (
                      <p className="text-slate-400 text-sm">{t.description}</p>
                    )}
                    <p className="text-slate-500 text-xs">{t.transaction_date}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <p className="text-white font-semibold text-lg">${t.amount.toFixed(2)}</p>
                  <button
                    onClick={() => handleEdit(t)}
                    className="text-slate-400 hover:text-primary-500 transition"
                  >
                    <Edit2 className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
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
