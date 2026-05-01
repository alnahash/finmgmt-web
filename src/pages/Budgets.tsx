import { useContext, useEffect, useState } from 'react'
import { AuthContext } from '../App'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, Copy, ChevronDown, ChevronUp } from 'lucide-react'
import { getCurrencySymbol, getUniquePeriodKeysByType } from '../lib/utils'

interface Budget {
  id: string
  category_id: string
  amount: number
  month_period_key: string
  is_recurring: boolean
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
}

interface Category {
  id: string
  name: string
  icon: string
  type?: string
  parent_id?: string | null
}

interface Profile {
  month_start_day: number
  currency: string
}

interface CategoryWithBudget {
  category: Category
  budgets: Map<string, Budget> // Map by frequency
}

interface GroupedCategory {
  mainCategory: Category | null
  subCategories: CategoryWithBudget[]
}

interface BudgetFormData {
  id?: string
  category_id?: string
  amount: string
  month_period_key?: string
  is_recurring?: boolean
  frequency?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
}

const FREQUENCY_COLORS: Record<string, string> = {
  daily: '#f97316', // orange
  weekly: '#10b981', // green
  monthly: '#3b82f6', // blue
  quarterly: '#06b6d4', // cyan
  yearly: '#a855f7', // purple
}

export default function Budgets() {
  const { user } = useContext(AuthContext)
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [currency, setCurrency] = useState('USD')
  const [availablePeriods, setAvailablePeriods] = useState<string[]>([])

  // UI State
  const [frequencyFilter, setFrequencyFilter] = useState('all')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [editingCategory, setEditingCategory] = useState<string | null>(null)
  const [editFormData, setEditFormData] = useState<BudgetFormData>({ amount: '' })
  const [showCopyConfirm, setShowCopyConfirm] = useState(false)

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const fetchData = async () => {
    if (!user) return
    setLoading(true)

    try {
      // Fetch profile
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
        .select('id, name, icon, type, parent_id')
        .eq('user_id', user.id)
        .order('parent_id', { ascending: true, nullsFirst: true })
        .order('name', { ascending: true })

      setCategories(cats || [])

      // Fetch all transactions to generate available periods
      const { data: transactions } = await supabase
        .from('transactions')
        .select('transaction_date')
        .eq('user_id', user.id)

      if (transactions && transactions.length > 0) {
        const txnDates = transactions.map((t) => t.transaction_date)
        const generatedPeriods = getUniquePeriodKeysByType(txnDates, 'monthly', startDay)
        setAvailablePeriods(generatedPeriods)
      }

      // Fetch budgets
      const { data: budgs, error: budgError } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_id', user.id)

      if (budgError) {
        console.error('Error fetching budgets:', budgError)
      } else {
        console.log('Fetched budgets:', budgs)
      }

      setBudgets(budgs || [])
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const groupBudgetsByCategory = (): GroupedCategory[] => {
    const expenseCats = categories.filter((c) => c.type !== 'income')
    const categoryBudgetMap = new Map<string, Budget[]>()

    budgets.forEach((budget) => {
      if (!categoryBudgetMap.has(budget.category_id)) {
        categoryBudgetMap.set(budget.category_id, [])
      }
      categoryBudgetMap.get(budget.category_id)!.push(budget)
    })

    // Group by main category
    const mainCategories = expenseCats.filter((c) => !c.parent_id || c.parent_id === c.id)
    const subCategoryMap = new Map<string, Category[]>()

    expenseCats.forEach((c) => {
      if (c.parent_id && c.parent_id !== c.id) {
        if (!subCategoryMap.has(c.parent_id)) {
          subCategoryMap.set(c.parent_id, [])
        }
        subCategoryMap.get(c.parent_id)!.push(c)
      }
    })

    return mainCategories.map((mainCat) => {
      const subs = subCategoryMap.get(mainCat.id) || [mainCat]

      return {
        mainCategory: mainCat,
        subCategories: subs.map((subCat) => {
          const catBudgets = categoryBudgetMap.get(subCat.id) || []
          const budgetMap = new Map<string, Budget>()
          catBudgets.forEach((b) => {
            budgetMap.set(b.frequency, b)
          })
          return {
            category: subCat,
            budgets: budgetMap,
          }
        }),
      }
    })
  }

  const shouldShowBudget = (budget: Budget): boolean => {
    if (frequencyFilter === 'all') return true
    if (frequencyFilter === 'one-off') return budget.is_recurring === false
    return budget.frequency === frequencyFilter && budget.is_recurring === true
  }

  const getFrequencyDisplay = (budget?: Budget): { label: string; color: string } => {
    if (!budget) return { label: 'NA', color: '#94a3b8' }
    if (!budget.is_recurring) return { label: 'One Off', color: '#64748b' }
    const label = budget.frequency.charAt(0).toUpperCase() + budget.frequency.slice(1)
    return { label, color: FREQUENCY_COLORS[budget.frequency] || '#94a3b8' }
  }

  const handleEditStart = (budget: Budget) => {
    setEditingCategory(budget.category_id)
    setEditFormData({
      ...budget,
      amount: String(budget.amount),
    })
  }

  const handleSaveBudget = async () => {
    if (!user || !editFormData.id) return

    try {
      const { error } = await supabase
        .from('budgets')
        .update({
          amount: parseFloat(String(editFormData.amount)),
          frequency: editFormData.frequency,
          is_recurring: editFormData.is_recurring,
          month_period_key: editFormData.month_period_key,
        })
        .eq('id', editFormData.id)

      if (!error) {
        setEditingCategory(null)
        fetchData()
      }
    } catch (error) {
      console.error('Error saving budget:', error)
    }
  }

  const handleDeleteBudget = async (budgetId: string) => {
    if (!user || !confirm('Delete this budget?')) return

    try {
      await supabase.from('budgets').delete().eq('id', budgetId).eq('user_id', user.id)
      fetchData()
    } catch (error) {
      console.error('Error deleting budget:', error)
    }
  }

  const handleAddBudget = async (categoryId: string) => {
    if (!user) {
      console.error('No user found')
      alert('No user found. Please log in.')
      return
    }

    try {
      // Use simple period key for testing
      const periodKey = '202405-01'

      const budgetData = {
        user_id: user.id,
        category_id: categoryId,
        amount: 0,
        month_period_key: periodKey,
        is_recurring: true,
        frequency: 'monthly',
      }

      console.log('Creating budget with data:', budgetData)

      const { data, error } = await supabase.from('budgets').insert([budgetData]).select()

      if (error) {
        console.error('Supabase error:', error.code, error.message, error.details)
        alert(`Budget creation failed:\n\nCode: ${error.code}\nMessage: ${error.message}\nDetails: ${error.details || 'None'}`)
        return
      }

      console.log('Budget created successfully:', data)
      alert('Budget created! Refreshing...')
      await fetchData()
    } catch (error) {
      console.error('Unexpected error:', error)
      alert(`Unexpected error: ${String(error)}`)
    }
  }

  const handleCopyFromLastMonth = async () => {
    if (!user || availablePeriods.length < 2) return

    try {
      const lastPeriod = availablePeriods[1]
      const currentPeriod = availablePeriods[0]
      const lastPeriodBudgets = budgets.filter((b) => b.month_period_key === lastPeriod)

      const newBudgets = lastPeriodBudgets
        .filter((b) => b.is_recurring)
        .map((b) => ({
          user_id: user.id,
          category_id: b.category_id,
          amount: b.amount,
          month_period_key: currentPeriod,
          is_recurring: b.is_recurring,
          frequency: b.frequency,
        }))

      if (newBudgets.length > 0) {
        await supabase.from('budgets').insert(newBudgets)
        setShowCopyConfirm(false)
        fetchData()
      }
    } catch (error) {
      console.error('Error copying budgets:', error)
    }
  }

  const toggleGroup = (groupId: string) => {
    const newExpanded = new Set(expandedGroups)
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId)
    } else {
      newExpanded.add(groupId)
    }
    setExpandedGroups(newExpanded)
  }

  const grouped = groupBudgetsByCategory()

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-white">Budgets</h1>
          {availablePeriods.length > 1 && (
            <button
              onClick={() => setShowCopyConfirm(true)}
              className="flex items-center space-x-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition"
            >
              <Copy className="w-5 h-5" />
              <span>Copy from last month</span>
            </button>
          )}
        </div>

        {/* Copy Confirmation Modal */}
        {showCopyConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 max-w-md">
              <h2 className="text-lg font-semibold text-white mb-4">Copy budgets?</h2>
              <p className="text-slate-300 mb-6">
                This will copy all recurring budgets from last month to the current month.
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={handleCopyFromLastMonth}
                  className="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 rounded-lg transition"
                >
                  Copy
                </button>
                <button
                  onClick={() => setShowCopyConfirm(false)}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 rounded-lg transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Frequency Filter Tabs */}
        <div className="flex space-x-2 mb-6 overflow-x-auto pb-2">
          {['all', 'monthly', 'yearly', 'weekly', 'daily', 'quarterly', 'one-off'].map((freq) => (
            <button
              key={freq}
              onClick={() => setFrequencyFilter(freq)}
              className={`px-4 py-2 rounded-full whitespace-nowrap font-medium transition ${
                frequencyFilter === freq
                  ? 'bg-primary-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {freq === 'one-off' ? 'One Off' : freq.charAt(0).toUpperCase() + freq.slice(1)}
            </button>
          ))}
        </div>

        {/* Categories List */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-slate-800 rounded-lg animate-pulse"></div>
            ))}
          </div>
        ) : categories.length === 0 ? (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
            <p className="text-slate-400">No expense categories found. Create categories first in the Categories tab.</p>
          </div>
        ) : grouped.length === 0 ? (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
            <p className="text-slate-400">No budgets set yet. Click on a category below to set a budget.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map((group) => (
              <div key={group.mainCategory?.id} className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                {/* Group Header */}
                <button
                  onClick={() => toggleGroup(group.mainCategory?.id || '')}
                  className="w-full flex items-center justify-between p-4 hover:bg-slate-700/50 transition"
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">{group.mainCategory?.icon}</span>
                    <span className="text-white font-semibold uppercase text-sm">
                      {group.mainCategory?.name}
                    </span>
                    <span className="text-slate-400 text-sm">({group.subCategories.length})</span>
                  </div>
                  {expandedGroups.has(group.mainCategory?.id || '') ? (
                    <ChevronUp className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  )}
                </button>

                {/* Group Items */}
                {expandedGroups.has(group.mainCategory?.id || '') && (
                  <div className="border-t border-slate-700">
                    {group.subCategories.map((item, idx) => {
                      const currentBudget = Array.from(item.budgets.values()).find((b) =>
                        shouldShowBudget(b)
                      )
                      const hasAnyBudget = item.budgets.size > 0
                      const freqDisplay = getFrequencyDisplay(currentBudget)
                      const isEditing = editingCategory === item.category.id

                      return (
                        <div
                          key={item.category.id}
                          className={`flex items-center justify-between p-4 ${
                            idx !== group.subCategories.length - 1 ? 'border-b border-slate-700' : ''
                          }`}
                        >
                          <div className="flex items-center space-x-3 flex-1">
                            <span className="text-2xl">{item.category.icon}</span>
                            <span className="text-white font-medium">{item.category.name}</span>
                          </div>

                          {isEditing ? (
                            // Edit Mode
                            <div className="flex items-center space-x-2 flex-1 max-w-sm">
                              <select
                                value={editFormData.frequency || 'monthly'}
                                onChange={(e) =>
                                  setEditFormData({
                                    ...editFormData,
                                    frequency: e.target.value as 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly',
                                  })
                                }
                                className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                              >
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="monthly">Monthly</option>
                                <option value="quarterly">Quarterly</option>
                                <option value="yearly">Yearly</option>
                              </select>

                              <input
                                type="number"
                                step="0.01"
                                value={editFormData.amount || ''}
                                onChange={(e) =>
                                  setEditFormData({ ...editFormData, amount: e.target.value })
                                }
                                placeholder="0.00"
                                className="w-20 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                              />

                              <button
                                onClick={handleSaveBudget}
                                className="px-3 py-1 bg-primary-600 hover:bg-primary-700 text-white text-sm rounded transition"
                              >
                                Save
                              </button>

                              <button
                                onClick={() => setEditingCategory(null)}
                                className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded transition"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            // Display Mode
                            <>
                              <div className="flex items-center space-x-3">
                                <span
                                  className="px-2 py-0.5 text-xs font-medium rounded-full text-white"
                                  style={{ backgroundColor: freqDisplay.color }}
                                >
                                  {freqDisplay.label}
                                </span>

                                <span className="text-white font-semibold min-w-[100px]">
                                  {getCurrencySymbol(currency)}
                                  {currentBudget?.amount.toFixed(2) || '0.000'}
                                </span>

                                {!hasAnyBudget ? (
                                  <button
                                    onClick={() => handleAddBudget(item.category.id)}
                                    className="text-slate-400 hover:text-primary-500 transition flex items-center space-x-1"
                                  >
                                    <Plus className="w-4 h-4" />
                                    <span>Set budget</span>
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleEditStart(currentBudget!)}
                                    className="text-slate-400 hover:text-primary-500 transition"
                                  >
                                    ✏️
                                  </button>
                                )}

                                {currentBudget && (
                                  <button
                                    onClick={() => handleDeleteBudget(currentBudget.id)}
                                    className="text-slate-400 hover:text-red-500 transition"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
