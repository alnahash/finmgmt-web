import { useContext, useEffect, useState } from 'react'
import { AuthContext } from '../App'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, Edit2, Filter, X, Upload } from 'lucide-react'

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
  const [filterYear, setFilterYear] = useState('')
  const [filterMonth, setFilterMonth] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [importing, setImporting] = useState(false)
  const [showCurrencyModal, setShowCurrencyModal] = useState(false)
  const [currencyRates, setCurrencyRates] = useState({ USD: 1, AED: 1, BHD: 1 })
  const [pendingTransactions, setPendingTransactions] = useState<any[]>([])

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

  const filteredTransactions = transactions.filter((t) => {
    if (filterDate && t.transaction_date !== filterDate) return false
    if (filterYear) {
      const txnYear = new Date(t.transaction_date).getFullYear().toString()
      if (txnYear !== filterYear) return false
    }
    if (filterMonth) {
      const txnMonth = String(new Date(t.transaction_date).getMonth() + 1).padStart(2, '0')
      if (txnMonth !== filterMonth) return false
    }
    if (filterCategory && t.category_id !== filterCategory) return false
    return true
  })

  const getYearOptions = () => {
    const years = new Set<string>()
    transactions.forEach((t) => {
      years.add(new Date(t.transaction_date).getFullYear().toString())
    })
    return Array.from(years).sort((a, b) => Number(b) - Number(a))
  }

  const clearAllFilters = () => {
    setFilterDate('')
    setFilterYear('')
    setFilterMonth('')
    setFilterCategory('')
  }

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    setImporting(true)
    try {
      const text = await file.text()
      const lines = text.trim().split('\n')

      if (lines.length < 2) {
        alert('CSV file is empty')
        return
      }

      // Parse header
      const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
      const dateIdx = header.findIndex(h => h.toLowerCase() === 'date')
      const amountIdx = header.findIndex(h => h.toLowerCase() === 'amount')
      const descIdx = header.findIndex(h => h.toLowerCase() === 'description')
      const catIdx = header.findIndex(h => h.toLowerCase() === 'category')
      const detailsIdx = header.findIndex(h => h.toLowerCase().includes('detail'))

      if (dateIdx === -1 || amountIdx === -1 || descIdx === -1) {
        alert('CSV must have Date, Amount, and Description columns')
        return
      }

      // Parse transactions and detect currencies
      const txns = []
      const currencyDetected = { USD: false, AED: false, BHD: true }

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue

        const cells = lines[i].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
          .map(c => c.trim().replace(/^"|"$/g, ''))

        const dateStr = cells[dateIdx]
        const amountStr = cells[amountIdx]
        const desc = cells[descIdx]
        const cat = catIdx !== -1 ? cells[catIdx] : null
        const details = detailsIdx !== -1 ? cells[detailsIdx] : ''

        // Detect currency from details or description
        let currency = 'BHD'
        if (details.includes('USD') || desc.includes('USD')) currency = 'USD'
        else if (details.includes('AED') || desc.includes('AED')) currency = 'AED'

        if (currency === 'USD') currencyDetected.USD = true
        if (currency === 'AED') currencyDetected.AED = true

        // Parse date
        let date = new Date()
        if (dateStr.includes('/')) {
          const [d, m, y] = dateStr.split('/')
          date = new Date(`${y}-${m}-${d}`)
        } else {
          date = new Date(dateStr)
        }

        const amount = parseFloat(amountStr)
        if (isNaN(amount) || !desc) continue

        // Find matching category
        let categoryId = null
        if (cat) {
          const matching = Array.from(categories.values()).find(
            c => c.name.toLowerCase().includes(cat.toLowerCase())
          )
          if (matching) categoryId = matching.id
        }

        // Use first category if none found
        if (!categoryId) {
          const first = categories.values().next().value
          categoryId = first?.id
        }

        if (!categoryId) {
          alert('No categories found. Please create a category first.')
          return
        }

        txns.push({
          user_id: user.id,
          amount: Math.abs(amount),
          description: desc,
          category_id: categoryId,
          transaction_date: date.toISOString().split('T')[0],
          currency: currency,
        })
      }

      if (txns.length === 0) {
        alert('No valid transactions found in CSV')
        return
      }

      // If multi-currency detected, show currency conversion modal
      if (currencyDetected.USD || currencyDetected.AED) {
        setPendingTransactions(txns)
        setShowCurrencyModal(true)
        return
      }

      // Otherwise import directly
      await importTransactions(txns, currencyRates)
    } catch (error) {
      console.error('Error importing CSV:', error)
      alert('Error importing CSV. Please check the file format.')
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  const importTransactions = async (txns: any[], rates: any) => {
    try {
      // Convert amounts to BHD
      const converted = txns.map(txn => ({
        ...txn,
        amount: txn.currency === 'BHD' ? txn.amount : txn.amount / rates[txn.currency],
      }))

      // Remove currency field before inserting
      const toInsert = converted.map(({ currency, ...rest }) => rest)

      // Insert in batches of 100
      for (let i = 0; i < toInsert.length; i += 100) {
        const batch = toInsert.slice(i, i + 100)
        const { error } = await supabase.from('transactions').insert(batch)
        if (error) throw error
      }

      alert(`Successfully imported ${toInsert.length} transactions (converted to BHD)!`)
      fetchData()
      setPendingTransactions([])
      setShowCurrencyModal(false)
    } catch (error) {
      console.error('Error importing transactions:', error)
      alert('Error importing transactions.')
    }
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-white">Transactions</h1>
          <div className="flex gap-2">
            <label className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg transition text-sm cursor-pointer">
              <Upload className="w-4 h-4" />
              {importing ? 'Importing...' : 'Import CSV'}
              <input
                type="file"
                accept=".csv"
                onChange={handleImportCSV}
                disabled={importing}
                className="hidden"
              />
            </label>
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center space-x-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg transition"
            >
              <Plus className="w-5 h-5" />
              <span>Add Transaction</span>
            </button>
          </div>
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

        {/* Currency Conversion Modal */}
        {showCurrencyModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 max-w-md w-full mx-4">
              <h2 className="text-lg font-semibold text-white mb-4">Convert Currencies to BHD</h2>
              <p className="text-slate-400 text-sm mb-4">Your CSV contains multiple currencies. Set exchange rates to convert to BHD:</p>

              <div className="space-y-3 mb-6">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">1 USD = ? BHD</label>
                  <input
                    type="number"
                    step="0.001"
                    value={currencyRates.USD}
                    onChange={(e) => setCurrencyRates({ ...currencyRates, USD: parseFloat(e.target.value) || 1 })}
                    placeholder="0.377"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                  />
                  <p className="text-xs text-slate-500 mt-1">Current rate: ~0.377</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">1 AED = ? BHD</label>
                  <input
                    type="number"
                    step="0.001"
                    value={currencyRates.AED}
                    onChange={(e) => setCurrencyRates({ ...currencyRates, AED: parseFloat(e.target.value) || 1 })}
                    placeholder="0.103"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                  />
                  <p className="text-xs text-slate-500 mt-1">Current rate: ~0.103</p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => importTransactions(pendingTransactions, currencyRates)}
                  className="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 rounded-lg transition"
                >
                  Import & Convert
                </button>
                <button
                  onClick={() => {
                    setShowCurrencyModal(false)
                    setPendingTransactions([])
                  }}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 rounded-lg transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Filter */}
        <div className="mb-6 bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center space-x-3 mb-4">
            <Filter className="w-5 h-5 text-slate-400" />
            <h3 className="text-sm font-medium text-slate-300">Filters</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2">Year</label>
              <select
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-300 text-sm focus:outline-none focus:border-primary-500"
              >
                <option value="">All years</option>
                {getYearOptions().map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2">Month</label>
              <select
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-300 text-sm focus:outline-none focus:border-primary-500"
              >
                <option value="">All months</option>
                {[
                  { val: '01', label: 'January' },
                  { val: '02', label: 'February' },
                  { val: '03', label: 'March' },
                  { val: '04', label: 'April' },
                  { val: '05', label: 'May' },
                  { val: '06', label: 'June' },
                  { val: '07', label: 'July' },
                  { val: '08', label: 'August' },
                  { val: '09', label: 'September' },
                  { val: '10', label: 'October' },
                  { val: '11', label: 'November' },
                  { val: '12', label: 'December' },
                ].map(({ val, label }) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2">Category</label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-300 text-sm focus:outline-none focus:border-primary-500"
              >
                <option value="">All categories</option>
                {Array.from(categories.values()).map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.icon} {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2">Date</label>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-300 text-sm focus:outline-none focus:border-primary-500"
              />
            </div>
          </div>

          {(filterDate || filterYear || filterMonth || filterCategory) && (
            <button
              onClick={clearAllFilters}
              className="mt-4 flex items-center space-x-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white text-sm rounded-lg transition"
            >
              <X className="w-4 h-4" />
              <span>Clear all filters</span>
            </button>
          )}
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
