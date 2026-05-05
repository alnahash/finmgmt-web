import { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthContext } from '../App'
import { supabase } from '../lib/supabase'
import { ArrowRight, Check } from 'lucide-react'

const DEFAULT_CATEGORIES = [
  { name: 'Food & Dining', icon: '🍔', color: '#f97316', type: 'expense' },
  { name: 'Transportation', icon: '🚗', color: '#f97316', type: 'expense' },
  { name: 'Entertainment', icon: '🎬', color: '#f97316', type: 'expense' },
  { name: 'Housing', icon: '🏠', color: '#f97316', type: 'expense' },
  { name: 'Clothing', icon: '👕', color: '#f97316', type: 'expense' },
  { name: 'Health & Fitness', icon: '💪', color: '#f97316', type: 'expense' },
  { name: 'Shopping', icon: '🛒', color: '#f97316', type: 'expense' },
  { name: 'Education', icon: '📚', color: '#f97316', type: 'expense' },
  { name: 'Travel', icon: '✈️', color: '#f97316', type: 'expense' },
  { name: 'Salary', icon: '💰', color: '#10b981', type: 'income' },
]

const DEFAULT_SUBCATEGORIES: { [key: string]: string[] } = {
  'Food & Dining': ['Coffee Shops', 'Groceries', 'Restaurants', 'Fast Food', 'Delivery'],
  'Transportation': ['Fuel', 'Public Transport', 'Repairs', 'Parking', 'Uber/Taxi'],
  'Entertainment': ['Movies', 'Gaming', 'Sports', 'Concerts', 'Hobbies'],
  'Housing': ['Rent', 'Utilities', 'Internet', 'Maintenance', 'Furniture'],
  'Clothing': ['Shirts', 'Pants', 'Shoes', 'Accessories', 'Outerwear'],
  'Health & Fitness': ['Gym', 'Doctor', 'Medicine', 'Dentist', 'Wellness'],
  'Shopping': ['Electronics', 'Books', 'Home & Garden', 'Toys', 'Gifts'],
  'Education': ['Tuition', 'Books', 'Courses', 'Training', 'Materials'],
  'Travel': ['Flights', 'Hotels', 'Food', 'Activities', 'Transport'],
}

interface Category {
  name: string
  icon: string
  color: string
  type: string
  selected?: boolean
}

interface SubcategorySelection {
  categoryName: string
  selected: string[]
  custom?: string[]
}

interface CategoryBudget {
  categoryName: string
  amount: number
}

interface Transaction {
  category: string
  amount: number
  description: string
}

