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
  const [creatingBudgetForCategory, setCreatingBudgetForCategory] = useState<string | null>(null)
  const [editFormData, setEditFormData] = useState<BudgetFormData>({ amount: '' })
  const [showCopyConfirm, setShowCopyConfirm] = useState(false)
  const [viewMode, setViewMode] = useState<'grouped' | 'list'>('grouped')
  const [totalBudgetSet, setTotalBudgetSet] = useState(0)
  const [totalSpent, setTotalSpent] = useState(0)

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

      // Calculate total budget set and total spent this month
      const today = new Date()
      const currentMonth = today.getMonth() + 1
      const currentYear = today.getFullYear()

      const currentMonthBudgets = budgs?.filter(
        (b) => b.month === currentMonth && b.year === currentYear
      ) || []
      const totalBudget = currentMonthBudgets.reduce((sum, b) => sum + b.amount, 0)
      setTotalBudgetSet(totalBudget)

      // Fetch transactions for current month to calculate spending
      const { data: monthTransactions } = await supabase
        .from('transactions')
        .select('amount, category_id')
        .eq('user_id', user.id)
        .gte('transaction_date', `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`)
        .lte('transaction_date', `${currentYear}-${String(currentMonth).padStart(2, '0')}-31`)

      if (monthTransactions) {
        const categoryTypeMap = new Map(
          (cats || []).map((c) => [c.id, c.type || 'expense'])
        )
        const spent = (monthTransactions as Array<{amount: number; category_id: string}>).reduce((sum, t) => {
          const catType = categoryTypeMap.get(t.category_id)
          return catType === 'income' ? sum : sum + t.amount
        }, 0)
        setTotalSpent(spent)
      }
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
      const newAmount = parseFloat(String(editFormData.amount))

      const { error } = await supabase
        .from('budgets')
        .update({
          amount: newAmount,
        })
        .eq('id', editFormData.id)

      if (!error) {
        // Update local state instead of fetching all data
        const updatedBudgets = budgets.map((b) =>
          b.id === editFormData.id ? { ...b, amount: newAmount } : b
        )
        setBudgets(updatedBudgets)

        // Recalculate totals
        const today = new Date()
        const currentMonth = today.getMonth() + 1
        const currentYear = today.getFullYear()

        const currentMonthBudgets = updatedBudgets.filter(
          (b) => b.month === currentMonth && b.year === currentYear
        )
        const totalBudget = currentMonthBudgets.reduce((sum, b) => sum + b.amount, 0)
        setTotalBudgetSet(totalBudget)

        setEditingBudgetId(null)
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

  const handleAddBudget = (categoryId: string) => {
    // Switch to inline edit mode for new budget
    setCreatingBudgetForCategory(categoryId)
    setEditFormData({ amount: '', category_id: categoryId })
  }

  const handleSaveNewBudget = async (categoryId: string) => {
    if (!user) {
      console.error('No user found')
      alert('No user found. Please log in.')
      return
    }

    if (!editFormData.amount || parseFloat(editFormData.amount) < 0) {
      alert('Please enter a valid budget amount')
      return
    }

    try {
      const today = new Date()
      const month = today.getMonth() + 1 // 1-12
      const year = today.getFullYear()

      const budgetData = {
        user_id: user.id,
        category_id: categoryId,
        amount: parseFloat(editFormData.amount),
        month,
        year,
      }

      const { data, error } = await supabase.from('budgets').insert([budgetData]).select()

      if (error) {
        console.error('Supabase error:', error.code, error.message, error.details)
        alert(`Budget creation failed:\n\nCode: ${error.code}\nMessage: ${error.message}\nDetails: ${error.details || 'None'}`)
        return
      }

      // Update local state instead of fetching all data
      if (data && data.length > 0) {
        const newBudget = data[0]
        setBudgets([...budgets, newBudget])

        // Recalculate totals
        const currentMonthBudgets = [...budgets, newBudget].filter(
          (b) => b.month === month && b.year === year
        )
        const totalBudget = currentMonthBudgets.reduce((sum, b) => sum + b.amount, 0)
        setTotalBudgetSet(totalBudget)
      }

      setCreatingBudgetForCategory(null)
      setEditFormData({ amount: '' })
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

  // Check if a category is a leaf (has no children)
  const isLeafCategory = (catId: string): boolean => {
    return !categories.some((c) => c.parent_id === catId && c.parent_id !== catId)
  }

  // Calculate main category budget from subcategories
  const getMainCategoryBudget = (mainCatId: string): number => {
    const today = new Date()
    const currentMonth = today.getMonth() + 1
    const currentYear = today.getFullYear()

    const subCats = categories.filter((c) => c.parent_id === mainCatId)
    const subBudgets = budgets.filter(
      (b) => b.month === currentMonth && b.year === currentYear && subCats.some((s) => s.id === b.category_id)
    )
    return subBudgets.reduce((sum, b) => sum + b.amount, 0)
  }

  const grouped = groupBudgetsByCategory()

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-white">Budgets</h1>
          <div className="flex items-center space-x-3">
            {/* View Mode Toggle */}
            <div className="flex space-x-2 bg-slate-700 rounded-lg p-1">
              <button
                onClick={() => setViewMode('grouped')}
                className={`px-4 py-2 rounded transition font-medium text-sm ${
                  viewMode === 'grouped'
                    ? 'bg-primary-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Grouped View
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-4 py-2 rounded transition font-medium text-sm ${
                  viewMode === 'list'
                    ? 'bg-primary-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                List View
              </button>
            </div>
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

        {/* Savings Goal Tracker */}
        {!loading && categories.length > 0 && (
          <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Total Budget */}
            <div className="bg-gradient-to-br from-blue-900/30 to-blue-900/10 border border-blue-700/50 rounded-lg p-6">
              <p className="text-blue-300 text-sm font-medium uppercase tracking-wide mb-2">Monthly Budget Set</p>
              <p className="text-3xl font-bold text-white mb-2">{getCurrencySymbol(currency)}{totalBudgetSet.toFixed(2)}</p>
              <p className="text-xs text-blue-300">Your total spending plan</p>
            </div>

            {/* Total Spent */}
            <div className="bg-gradient-to-br from-orange-900/30 to-orange-900/10 border border-orange-700/50 rounded-lg p-6">
              <p className="text-orange-300 text-sm font-medium uppercase tracking-wide mb-2">Actual Spending</p>
              <p className="text-3xl font-bold text-white mb-2">{getCurrencySymbol(currency)}{totalSpent.toFixed(2)}</p>
              <p className="text-xs text-orange-300">
                {totalBudgetSet > 0
                  ? `${Math.round((totalSpent / totalBudgetSet) * 100)}% of budget`
                  : 'Set a budget to track progress'}
              </p>
            </div>

            {/* Savings Achieved */}
            <div
              className={`bg-gradient-to-br ${
                totalBudgetSet - totalSpent >= 0
                  ? 'from-green-900/30 to-green-900/10 border-green-700/50'
                  : 'from-red-900/30 to-red-900/10 border-red-700/50'
              } border rounded-lg p-6`}
            >
              <p
                className={`text-sm font-medium uppercase tracking-wide mb-2 ${
                  totalBudgetSet - totalSpent >= 0 ? 'text-green-300' : 'text-red-300'
                }`}
              >
                {totalBudgetSet - totalSpent >= 0 ? '✓ Savings Achieved' : '⚠ Over Budget'}
              </p>
              <p className="text-3xl font-bold text-white mb-2">
                {getCurrencySymbol(currency)}
                {Math.abs(totalBudgetSet - totalSpent).toFixed(2)}
              </p>
              <p
                className={`text-xs ${
                  totalBudgetSet - totalSpent >= 0 ? 'text-green-300' : 'text-red-300'
                }`}
              >
                {totalBudgetSet > 0
                  ? totalBudgetSet - totalSpent >= 0
                    ? 'You are on track! Follow the budget to achieve your savings goal.'
                    : 'You have exceeded your budget. Reduce spending to meet your goal.'
                  : 'Set subcategory budgets to start tracking'}
              </p>
            </div>
          </div>
        )}

        {/* Budget Progress Bar */}
        {!loading && totalBudgetSet > 0 && (
          <div className="mb-8 bg-slate-800 border border-slate-700 rounded-lg p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white uppercase tracking-wide">Monthly Budget Progress</h3>
              <span className={`text-sm font-bold ${totalSpent <= totalBudgetSet ? 'text-green-400' : 'text-red-400'}`}>
                {totalBudgetSet > 0 ? `${Math.round((totalSpent / totalBudgetSet) * 100)}%` : '0%'}
              </span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  totalSpent <= totalBudgetSet ? 'bg-green-500' : 'bg-red-500'
                }`}
                style={{ width: `${Math.min((totalSpent / totalBudgetSet) * 100, 100)}%` }}
              />
            </div>
            <div className="flex justify-between mt-3 text-xs text-slate-400">
              <span>Spent: {getCurrencySymbol(currency)}{totalSpent.toFixed(2)}</span>
              <span>Budget: {getCurrencySymbol(currency)}{totalBudgetSet.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Categories List - Grouped View */}
        {viewMode === 'grouped' && (
          <>
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
                  <div className="flex items-center space-x-4">
                    <span className="text-white font-semibold">
                      {getCurrencySymbol(currency)}
                      {getMainCategoryBudget(group.mainCategory?.id || '').toFixed(2)}
                    </span>
                    {expandedGroups.has(group.mainCategory?.id || '') ? (
                      <ChevronUp className="w-5 h-5 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-slate-400" />
                    )}
                  </div>
                </button>

                {/* Group Items */}
                {expandedGroups.has(group.mainCategory?.id || '') && (
                  <div className="border-t border-slate-700">
                    {group.subCategories.map((item, idx) => {
                      const isLeaf = isLeafCategory(item.category.id)
                      const budget = item.budget
                      const isEditing = editingBudgetId === budget?.id
                      const isCreating = creatingBudgetForCategory === item.category.id

                      return (
                        <div
                          key={item.category.id}
                          className={`flex items-center justify-between p-4 ${
                            idx !== group.subCategories.length - 1 ? 'border-b border-slate-700' : ''
                          } ${!isLeaf ? 'bg-slate-700/20' : ''} ${isCreating ? 'bg-primary-900/20' : ''}`}
                        >
                          <div className="flex items-center space-x-3 flex-1">
                            <span className="text-2xl">{item.category.icon}</span>
                            <div>
                              <span className="text-white font-medium">{item.category.name}</span>
                              {!isLeaf && (
                                <p className="text-xs text-slate-400 mt-0.5">
                                  Main category - Set budgets on subcategories
                                </p>
                              )}
                            </div>
                          </div>

                          {isEditing && budget && isLeaf ? (
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
                          ) : isCreating && isLeaf ? (
                            // Create Mode (Inline)
                            <div className="flex items-center space-x-2 flex-1 max-w-sm">
                              <input
                                type="number"
                                step="0.01"
                                value={editFormData.amount || ''}
                                onChange={(e) =>
                                  setEditFormData({ ...editFormData, amount: e.target.value })
                                }
                                placeholder="Enter amount"
                                autoFocus
                                className="w-20 px-2 py-1 bg-primary-700 border border-primary-600 rounded text-white text-sm font-semibold"
                              />

                              <button
                                onClick={() => handleSaveNewBudget(item.category.id)}
                                className="px-3 py-1 bg-primary-600 hover:bg-primary-700 text-white text-sm rounded transition font-semibold"
                              >
                                Save
                              </button>

                              <button
                                onClick={() => {
                                  setCreatingBudgetForCategory(null)
                                  setEditFormData({ amount: '' })
                                }}
                                className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded transition"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            // Display Mode
                            <div className="flex items-center space-x-3">
                              <span className={`font-semibold min-w-[100px] ${!isLeaf ? 'text-slate-300' : 'text-white'}`}>
                                {getCurrencySymbol(currency)}
                                {budget?.amount.toFixed(2) || '0.00'}
                              </span>

                              {!isLeaf ? (
                                <span className="text-xs text-slate-400">
                                  Read-only
                                </span>
                              ) : !budget ? (
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
          </>
        )}

        {/* Categories List - Table View */}
        {viewMode === 'list' && (
          <>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-slate-800 rounded-lg animate-pulse"></div>
                ))}
              </div>
            ) : categories.length === 0 ? (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
                <p className="text-slate-400">No expense categories found. Create categories first in the Categories tab.</p>
              </div>
            ) : (
              <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700 bg-slate-900">
                      <th className="px-6 py-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Category</th>
                      <th className="px-6 py-4 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">Budget Amount</th>
                      <th className="px-6 py-4 text-center text-xs font-medium text-slate-400 uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {categories
                      .filter((c) => c.type !== 'income')
                      .map((cat) => {
                        const isLeaf = isLeafCategory(cat.id)
                        const isMainCategory = !cat.parent_id || cat.parent_id === cat.id
                        const budget = budgets.find(
                          (b) => b.category_id === cat.id && b.month === new Date().getMonth() + 1 && b.year === new Date().getFullYear()
                        )
                        const isEditing = editingBudgetId === budget?.id
                        const isCreating = creatingBudgetForCategory === cat.id

                        // For main categories, calculate budget from subcategories
                        let displayAmount = budget?.amount || 0
                        if (isMainCategory) {
                          displayAmount = getMainCategoryBudget(cat.id)
                        }

                        return (
                          <tr
                            key={cat.id}
                            className={`${!isMainCategory ? 'hover:bg-slate-700/50' : 'bg-slate-700/20'} transition ${isCreating ? 'bg-primary-900/20' : ''}`}
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center space-x-3">
                                <span className="text-2xl">{cat.icon}</span>
                                <div>
                                  <p className="text-white font-medium">{cat.name}</p>
                                  {isMainCategory && (
                                    <p className="text-xs text-slate-400">
                                      Sum of subcategories
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                              {isEditing && budget && isLeaf ? (
                                <div className="flex items-center justify-end space-x-2">
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={editFormData.amount || ''}
                                    onChange={(e) =>
                                      setEditFormData({ ...editFormData, amount: e.target.value })
                                    }
                                    placeholder="0.00"
                                    className="w-24 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm text-right"
                                  />
                                </div>
                              ) : isCreating && isLeaf ? (
                                <div className="flex items-center justify-end space-x-2">
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={editFormData.amount || ''}
                                    onChange={(e) =>
                                      setEditFormData({ ...editFormData, amount: e.target.value })
                                    }
                                    placeholder="Enter amount"
                                    autoFocus
                                    className="w-24 px-2 py-1 bg-primary-700 border border-primary-600 rounded text-white text-sm text-right font-semibold"
                                  />
                                </div>
                              ) : (
                                <span className={`font-semibold ${isMainCategory ? 'text-slate-300' : 'text-white'}`}>
                                  {getCurrencySymbol(currency)}
                                  {displayAmount.toFixed(2)}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-center space-x-2">
                                {isMainCategory ? (
                                  <span className="text-xs text-slate-400">Read-only</span>
                                ) : isEditing && budget ? (
                                  <>
                                    <button
                                      onClick={handleSaveBudget}
                                      className="px-3 py-1 bg-primary-600 hover:bg-primary-700 text-white text-xs rounded transition"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => setEditingBudgetId(null)}
                                      className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded transition"
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : isCreating ? (
                                  <>
                                    <button
                                      onClick={() => handleSaveNewBudget(cat.id)}
                                      className="px-3 py-1 bg-primary-600 hover:bg-primary-700 text-white text-xs rounded transition font-semibold"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => {
                                        setCreatingBudgetForCategory(null)
                                        setEditFormData({ amount: '' })
                                      }}
                                      className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded transition"
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    {!budget ? (
                                      <button
                                        onClick={() => handleAddBudget(cat.id)}
                                        className="text-slate-400 hover:text-primary-500 transition text-sm"
                                      >
                                        Set budget
                                      </button>
                                    ) : (
                                      <>
                                        <button
                                          onClick={() => handleEditStart(budget)}
                                          className="text-slate-400 hover:text-primary-500 transition"
                                          title="Edit budget"
                                        >
                                          ✏️
                                        </button>
                                        <button
                                          onClick={() => handleDeleteBudget(budget.id)}
                                          className="text-slate-400 hover:text-red-500 transition"
                                          title="Delete budget"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
                {categories.filter((c) => c.type !== 'income').length === 0 && (
                  <div className="p-8 text-center text-slate-400">No expense categories found</div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
