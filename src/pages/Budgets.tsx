import { useContext, useEffect, useState } from 'react'
import { AuthContext } from '../App'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, Copy, ChevronDown, ChevronUp } from 'lucide-react'
import { getCurrencySymbol, getUniquePeriodKeysByType } from '../lib/utils'

interface Budget {
  id: string
  user_id: string
  category_id: string
  amount: number
  month: number
  year: number
  created_at?: string
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
  budget?: Budget // Single budget per category (for current month)
}

interface GroupedCategory {
  mainCategory: Category | null
  subCategories: CategoryWithBudget[]
}

interface BudgetFormData {
  id?: string
  category_id?: string
  amount: string
  month?: number
  year?: number
}

export default function Budgets() {
  const { user } = useContext(AuthContext)
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [currency, setCurrency] = useState('USD')
  const [availablePeriods, setAvailablePeriods] = useState<string[]>([])

  // UI State
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null)
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
    const today = new Date()
    const currentMonth = today.getMonth() + 1
    const currentYear = today.getFullYear()

    // Get budgets for current month only
    const currentMonthBudgets = budgets.filter(
      (b) => b.month === currentMonth && b.year === currentYear
    )

    const categoryBudgetMap = new Map<string, Budget>()
    currentMonthBudgets.forEach((budget) => {
      categoryBudgetMap.set(budget.category_id, budget)
    })

    const expenseCats = categories.filter((c) => c.type !== 'income')

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
        subCategories: subs.map((subCat) => ({
          category: subCat,
          budget: categoryBudgetMap.get(subCat.id),
        })),
      }
    })
  }

  const handleEditStart = (budget: Budget) => {
    setEditingBudgetId(budget.id)
    setEditFormData({
      id: budget.id,
      category_id: budget.category_id,
      amount: String(budget.amount),
      month: budget.month,
      year: budget.year,
    })
  }

  const handleSaveBudget = async () => {
    if (!user || !editFormData.id) return

    try {
      const { error } = await supabase
        .from('budgets')
        .update({
          amount: parseFloat(String(editFormData.amount)),
        })
        .eq('id', editFormData.id)

      if (!error) {
        setEditingBudgetId(null)
        fetchData()
      } else {
        console.error('Error saving budget:', error)
        alert(`Error saving budget: ${error.message}`)
      }
    } catch (error) {
      console.error('Error saving budget:', error)
      alert(`Error saving budget: ${String(error)}`)
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
      const today = new Date()
      const month = today.getMonth() + 1 // 1-12
      const year = today.getFullYear()

      const budgetData = {
        user_id: user.id,
        category_id: categoryId,
        amount: 0,
        month,
        year,
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
    if (!user) return

    try {
      const today = new Date()
      const currentMonth = today.getMonth() + 1 // 1-12
      const currentYear = today.getFullYear()

      // Get last month's budgets
      let lastMonth = currentMonth - 1
      let lastYear = currentYear
      if (lastMonth === 0) {
        lastMonth = 12
        lastYear = currentYear - 1
      }

      const lastMonthBudgets = budgets.filter((b) => b.month === lastMonth && b.year === lastYear)

      if (lastMonthBudgets.length === 0) {
        alert('No budgets found from last month to copy')
        return
      }

      const newBudgets = lastMonthBudgets.map((b) => ({
        user_id: user.id,
        category_id: b.category_id,
        amount: b.amount,
        month: currentMonth,
        year: currentYear,
      }))

      const { error } = await supabase.from('budgets').insert(newBudgets)

      if (error) {
        console.error('Error copying budgets:', error)
        alert(`Error copying budgets: ${error.message}`)
      } else {
        alert(`Copied ${newBudgets.length} budgets from last month`)
        setShowCopyConfirm(false)
        await fetchData()
      }
    } catch (error) {
      console.error('Error copying budgets:', error)
      alert(`Error copying budgets: ${String(error)}`)
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
                This will copy all budgets from last month to the current month.
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
                      const budget = item.budget
                      const isEditing = editingBudgetId === budget?.id

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

                          {isEditing && budget ? (
                            // Edit Mode
                            <div className="flex items-center space-x-2 flex-1 max-w-sm">
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
                                onClick={() => setEditingBudgetId(null)}
                                className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded transition"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            // Display Mode
                            <div className="flex items-center space-x-3">
                              <span className="text-white font-semibold min-w-[100px]">
                                {getCurrencySymbol(currency)}
                                {budget?.amount.toFixed(2) || '0.00'}
                              </span>

                              {!budget ? (
                                <button
                                  onClick={() => handleAddBudget(item.category.id)}
                                  className="text-slate-400 hover:text-primary-500 transition flex items-center space-x-1"
                                >
                                  <Plus className="w-4 h-4" />
                                  <span>Set budget</span>
                                </button>
                              ) : (
                                <>
                                  <button
                                    onClick={() => handleEditStart(budget)}
                                    className="text-slate-400 hover:text-primary-500 transition"
                                  >
                                    ✏️
                                  </button>

                                  <button
                                    onClick={() => handleDeleteBudget(budget.id)}
                                    className="text-slate-400 hover:text-red-500 transition"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
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
