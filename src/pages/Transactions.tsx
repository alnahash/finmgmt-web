import { useContext, useEffect, useState, useMemo } from 'react'
import { AuthContext } from '../App'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, Edit2, Filter, X, Upload, Grid3x3, List as ListIcon, Table2, Calendar, BarChart3, CheckCircle2, Circle } from 'lucide-react'

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
  const [view, setView] = useState<'list' | 'card' | 'table' | 'calendar' | 'stats'>('table')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [userCurrency, setUserCurrency] = useState('BHD')
  const [categorySearch, setCategorySearch] = useState('')
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteProgress, setDeleteProgress] = useState(0)
  const [deleteTotal, setDeleteTotal] = useState(0)
  const [monthStartDay, setMonthStartDay] = useState(1)

  useEffect(() => {
    fetchData()
  }, [user])

  // Close category dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-category-dropdown]')) {
        setShowCategoryDropdown(false)
      }
    }

    if (showCategoryDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showCategoryDropdown])

  const fetchData = async () => {
    if (!user) return
    setLoading(true)

    try {
      // Fetch user currency and month start day preferences
      const { data: profile } = await supabase
        .from('profiles')
        .select('currency, month_start_day')
        .eq('id', user.id)
        .single()
      if (profile?.currency) setUserCurrency(profile.currency)
      if (profile?.month_start_day) setMonthStartDay(profile.month_start_day)

      // Fetch categories with parent info
      const { data: cats } = await supabase
        .from('categories')
        .select('id, name, icon, parent_id')
        .eq('user_id', user.id)

      const catMap = new Map()
      cats?.forEach((cat) => catMap.set(cat.id, cat))
      setCategories(catMap)

      // Helper to get full category name (Main / Sub)
      const getFullCategoryName = (catId: string) => {
        const cat = catMap.get(catId)
        if (!cat) return 'Uncategorized'

        if (cat.parent_id) {
          const parent = catMap.get(cat.parent_id)
          return parent ? `${parent.name} / ${cat.name}` : cat.name
        }
        return cat.name
      }

      // Fetch transactions
      const { data: txns } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('transaction_date', { ascending: false })

      const enriched = txns?.map((t) => ({
        ...t,
        category_name: getFullCategoryName(t.category_id),
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
      const isEditing = !!editingId
      const transactionIdToScroll = editingId

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
      setCategorySearch('')
      setEditingId(null)
      setShowForm(false)
      await fetchData()

      // Scroll to the edited transaction after data is refreshed
      if (isEditing && transactionIdToScroll) {
        setTimeout(() => {
          const element = document.querySelector(`[data-transaction-id="${transactionIdToScroll}"]`)
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' })
            // Highlight the edited transaction briefly
            element.classList.add('ring-2', 'ring-primary-500', 'ring-opacity-50')
            setTimeout(() => {
              element.classList.remove('ring-2', 'ring-primary-500', 'ring-opacity-50')
            }, 2000)
          }
        }, 100)
      }
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
      const txnMonthPeriod = getMonthPeriodKey(t.transaction_date)
      if (txnMonthPeriod !== filterMonth) return false
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

  // Helper to get the month period key for a transaction date
  // Returns format like "202404-25" meaning the period starting on the 25th
  const getMonthPeriodKey = (dateStr: string): string => {
    const date = new Date(dateStr)
    const year = date.getFullYear()
    let month = date.getMonth() + 1
    const day = date.getDate()

    // If the day is before the month start day, it belongs to the previous month's period
    if (day < monthStartDay) {
      month = month === 1 ? 12 : month - 1
    }

    return `${year}${String(month).padStart(2, '0')}-${monthStartDay}`
  }

  // Helper to get the period label (e.g., "Apr 25 - May 24")
  const getPeriodLabel = (periodKey: string): string => {
    if (!periodKey) return ''
    const [yearMonth, startDay] = periodKey.split('-')
    const year = parseInt(yearMonth.substring(0, 4))
    const month = parseInt(yearMonth.substring(4, 6))

    const startDate = new Date(year, month - 1, parseInt(startDay))
    let endDate = new Date(year, month, parseInt(startDay) - 1)

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const startLabel = `${months[startDate.getMonth()]} ${startDate.getDate()}`
    const endLabel = `${months[endDate.getMonth()]} ${endDate.getDate()}`

    return `${startLabel} - ${endLabel}`
  }

  // Get unique month periods from transactions
  const getMonthPeriodOptions = () => {
    // Use a Map for absolute deduplication by key string
    const periodMap = new Map<string, boolean>()

    transactions.forEach((t) => {
      if (!t.transaction_date) return
      const key = getMonthPeriodKey(t.transaction_date)
      if (key) {
        periodMap.set(key, true)
      }
    })

    // Get unique keys and sort
    const uniquePeriods = Array.from(periodMap.keys()).sort().reverse()
    return uniquePeriods
  }

  const clearAllFilters = () => {
    setFilterDate('')
    setFilterYear('')
    setFilterMonth('')
    setFilterCategory('')
    setSelectedIds(new Set())
  }

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: userCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 3,
    }).format(amount)

  // Fuzzy search helper - calculates match score for smarter category search
  const getFuzzyScore = (text: string, query: string): number => {
    const lowerText = text.toLowerCase()
    const lowerQuery = query.toLowerCase()

    // Exact match - highest score
    if (lowerText === lowerQuery) return 1000

    // Starts with query - very high score
    if (lowerText.startsWith(lowerQuery)) return 500

    // Contains query as complete word - high score
    if (lowerText.split(/\s+/).some(word => word.startsWith(lowerQuery))) return 300

    // Levenshtein-inspired fuzzy matching
    let score = 0
    let textIdx = 0
    let queryIdx = 0

    while (queryIdx < lowerQuery.length && textIdx < lowerText.length) {
      if (lowerQuery[queryIdx] === lowerText[textIdx]) {
        score += 10
        queryIdx++
      }
      textIdx++
    }

    // Penalty for unmatched query characters
    const unmatchedChars = lowerQuery.length - queryIdx
    score -= unmatchedChars * 5

    return Math.max(0, score)
  }

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const selectAll = () => {
    setSelectedIds(new Set(filteredTransactions.map(t => t.id)))
  }

  const deselectAll = () => {
    setSelectedIds(new Set())
  }

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`Delete ${selectedIds.size} transaction(s)?`)) return

    setDeleting(true)
    setDeleteTotal(selectedIds.size)
    setDeleteProgress(0)

    try {
      let deleted = 0
      for (const id of selectedIds) {
        await supabase.from('transactions').delete().eq('id', id).eq('user_id', user?.id)
        deleted++
        setDeleteProgress(deleted)
      }
      setSelectedIds(new Set())
      setTimeout(() => {
        setDeleting(false)
        setDeleteProgress(0)
        setDeleteTotal(0)
        fetchData()
      }, 500)
    } catch (error) {
      console.error('Error deleting transactions:', error)
      setDeleting(false)
      setDeleteProgress(0)
      setDeleteTotal(0)
    }
  }

  const fetchExchangeRates = async () => {
    try {
      // open.er-api.com — free, no API key required
      const response = await fetch('https://open.er-api.com/v6/latest/BHD')
      const data = await response.json()
      if (data.result === 'success' && data.rates) {
        // data.rates gives "1 BHD = X currency", so invert to get "1 currency = X BHD"
        setCurrencyRates({
          USD: data.rates.USD ? parseFloat((1 / data.rates.USD).toFixed(6)) : 0.377,
          AED: data.rates.AED ? parseFloat((1 / data.rates.AED).toFixed(6)) : 0.103,
          BHD: 1,
        })
      } else {
        setCurrencyRates({ USD: 0.377, AED: 0.103, BHD: 1 })
      }
    } catch (error) {
      console.error('Error fetching exchange rates:', error)
      setCurrencyRates({ USD: 0.377, AED: 0.103, BHD: 1 })
    }
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

      // If any non-BHD currency detected, show currency conversion modal
      if (currencyDetected.USD || currencyDetected.AED) {
        setPendingTransactions(txns)
        await fetchExchangeRates()
        setShowCurrencyModal(true)
        return
      }

      // If only BHD detected, import with default BHD rates
      await importTransactions(txns, { USD: 0.377, AED: 0.103, BHD: 1 })
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
      // Convert amounts to BHD using proper formula
      const converted = txns.map(txn => ({
        ...txn,
        amount: txn.currency === 'BHD' ? txn.amount : txn.amount * rates[txn.currency],
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
                  <p className="text-xs text-slate-500 mt-1">Current rate: ~{currencyRates.USD.toFixed(3)}</p>
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
                  <p className="text-xs text-slate-500 mt-1">Current rate: ~{currencyRates.AED.toFixed(3)}</p>
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

        {/* Delete Progress Modal */}
        {deleting && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 max-w-md w-full mx-4">
              <h2 className="text-lg font-semibold text-white mb-4">Deleting Transactions</h2>
              <div className="mb-4">
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-slate-300">{deleteProgress} of {deleteTotal}</span>
                  <span className="text-sm text-slate-400">{Math.round((deleteProgress / deleteTotal) * 100)}%</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-primary-500 h-3 transition-all duration-300"
                    style={{ width: `${(deleteProgress / deleteTotal) * 100}%` }}
                  />
                </div>
              </div>
              <p className="text-slate-400 text-sm text-center">
                {deleteProgress === deleteTotal ? 'Completed!' : 'Please wait...'}
              </p>
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
              <label className="block text-xs font-medium text-slate-400 mb-2">Period</label>
              <select
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-300 text-sm focus:outline-none focus:border-primary-500"
              >
                <option value="">All periods</option>
                {getMonthPeriodOptions().map((periodKey) => (
                  <option key={periodKey} value={periodKey}>
                    {getPeriodLabel(periodKey)}
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

        {/* Selection Bar */}
        {filteredTransactions.length > 0 && (
          <div className="mb-6 bg-slate-800 border border-slate-700 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={selectedIds.size === filteredTransactions.length ? deselectAll : selectAll}
                className="flex items-center space-x-2 px-3 py-2 hover:bg-slate-700 rounded-lg transition text-slate-300 hover:text-white"
              >
                {selectedIds.size === filteredTransactions.length ? (
                  <CheckCircle2 className="w-5 h-5 text-primary-500" />
                ) : (
                  <Circle className="w-5 h-5" />
                )}
                <span className="text-sm font-medium">
                  {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
                </span>
              </button>
              {selectedIds.size > 0 && (
                <button
                  onClick={deleteSelected}
                  className="flex items-center space-x-2 px-3 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-300 hover:text-red-200 rounded-lg transition text-sm font-medium"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete selected</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* View Toggle */}
        {filteredTransactions.length > 0 && (
          <div className="mb-6 flex gap-2 bg-slate-800 border border-slate-700 rounded-lg p-1 overflow-x-auto">
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition whitespace-nowrap ${
                view === 'list' ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <ListIcon className="w-4 h-4" />
              List
            </button>
            <button
              onClick={() => setView('card')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition whitespace-nowrap ${
                view === 'card' ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Grid3x3 className="w-4 h-4" />
              Card
            </button>
            <button
              onClick={() => setView('table')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition whitespace-nowrap ${
                view === 'table' ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Table2 className="w-4 h-4" />
              Table
            </button>
            <button
              onClick={() => setView('calendar')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition whitespace-nowrap ${
                view === 'calendar' ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Calendar className="w-4 h-4" />
              Calendar
            </button>
            <button
              onClick={() => setView('stats')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition whitespace-nowrap ${
                view === 'stats' ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Stats
            </button>
          </div>
        )}

        {/* Transactions Display */}
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
        ) : view === 'list' ? (
          /* List View */
          <div className="space-y-2">
            {filteredTransactions.map((t) => (
              <div key={t.id} data-transaction-id={t.id} className={`bg-slate-800 border rounded-lg p-4 flex items-center justify-between hover:border-primary-500 transition ${selectedIds.has(t.id) ? 'border-primary-500 bg-primary-950' : 'border-slate-700'}`}>
                <div className="flex items-center space-x-4 flex-1">
                  <button
                    onClick={() => toggleSelect(t.id)}
                    className="text-slate-400 hover:text-primary-500 transition flex-shrink-0"
                  >
                    {selectedIds.has(t.id) ? (
                      <CheckCircle2 className="w-5 h-5 text-primary-500" />
                    ) : (
                      <Circle className="w-5 h-5" />
                    )}
                  </button>
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
                  <p className="text-white font-semibold text-lg">{formatAmount(t.amount)}</p>
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
        ) : view === 'card' ? (
          /* Card View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTransactions.map((t) => (
              <div key={t.id} data-transaction-id={t.id} className={`border rounded-lg p-4 hover:border-primary-500 transition ${selectedIds.has(t.id) ? 'border-primary-500 bg-primary-950' : 'border-slate-700 bg-slate-800'}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => toggleSelect(t.id)}
                      className="text-slate-400 hover:text-primary-500 transition"
                    >
                      {selectedIds.has(t.id) ? (
                        <CheckCircle2 className="w-5 h-5 text-primary-500" />
                      ) : (
                        <Circle className="w-5 h-5" />
                      )}
                    </button>
                    <span className="text-3xl">{t.category_icon}</span>
                  </div>
                  <p className="text-white font-bold text-lg">{formatAmount(t.amount)}</p>
                </div>
                <p className="text-white font-medium mb-1">{t.category_name}</p>
                {t.description && (
                  <p className="text-slate-400 text-sm mb-2">{t.description}</p>
                )}
                <p className="text-slate-500 text-xs mb-3">{t.transaction_date}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(t)}
                    className="flex-1 text-slate-400 hover:text-primary-500 transition text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="flex-1 text-slate-400 hover:text-red-500 transition text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : view === 'table' ? (
          /* Table View */
          <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-900 border-b border-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-center">
                      <button
                        onClick={selectedIds.size === filteredTransactions.length ? deselectAll : selectAll}
                        className="text-slate-400 hover:text-primary-500 transition"
                      >
                        {selectedIds.size === filteredTransactions.length ? (
                          <CheckCircle2 className="w-5 h-5 text-primary-500 inline" />
                        ) : (
                          <Circle className="w-5 h-5 inline" />
                        )}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Category</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Description</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Amount</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {filteredTransactions.map((t) => (
                    <tr key={t.id} data-transaction-id={t.id} className={`transition ${selectedIds.has(t.id) ? 'bg-primary-950/30' : 'hover:bg-slate-700/50'}`}>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggleSelect(t.id)}
                          className="text-slate-400 hover:text-primary-500 transition"
                        >
                          {selectedIds.has(t.id) ? (
                            <CheckCircle2 className="w-4 h-4 text-primary-500 inline" />
                          ) : (
                            <Circle className="w-4 h-4 inline" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300 whitespace-nowrap">{t.transaction_date}</td>
                      <td className="px-4 py-3 text-sm text-white">{t.category_icon} {t.category_name}</td>
                      <td className="px-4 py-3 text-sm text-slate-400">{t.description || '-'}</td>
                      <td className="px-4 py-3 text-sm text-right text-white font-semibold">{formatAmount(t.amount)}</td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          onClick={() => handleEdit(t)}
                          className="text-slate-400 hover:text-primary-500 transition"
                        >
                          <Edit2 className="w-4 h-4 inline" />
                        </button>
                        <button
                          onClick={() => handleDelete(t.id)}
                          className="text-slate-400 hover:text-red-500 transition"
                        >
                          <Trash2 className="w-4 h-4 inline" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : view === 'calendar' ? (
          /* Calendar View */
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            {Object.entries(
              filteredTransactions.reduce((acc, t) => {
                if (!acc[t.transaction_date]) acc[t.transaction_date] = []
                acc[t.transaction_date].push(t)
                return acc
              }, {} as Record<string, Transaction[]>)
            )
              .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
              .map(([date, txns]) => (
                <div key={date} className="mb-6 last:mb-0">
                  <div className="flex items-center gap-2 mb-3">
                    <Calendar className="w-5 h-5 text-primary-500" />
                    <h3 className="text-lg font-semibold text-white">
                      {new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </h3>
                    <span className="text-slate-500 text-sm ml-auto">{txns.length} transaction(s)</span>
                  </div>
                  <div className="space-y-2 pl-6 border-l-2 border-primary-500">
                    {txns.map((t) => (
                      <div key={t.id} data-transaction-id={t.id} className="flex items-center justify-between p-3 bg-slate-700/50 rounded">
                        <div className="flex items-center space-x-3 flex-1">
                          <span className="text-xl">{t.category_icon}</span>
                          <div>
                            <p className="text-white font-medium">{t.category_name}</p>
                            {t.description && (
                              <p className="text-slate-400 text-sm">{t.description}</p>
                            )}
                          </div>
                        </div>
                        <p className="text-white font-semibold">{formatAmount(t.amount)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        ) : (
          /* Stats View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
              <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">Total Transactions</p>
              <p className="text-3xl font-bold text-white">{filteredTransactions.length}</p>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
              <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">Total Spending</p>
              <p className="text-3xl font-bold text-white">{formatAmount(filteredTransactions.reduce((sum, t) => sum + t.amount, 0))}</p>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
              <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">Average Transaction</p>
              <p className="text-3xl font-bold text-white">{formatAmount(filteredTransactions.reduce((sum, t) => sum + t.amount, 0) / filteredTransactions.length)}</p>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
              <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">Highest Transaction</p>
              <p className="text-3xl font-bold text-white">{formatAmount(Math.max(...filteredTransactions.map(t => t.amount)))}</p>
            </div>

            {/* Category Breakdown */}
            <div className="lg:col-span-4 bg-slate-800 border border-slate-700 rounded-lg p-5">
              <h3 className="text-lg font-semibold text-white mb-4">Spending by Category</h3>
              <div className="space-y-3">
                {Object.entries(
                  filteredTransactions.reduce((acc, t) => {
                    if (!t.category_name) return acc
                    if (!acc[t.category_name]) acc[t.category_name] = { total: 0, icon: t.category_icon || '', count: 0 }
                    acc[t.category_name].total += t.amount
                    acc[t.category_name].count += 1
                    return acc
                  }, {} as Record<string, { total: number; icon: string; count: number }>)
                )
                  .sort(([, a], [, b]) => b.total - a.total)
                  .map(([cat, { total, icon, count }]) => {
                    const percentage = (total / filteredTransactions.reduce((sum, t) => sum + t.amount, 0)) * 100
                    return (
                      <div key={cat}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-slate-300">{icon} {cat}</span>
                          <span className="text-white font-semibold">{formatAmount(total)} ({count})</span>
                        </div>
                        <div className="w-full bg-slate-700 rounded-full h-2">
                          <div
                            className="bg-primary-500 h-2 rounded-full transition"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Transaction Form Modal - Outside max-w-6xl for proper fixed positioning */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 max-w-md w-full mx-4 max-h-screen overflow-y-auto">
            {/* Close Button */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">
                {editingId ? 'Edit Transaction' : 'New Transaction'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setEditingId(null)
                  setCategorySearch('')
                  setFormData({
                    amount: '',
                    description: '',
                    category_id: '',
                    transaction_date: new Date().toISOString().split('T')[0],
                  })
                }}
                className="text-slate-400 hover:text-white text-2xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
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

              <div data-category-dropdown>
                <label className="block text-sm font-medium text-slate-300 mb-2">Category</label>
                <div className="relative">
                  {/* Search Input */}
                  <input
                    type="text"
                    placeholder="Search and select category..."
                    value={categorySearch}
                    onChange={(e) => {
                      setCategorySearch(e.target.value)
                      setShowCategoryDropdown(true)
                    }}
                    onFocus={() => setShowCategoryDropdown(true)}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-primary-500"
                    required={!formData.category_id}
                  />

                  {/* Dropdown Results */}
                  {showCategoryDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-slate-700 border border-slate-600 rounded-lg shadow-lg z-10 max-h-60 overflow-y-auto">
                      {Array.from(categories.values())
                        .map((cat) => ({
                          cat,
                          score:
                            categorySearch === '' ? Infinity : getFuzzyScore(cat.name, categorySearch),
                        }))
                        .filter(({ score }) => score > 0 || categorySearch === '')
                        .sort(({ score: scoreA }, { score: scoreB }) => scoreB - scoreA)
                        .map(({ cat }) => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => {
                              setFormData({ ...formData, category_id: cat.id })
                              setCategorySearch(cat.name)
                              setShowCategoryDropdown(false)
                            }}
                            className={`w-full px-3 py-2 text-left hover:bg-slate-600 transition flex items-center space-x-2 ${
                              formData.category_id === cat.id ? 'bg-primary-500/20 border-l-2 border-primary-500' : ''
                            }`}
                          >
                            <span className="text-lg">{cat.icon}</span>
                            <span className="text-white">{cat.name}</span>
                            {formData.category_id === cat.id && (
                              <span className="ml-auto text-primary-500">✓</span>
                            )}
                          </button>
                        ))}
                      {Array.from(categories.values()).filter(
                        (cat) =>
                          categorySearch === '' ||
                          getFuzzyScore(cat.name, categorySearch) > 0
                      ).length === 0 && (
                        <div className="px-3 py-2 text-slate-400 text-sm">No categories found</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Display selected category */}
                {formData.category_id && (
                  <div className="mt-2 text-sm text-slate-400">
                    Selected: {Array.from(categories.values()).find((c) => c.id === formData.category_id)?.icon}{' '}
                    {Array.from(categories.values()).find((c) => c.id === formData.category_id)?.name}
                  </div>
                )}
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

              <div className="flex space-x-2 pt-4">
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
                    setCategorySearch('')
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
        </div>
      )}
    </Layout>
  )
}