export default function Onboarding() {
  const { user } = useContext(AuthContext)
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [alreadyOnboarded, setAlreadyOnboarded] = useState(false)
  const [formData, setFormData] = useState({
    full_name: '',
    currency: 'USD',
    monthly_budget: 0,
    month_start_day: 1,
  })
  const [selectedCategories, setSelectedCategories] = useState<(Category & { selected: boolean })[]>(
    DEFAULT_CATEGORIES.map((cat) => ({ ...cat, selected: cat.type === 'expense' ? true : false }))
  )
  const [selectedSubcategories, setSelectedSubcategories] = useState<SubcategorySelection[]>(
    DEFAULT_CATEGORIES.filter((cat) => cat.type === 'expense').map((cat) => ({
      categoryName: cat.name,
      selected: DEFAULT_SUBCATEGORIES[cat.name] ? [DEFAULT_SUBCATEGORIES[cat.name][0]] : [],
      custom: [],
    }))
  )
  const [categoryBudgets, setCategoryBudgets] = useState<CategoryBudget[]>([])
  const [firstTransaction, setFirstTransaction] = useState<Transaction>({
    category: '',
    amount: 0,
    description: '',
  })

  useEffect(() => {
    if (user?.user_metadata?.full_name) {
      setFormData((prev) => ({
        ...prev,
        full_name: user.user_metadata.full_name,
      }))
    }
  }, [user, navigate])

  // Check if already onboarded and show message
  useEffect(() => {
    const checkOnboarded = async () => {
      if (!user) return
      try {
        const { data } = await supabase
          .from('profiles')
          .select('onboarded')
          .eq('id', user.id)
          .single()

        if (data?.onboarded) {
          setAlreadyOnboarded(true)
          // Redirect after 3 seconds
          setTimeout(() => {
            navigate('/')
          }, 3000)
        }
      } catch (error) {
        console.error('Error checking onboarded status:', error)
      }
    }
    checkOnboarded()
  }, [user, navigate])

  useEffect(() => {
    // Initialize category budgets when categories are selected
    if (step === 4) {
      const selected = selectedCategories.filter((c) => c.selected && c.type === 'expense')
      setCategoryBudgets(
        selected.map((cat) => ({
          categoryName: cat.name,
          amount: formData.monthly_budget > 0 ? Math.floor(formData.monthly_budget / selected.length) : 0,
        }))
      )
    }
  }, [step])

  const handleNext = async () => {
    if (step === 1) {
      // Step 1: Full Name is mandatory
      if (!formData.full_name.trim()) {
        alert('Please enter your full name')
        return
      }
      setStep(2)
    } else if (step === 2) {
      // Step 2: Currency and Month Start Day are mandatory (should be selected)
      if (!formData.currency || !formData.month_start_day) {
        alert('Please select your currency and budget cycle start day')
        return
      }
      setStep(3)
    } else if (step === 3) {
      // Step 3: Monthly Budget is mandatory (must be > 0)
      if (formData.monthly_budget <= 0) {
        alert('Please enter a monthly budget amount greater than 0')
        return
      }
      setStep(4)
    } else if (step === 4) {
      // Step 4: At least one category must be selected
      const selectedCount = selectedCategories.filter(c => c.selected && c.type === 'expense').length
      if (selectedCount === 0) {
        alert('Please select at least one expense category to track')
        return
      }
      setStep(5)
    } else if (step === 5) {
      // Step 5: At least one sub-category per main category must be selected
      const selectedCategoryNames = selectedCategories.filter(c => c.selected && c.type === 'expense').map(c => c.name)
      const hasSubcategories = selectedSubcategories
        .filter(sc => selectedCategoryNames.includes(sc.categoryName))
        .every(sc => (sc.selected && sc.selected.length > 0) || (sc.custom && sc.custom.length > 0))

      if (!hasSubcategories) {
        alert('Please select or add at least one sub-category for each main category')
        return
      }
      setStep(6)
    } else if (step === 6) {
      // Step 6: Budget allocation is mandatory (must have at least one category with budget > 0)
      const hasAllocatedBudget = categoryBudgets.some(cb => cb.amount > 0)
      if (!hasAllocatedBudget) {
        alert('Please allocate budget to at least one category')
        return
      }
      setStep(7)
    } else if (step === 7) {
      // Step 7: First transaction is mandatory (category AND amount required)
      if (!firstTransaction.category || firstTransaction.amount <= 0) {
        alert('Please select a category and enter an amount for your first transaction')
        return
      }
      await completeOnboarding()
    }
  }

  const toggleCategory = (categoryName: string) => {
    setSelectedCategories(
      selectedCategories.map((cat) =>
        cat.name === categoryName ? { ...cat, selected: !cat.selected } : cat
      )
    )
  }

  const toggleSubcategory = (categoryName: string, subcategoryName: string) => {
    setSelectedSubcategories(
      selectedSubcategories.map((sc) => {
        if (sc.categoryName === categoryName) {
          const newSelected = sc.selected.includes(subcategoryName)
            ? sc.selected.filter(s => s !== subcategoryName)
            : [...sc.selected, subcategoryName]
          return { ...sc, selected: newSelected }
        }
        return sc
      })
    )
  }

  const handleCategoryBudgetChange = (categoryName: string, amount: number) => {
    setCategoryBudgets(
      categoryBudgets.map((cb) =>
        cb.categoryName === categoryName ? { ...cb, amount } : cb
      )
    )
  }

  const completeOnboarding = async () => {
    if (!user) return
    setLoading(true)

    try {
      // Step 1: Update profile (must be first to set onboarded flag)
      await supabase.from('profiles').upsert([
        {
          id: user.id,
          full_name: formData.full_name,
          currency: formData.currency,
          monthly_budget: formData.monthly_budget,
          month_start_day: formData.month_start_day,
          onboarded: true,
        },
      ])

      // Step 2: Create selected main categories
      const selectedCats = selectedCategories.filter((cat) => cat.selected)
      const categoryData = selectedCats.map((cat) => ({
        user_id: user.id,
        name: cat.name,
        icon: cat.icon,
        color: cat.color,
        type: cat.type,
        is_default: DEFAULT_CATEGORIES.some((dc) => dc.name === cat.name),
      }))

      const { data: insertedCategories } = await supabase
        .from('categories')
        .insert(categoryData)
        .select()

      // Step 2b: Create sub-categories for each main category
      if (insertedCategories && insertedCategories.length > 0) {
        const subcategoryData: any[] = []

        insertedCategories.forEach((mainCat) => {
          const subcats = selectedSubcategories.find((sc) => sc.categoryName === mainCat.name)
          if (subcats && (subcats.selected.length > 0 || (subcats.custom && subcats.custom.length > 0))) {
            const allSubcats = [...(subcats.selected || []), ...(subcats.custom || [])]
            allSubcats.forEach((subcatName) => {
              subcategoryData.push({
                user_id: user.id,
                parent_id: mainCat.id,
                name: subcatName,
                icon: '📌',
                color: mainCat.color,
                type: mainCat.type,
                is_default: false,
              })
            })
          }
        })

        if (subcategoryData.length > 0) {
          await supabase.from('categories').insert(subcategoryData)
        }
      }

      // Step 3: Create budgets and transaction in parallel (both depend on insertedCategories)
      const now = new Date()

      const createBudgetsPromise = (async () => {
        if (insertedCategories && categoryBudgets.length > 0) {
          const budgetData = categoryBudgets
            .filter((cb) => cb.amount > 0)
            .map((cb) => {
              const category = insertedCategories.find((cat) => cat.name === cb.categoryName)
              return {
                user_id: user.id,
                category_id: category?.id,
                amount: cb.amount,
                month: now.getMonth() + 1,
                year: now.getFullYear(),
              }
            })

          if (budgetData.length > 0) {
            return supabase.from('budgets').insert(budgetData)
          }
        }
        return Promise.resolve()
      })()

      const createTransactionPromise = (async () => {
        if (firstTransaction.amount > 0 && firstTransaction.category && insertedCategories) {
          const category = insertedCategories.find((cat) => cat.name === firstTransaction.category)
          if (category) {
            return supabase.from('transactions').insert([
              {
                user_id: user.id,
                category_id: category.id,
                amount: firstTransaction.amount,
                description: firstTransaction.description || 'First transaction',
                transaction_date: now.toISOString().split('T')[0],
              },
            ])
          }
        }
        return Promise.resolve()
      })()

      // Wait for both operations to complete in parallel
      await Promise.all([createBudgetsPromise, createTransactionPromise])

      // Navigate to dashboard after all operations complete
      navigate('/')
    } catch (error) {
      console.error('Error completing onboarding:', error)
      alert('Error completing onboarding. Please try again.')
      setLoading(false)
    }
  }

  // Show already onboarded message
  if (alreadyOnboarded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow-xl p-12 text-center">
            <div className="mb-6">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-green-900/30 border border-green-700 rounded-full mb-4">
                <svg className="w-10 h-10 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <h2 className="text-3xl font-bold text-white mb-3">Onboarding Complete! 🎉</h2>
              <p className="text-slate-400 text-lg mb-2">Welcome to Astiq, {user?.user_metadata?.full_name || 'friend'}!</p>
              <p className="text-slate-500 text-sm">Your categories, sub-categories, budgets, and first transaction are all set up. Let's start tracking your expenses!</p>
            </div>
            <div className="mt-8 pt-6 border-t border-slate-700">
              <p className="text-slate-400 text-sm mb-3">Redirecting to dashboard in 3 seconds...</p>
              <div className="flex justify-center">
                <div className="animate-spin h-6 w-6 border-2 border-primary-500 border-t-transparent rounded-full"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="bg-slate-900 border border-slate-800 rounded-lg shadow-xl p-8">
          {/* Progress */}
          <div className="flex items-center justify-between mb-8 overflow-x-auto pb-2">
            {[1, 2, 3, 4, 5, 6, 7].map((s) => (
              <div key={s} className="flex items-center flex-shrink-0">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition text-sm ${
                    s <= step
                      ? 'bg-primary-600 text-white'
                      : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  {s < step ? <Check className="w-5 h-5" /> : s}
                </div>
                {s < 7 && (
                  <div
                    className={`h-1 w-8 mx-1 transition ${
                      s < step ? 'bg-primary-600' : 'bg-slate-700'
                    }`}
                  ></div>
                )}
              </div>
            ))}
          </div>

          {/* Step 1: Profile */}
          {step === 1 && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Welcome to FinMgmt! 👋</h2>
              <p className="text-slate-400 mb-8">Let's set up your account</p>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Full Name *</label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="John Doe"
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-primary-500 mb-6"
                  autoFocus
                />
              </div>
              <button
                onClick={handleNext}
                disabled={!formData.full_name}
                className="w-full flex items-center justify-center space-x-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition"
              >
                <span>Continue</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Step 2: Preferences - Currency & Month Start */}
          {step === 2 && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Your Preferences</h2>
              <p className="text-slate-400 mb-8">Customize your experience (Required)</p>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Currency *</label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
                  >
                    <option value="USD">US Dollar (USD)</option>
                    <option value="EUR">Euro (EUR)</option>
                    <option value="GBP">British Pound (GBP)</option>
                    <option value="BHD">Bahraini Dinar (BHD)</option>
                    <option value="AED">UAE Dirham (AED)</option>
                    <option value="SAR">Saudi Riyal (SAR)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Budget Cycle Start Day *</label>
                  <select
                    value={formData.month_start_day}
                    onChange={(e) => setFormData({ ...formData, month_start_day: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
                  >
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                      <option key={day} value={day}>
                        Day {day}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-400 mt-1">When should your monthly budget reset?</p>
                </div>
              </div>
              <div className="flex space-x-2 mt-8">
                <button onClick={() => setStep(1)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 rounded-lg transition">
                  Back
                </button>
                <button
                  onClick={handleNext}
                  className="flex-1 flex items-center justify-center space-x-2 bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 rounded-lg transition"
                >
                  <span>Continue</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Monthly Budget */}
          {step === 3 && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Monthly Budget</h2>
              <p className="text-slate-400 mb-8">Set your total spending limit (Required)</p>
              <div className="mb-8">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Monthly Budget ({formData.currency}) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.monthly_budget || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      monthly_budget: e.target.value ? parseFloat(e.target.value) : 0,
                    })
                  }
                  placeholder="e.g., 5000"
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-primary-500"
                />
                <p className="text-xs text-slate-400 mt-1">You can change this anytime in settings</p>
              </div>
              <div className="flex space-x-2">
                <button onClick={() => setStep(2)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 rounded-lg transition">
                  Back
                </button>
                <button
                  onClick={handleNext}
                  disabled={formData.monthly_budget <= 0}
                  className="flex-1 flex items-center justify-center space-x-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 rounded-lg transition"
                >
                  <span>Continue</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Select Categories */}
          {step === 4 && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Select Categories</h2>
              <p className="text-slate-400 mb-6">Choose which expense categories you want to track (Select at least one)</p>
              <div className="space-y-3 max-h-96 overflow-y-auto mb-8">
                {selectedCategories.map((cat) => (
                  <button
                    key={cat.name}
                    onClick={() => toggleCategory(cat.name)}
                    className={`w-full flex items-center space-x-3 p-3 rounded-lg border-2 transition ${
                      cat.selected && cat.type === 'expense'
                        ? 'bg-primary-900/30 border-primary-600'
                        : cat.type === 'income'
                        ? 'bg-green-900/20 border-green-700 opacity-50 cursor-not-allowed'
                        : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                    } ${cat.type === 'income' ? '' : 'cursor-pointer'}`}
                    disabled={cat.type === 'income'}
                  >
                    <span className="text-2xl">{cat.icon}</span>
                    <span className="text-white font-medium flex-1 text-left">{cat.name}</span>
                    {cat.selected && cat.type === 'expense' && <Check className="w-5 h-5 text-primary-500" />}
                    {cat.type === 'income' && <span className="text-xs text-slate-500">Income (auto-added)</span>}
                  </button>
                ))}
              </div>
              <div className="flex space-x-2">
                <button onClick={() => setStep(3)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 rounded-lg transition">
                  Back
                </button>
                <button
                  onClick={handleNext}
                  disabled={selectedCategories.filter(c => c.selected && c.type === 'expense').length === 0}
                  className="flex-1 flex items-center justify-center space-x-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 rounded-lg transition"
                >
                  <span>Continue</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Select Sub-Categories */}
          {step === 5 && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Select Sub-Categories</h2>
              <p className="text-slate-400 mb-6">Choose sub-categories for tracking (Select at least one per main category)</p>
              <div className="space-y-6 max-h-96 overflow-y-auto mb-8">
                {selectedCategories
                  .filter((cat) => cat.selected && cat.type === 'expense')
                  .map((mainCat) => {
                    const subcats = selectedSubcategories.find((sc) => sc.categoryName === mainCat.name)
                    const availableSubcats = DEFAULT_SUBCATEGORIES[mainCat.name] || []
                    return (
                      <div key={mainCat.name} className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                        <h3 className="text-lg font-semibold text-white mb-3 flex items-center space-x-2">
                          <span className="text-2xl">{mainCat.icon}</span>
                          <span>{mainCat.name}</span>
                        </h3>
                        <div className="space-y-2 ml-8">
                          {availableSubcats.map((subcat) => (
                            <button
                              key={subcat}
                              onClick={() => toggleSubcategory(mainCat.name, subcat)}
                              className={`w-full flex items-center space-x-3 p-2 rounded-lg border transition ${
                                subcats?.selected.includes(subcat)
                                  ? 'bg-primary-900/30 border-primary-600'
                                  : 'bg-slate-700/50 border-slate-600 hover:border-slate-500'
                              } cursor-pointer`}
                            >
                              <span className="text-white font-medium flex-1 text-left text-sm">{subcat}</span>
                              {subcats?.selected.includes(subcat) && <Check className="w-4 h-4 text-primary-500" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
              </div>
              <div className="flex space-x-2">
                <button onClick={() => setStep(4)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 rounded-lg transition">
                  Back
                </button>
                <button
                  onClick={handleNext}
                  className="flex-1 flex items-center justify-center space-x-2 bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 rounded-lg transition"
                >
                  <span>Continue</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* Step 6: Budget Per Category */}
          {step === 6 && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Budget Per Category</h2>
              <p className="text-slate-400 mb-6">Allocate your budget across categories (Allocate at least one)</p>
              <div className="space-y-4 max-h-96 overflow-y-auto mb-8">
                {categoryBudgets.map((cb) => (
                  <div key={cb.categoryName}>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-slate-300">{cb.categoryName}</label>
                      <span className="text-sm text-slate-400">
                        {formData.currency} {cb.amount.toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      value={cb.amount || ''}
                      onChange={(e) => handleCategoryBudgetChange(cb.categoryName, parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500"
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400 mb-6">
                Total: {formData.currency} {categoryBudgets.reduce((sum, cb) => sum + cb.amount, 0).toFixed(2)} / {formData.currency} {formData.monthly_budget.toFixed(2)}
              </p>
              <div className="flex space-x-2">
                <button onClick={() => setStep(5)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 rounded-lg transition">
                  Back
                </button>
                <button
                  onClick={handleNext}
                  disabled={!categoryBudgets.some(cb => cb.amount > 0)}
                  className="flex-1 flex items-center justify-center space-x-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 rounded-lg transition"
                >
                  <span>Continue</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* Step 7: Add First Transaction */}
          {step === 7 && (
            <div>
              {loading && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                  <div className="bg-slate-900 border border-slate-700 rounded-lg p-8 text-center">
                    <div className="animate-spin h-12 w-12 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                    <h3 className="text-lg font-semibold text-white mb-2">Setting up your account...</h3>
                    <p className="text-slate-400 text-sm">Creating your categories, sub-categories, budgets, and first transaction</p>
                  </div>
                </div>
              )}
              <h2 className="text-2xl font-bold text-white mb-2">Add Your First Transaction</h2>
              <p className="text-slate-400 mb-8">Start tracking your spending</p>
              <div className="space-y-6 mb-8">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Category *</label>
                  <select
                    value={firstTransaction.category}
                    onChange={(e) => setFirstTransaction({ ...firstTransaction, category: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-primary-500"
                  >
                    <option value="">Select a category...</option>
                    {selectedCategories
                      .filter((c) => c.selected && c.type === 'expense')
                      .map((cat) => (
                        <option key={cat.name} value={cat.name}>
                          {cat.icon} {cat.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Amount ({formData.currency}) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={firstTransaction.amount || ''}
                    onChange={(e) => setFirstTransaction({ ...firstTransaction, amount: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Description</label>
                  <input
                    type="text"
                    value={firstTransaction.description}
                    onChange={(e) => setFirstTransaction({ ...firstTransaction, description: e.target.value })}
                    placeholder="e.g., Lunch at restaurant"
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>
              <p className="text-xs text-slate-400 mb-8">Let's record your first transaction to start tracking your finances</p>
              <div className="flex space-x-2">
                <button onClick={() => setStep(6)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 rounded-lg transition">
                  Back
                </button>
                <button
                  onClick={handleNext}
                  disabled={loading || !firstTransaction.category || firstTransaction.amount <= 0}
                  className="flex-1 flex items-center justify-center space-x-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 rounded-lg transition"
                >
                  <span>{loading ? 'Setting up...' : 'Complete Setup'}</span>
                  {!loading && <Check className="w-5 h-5" />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
