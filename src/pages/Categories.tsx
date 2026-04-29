import { useContext, useEffect, useState } from 'react'
import { AuthContext } from '../App'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, Edit2, ChevronRight, LayoutGrid, List, ChevronDown, ChevronUp, Download, Upload } from 'lucide-react'

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

const DEFAULT_EMOJIS = [
  // Food & Dining
  '🍔', '🍕', '🍜', '☕', '🍴', '🍱', '🥘', '🍛', '🥗', '🧁',
  // Transportation
  '🚗', '🚕', '🚌', '✈️', '🚂', '🚢', '⛽', '🛴', '🏍️', '🚲',
  // Housing & Utilities
  '🏠', '🏡', '🏢', '💡', '💧', '🔥', '📱', '📺', '🌐', '🔧',
  // Health & Personal Care
  '💊', '🏥', '💇', '💄', '🧴', '🧼', '🛁', '💅', '🧘', '🏋️',
  // Shopping & Retail
  '🛒', '👕', '👟', '👔', '👜', '💍', '⌚', '👓', '🧥', '🧢',
  // Entertainment
  '🎬', '🎮', '🎵', '🎤', '🎪', '🎨', '🎭', '🎯', '🎳', '🃏',
  // Education & Books
  '📚', '🎓', '📖', '✏️', '🖊️', '📝', '📐', '🔬', '🔭', '🧮',
  // Family & Personal
  '👨‍👩‍👧‍👦', '🎁', '🎂', '🎉', '💐', '💝', '👶', '👴', '👵', '🐕',
  // Work & Business
  '💼', '💻', '📊', '📈', '💰', '💸', '💳', '🏦', '📱', '⌨️',
  // Wellness & Recreation
  '⚽', '🏊', '🧗', '🚴', '🏃', '🧘', '🛀', '🏖️', '⛺', '🎿',
  // Miscellaneous
  '🌱', '🌺', '🌸', '🌻', '🎀', '🔔', '🎧', '📷', '🎥', '🗂️'
]

const ICON_KEYWORDS: { [key: string]: string } = {
  '🍔': 'food burger hamburger', '🍕': 'food pizza', '🍜': 'food noodles ramen', '☕': 'coffee drink beverage',
  '🍴': 'utensils fork spoon dining', '🍱': 'food bento box', '🥘': 'food cooking', '🍛': 'food curry',
  '🥗': 'salad food healthy', '🧁': 'cupcake cake dessert', '🚗': 'car vehicle transport', '🚕': 'taxi car ride',
  '🚌': 'bus transport vehicle', '✈️': 'airplane flight travel', '🚂': 'train transport', '🚢': 'ship boat travel',
  '⛽': 'gas fuel petrol', '🛴': 'scooter transport', '🏍️': 'motorcycle bike', '🚲': 'bicycle bike',
  '🏠': 'house home housing', '🏡': 'house home building', '🏢': 'building office', '💡': 'electricity light bulb',
  '💧': 'water utilities', '🔥': 'fire heat', '📱': 'phone mobile', '📺': 'television tv', '🌐': 'internet network globe',
  '🔧': 'tools maintenance repair', '💊': 'medicine health pill', '🏥': 'hospital health medical', '💇': 'haircut salon',
  '💄': 'makeup beauty cosmetics', '🧴': 'cleaning supplies', '🧼': 'soap wash clean', '🛁': 'shower bath',
  '💅': 'nails manicure beauty', '🧘': 'yoga wellness meditation', '🏋️': 'gym fitness exercise workout',
  '🛒': 'shopping cart retail', '👕': 'clothes shirt fashion', '👟': 'shoes sneakers', '👔': 'suit dress clothes',
  '👜': 'bag purse fashion', '💍': 'jewelry ring', '⌚': 'watch time', '👓': 'glasses eyewear',
  '🧥': 'jacket coat clothes', '🧢': 'cap hat clothes', '🎬': 'movies film entertainment', '🎮': 'games gaming video game',
  '🎵': 'music sound audio', '🎤': 'microphone music sing', '🎪': 'circus entertainment', '🎨': 'art painting creativity',
  '🎭': 'theater drama performance', '🎯': 'target goal aim', '🎳': 'bowling sport', '🃏': 'cards game',
  '📚': 'books reading education', '🎓': 'graduation school education', '📖': 'book reading', '✏️': 'pencil writing',
  '🖊️': 'pen writing stationery', '📝': 'notes writing document', '📐': 'ruler mathematics', '🔬': 'science lab research',
  '🔭': 'telescope science', '🧮': 'abacus math counting', '👨‍👩‍👧‍👦': 'family people', '🎁': 'gift present', '🎂': 'birthday cake',
  '🎉': 'celebration party', '💐': 'flowers gift', '💝': 'gift love heart', '👶': 'baby infant', '👴': 'elderly man',
  '👵': 'elderly woman', '🐕': 'dog pet animal', '💼': 'briefcase work business', '💻': 'computer laptop work',
  '📊': 'chart graph data analytics', '📈': 'growth chart business', '💰': 'money cash finance', '💸': 'money spending',
  '💳': 'credit card payment', '🏦': 'bank finance building', '⌨️': 'keyboard computer', '⚽': 'soccer sports football',
  '🏊': 'swimming sports water', '🧗': 'climbing sport adventure', '🚴': 'cycling bike sport', '🏃': 'running exercise',
  '🛀': 'bath shower hygiene', '🏖️': 'beach vacation travel', '⛺': 'camping tent outdoor', '🎿': 'skiing sport',
  '🌱': 'plants nature garden', '🌺': 'flower hibiscus', '🌸': 'flower cherry blossom', '🌻': 'sunflower flower',
  '🎀': 'ribbon bow gift', '🔔': 'bell notification', '🎧': 'headphones music audio', '📷': 'camera photo',
  '🎥': 'video camera recording', '🗂️': 'file folder organization'
}

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

const emptySubCategory = {
  tempId: '',
  name: '',
  icon: '📁',
  color: '#f97316',
  frequency: null as Frequency | null,
}

export default function Categories() {
  const { user } = useContext(AuthContext)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState(emptyForm)
  const [view, setView] = useState<'card' | 'list'>('list')
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set())
  const [iconDropdownOpen, setIconDropdownOpen] = useState(false)
  const [iconSearch, setIconSearch] = useState('')
  const [subCategories, setSubCategories] = useState<typeof emptySubCategory[]>([])
  const [openIconDropdown, setOpenIconDropdown] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const filteredIcons = iconSearch.trim() === ''
    ? DEFAULT_EMOJIS
    : DEFAULT_EMOJIS.filter(emoji =>
        ICON_KEYWORDS[emoji]?.toLowerCase().includes(iconSearch.toLowerCase())
      )

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
      const mainPayload = {
        name: formData.name,
        icon: formData.icon,
        color: formData.color,
        type: formData.type,
        parent_id: formData.parent_id || null,
        frequency: formData.frequency || null,
      }

      let mainCategoryId = editingId

      if (editingId) {
        await supabase.from('categories').update(mainPayload).eq('id', editingId).eq('user_id', user.id)
      } else {
        const { data } = await supabase
          .from('categories')
          .insert([{ user_id: user.id, ...mainPayload }])
          .select()
        mainCategoryId = data?.[0]?.id
      }

      // Add sub-categories if any
      if (!editingId && subCategories.length > 0 && mainCategoryId) {
        const subCategoryPayloads = subCategories.map(sub => ({
          user_id: user.id,
          name: sub.name,
          icon: sub.icon,
          color: sub.color,
          type: formData.type,
          parent_id: mainCategoryId,
          frequency: sub.frequency || null,
        }))
        await supabase.from('categories').insert(subCategoryPayloads)
      }

      setFormData(emptyForm)
      setSubCategories([])
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
    setSubCategories([])
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

  const renderListRow = (cat: Category, isChild = false) => {
    const children = childrenOf(cat.id)
    const hasChildren = children.length > 0
    const isExpanded = expandedParents.has(cat.id)

    const toggleExpanded = () => {
      const newExpanded = new Set(expandedParents)
      if (newExpanded.has(cat.id)) {
        newExpanded.delete(cat.id)
      } else {
        newExpanded.add(cat.id)
      }
      setExpandedParents(newExpanded)
    }

    return (
      <div key={cat.id}>
        <div className={`flex items-center justify-between px-4 py-3 border-b border-slate-700 hover:bg-slate-700/40 transition ${isChild ? 'bg-slate-800/50' : ''}`}>
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {hasChildren && (
              <button
                onClick={toggleExpanded}
                className="text-slate-400 hover:text-white transition shrink-0 w-4 h-4 flex items-center justify-center"
              >
                <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
              </button>
            )}
            {!hasChildren && <span className="w-4 shrink-0" />}
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: cat.color }}
            />
            <span className="text-lg shrink-0">{cat.icon}</span>
            <span className="text-white text-sm font-medium truncate">{cat.name}</span>
            {isChild && <span className="text-xs text-slate-500 shrink-0">sub</span>}
          </div>
          <div className="flex items-center gap-4 shrink-0 ml-4">
            <FreqBadge freq={cat.frequency} />
            <span className={`text-xs font-medium w-14 text-right ${cat.type === 'income' ? 'text-green-400' : 'text-slate-400'}`}>
              {cat.type}
            </span>
            <div className="flex gap-2">
              <button onClick={() => handleEdit(cat)} className="text-slate-400 hover:text-primary-500 transition">
                <Edit2 className="w-4 h-4" />
              </button>
              <button onClick={() => handleDelete(cat.id)} className="text-slate-400 hover:text-red-500 transition">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        {isExpanded && children.map(child => renderListRow(child, true))}
      </div>
    )
  }

  const expenseParents = parents.filter(c => c.type === 'expense')
  const incomeParents = parents.filter(c => c.type === 'income')

  const expandAll = () => {
    const parentIds = parents.map(p => p.id)
    setExpandedParents(new Set(parentIds))
  }

  const collapseAll = () => {
    setExpandedParents(new Set())
  }

  const handleExport = () => {
    const exportData = categories.map(cat => ({
      name: cat.name,
      icon: cat.icon,
      color: cat.color,
      type: cat.type,
      parent_id: cat.parent_id,
      frequency: cat.frequency,
    }))
    const json = JSON.stringify(exportData, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `categories-export-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    setImporting(true)
    try {
      const text = await file.text()
      const importedData = JSON.parse(text)

      if (!Array.isArray(importedData)) {
        alert('Invalid file format. Expected an array of categories.')
        return
      }

      const validData = importedData.filter(
        cat => cat.name && cat.type && (cat.type === 'expense' || cat.type === 'income')
      )

      if (validData.length === 0) {
        alert('No valid categories found in the file.')
        return
      }

      // Insert categories
      const { error } = await supabase.from('categories').insert(
        validData.map(cat => ({
          user_id: user.id,
          name: cat.name,
          icon: cat.icon || '📁',
          color: cat.color || '#f97316',
          type: cat.type,
          parent_id: cat.parent_id || null,
          frequency: cat.frequency || null,
          archived: false,
        }))
      )

      if (error) throw error
      alert(`Successfully imported ${validData.length} categories!`)
      fetchCategories()
    } catch (error) {
      console.error('Error importing categories:', error)
      alert('Error importing categories. Please check the file format.')
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-white">Categories</h1>
          <div className="flex items-center gap-3">
            {/* View toggle */}
            <div className="flex bg-slate-800 border border-slate-700 rounded-lg p-1">
              <button
                onClick={() => setView('card')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition ${view === 'card' ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                <LayoutGrid className="w-4 h-4" />
                Card
              </button>
              <button
                onClick={() => setView('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition ${view === 'list' ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                <List className="w-4 h-4" />
                List
              </button>
            </div>

            {/* Expand/Collapse buttons (list view only) */}
            {view === 'list' && categories.length > 0 && (
              <div className="flex bg-slate-800 border border-slate-700 rounded-lg p-1">
                <button
                  onClick={expandAll}
                  title="Expand all categories"
                  className="text-slate-400 hover:text-white transition p-1.5"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button
                  onClick={collapseAll}
                  title="Collapse all categories"
                  className="text-slate-400 hover:text-white transition p-1.5"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Import/Export buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleExport}
                disabled={categories.length === 0}
                title="Export categories to JSON"
                className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg transition text-sm"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
              <label className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg transition text-sm cursor-pointer">
                <Upload className="w-4 h-4" />
                {importing ? 'Importing...' : 'Import'}
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  disabled={importing}
                  className="hidden"
                />
              </label>
            </div>

            <button
              onClick={() => { setShowForm(!showForm); if (showForm) cancelForm() }}
              className="flex items-center space-x-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg transition"
            >
              <Plus className="w-5 h-5" />
              <span>Add Category</span>
            </button>
          </div>
        </div>

        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-screen overflow-y-auto">
              {/* Close Button */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">
                  {editingId ? 'Edit Category' : 'New Category'}
                </h2>
                <button
                  type="button"
                  onClick={cancelForm}
                  className="text-slate-400 hover:text-white text-2xl leading-none"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
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
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setIconDropdownOpen(!iconDropdownOpen)
                      if (iconDropdownOpen) setIconSearch('')
                    }}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500 flex items-center justify-between"
                  >
                    <span className="text-lg">{formData.icon}</span>
                    <span className="text-slate-400">▼</span>
                  </button>
                  {iconDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-slate-700 border border-slate-600 rounded-lg z-10">
                      <div className="p-2 border-b border-slate-600">
                        <input
                          type="text"
                          placeholder="Search icons..."
                          value={iconSearch}
                          onChange={(e) => setIconSearch(e.target.value)}
                          className="w-full px-2 py-1 bg-slate-800 border border-slate-600 rounded text-white text-sm placeholder-slate-500 focus:outline-none focus:border-primary-500"
                          autoFocus
                        />
                      </div>
                      <div className="p-2 grid grid-cols-8 gap-1 max-h-64 overflow-y-auto">
                        {filteredIcons.length > 0 ? (
                          filteredIcons.map(emoji => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => {
                                setFormData({ ...formData, icon: emoji })
                                setIconDropdownOpen(false)
                                setIconSearch('')
                              }}
                              className={`text-xl p-2 rounded transition ${formData.icon === emoji ? 'bg-primary-600' : 'bg-slate-800 hover:bg-slate-600'}`}
                              title={ICON_KEYWORDS[emoji] || emoji}
                            >
                              {emoji}
                            </button>
                          ))
                        ) : (
                          <div className="col-span-8 text-center py-4 text-slate-400 text-sm">No icons found</div>
                        )}
                      </div>
                    </div>
                  )}
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

              {/* Sub-categories section (only when creating new main category) */}
              {!editingId && (
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium text-slate-300">
                      Sub-categories <span className="text-slate-500">(optional)</span>
                    </label>
                    {formData.parent_id === null && (
                      <button
                        type="button"
                        onClick={() => {
                          const tempId = Date.now().toString()
                          setSubCategories([...subCategories, { ...emptySubCategory, tempId }])
                        }}
                        className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-2 py-1 rounded transition"
                      >
                        + Add Sub-category
                      </button>
                    )}
                  </div>

                  {subCategories.length > 0 && (
                    <div className="space-y-3 bg-slate-700/30 border border-slate-700 rounded-lg p-3 mb-4">
                      {subCategories.map((sub, idx) => (
                        <div key={sub.tempId} className="bg-slate-800 border border-slate-600 rounded-lg p-3 space-y-2">
                          <div className="grid grid-cols-3 gap-2">
                            {/* Sub-category name */}
                            <input
                              type="text"
                              value={sub.name}
                              onChange={e => {
                                const updated = [...subCategories]
                                updated[idx].name = e.target.value
                                setSubCategories(updated)
                              }}
                              placeholder="Sub-category name"
                              className="px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm placeholder-slate-500 focus:outline-none focus:border-primary-500"
                            />

                            {/* Sub-category icon */}
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setOpenIconDropdown(openIconDropdown === sub.tempId ? null : sub.tempId)}
                                className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-primary-500 flex items-center justify-between"
                              >
                                <span className="text-lg">{sub.icon}</span>
                                <span className="text-xs">▼</span>
                              </button>
                              {openIconDropdown === sub.tempId && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-slate-700 border border-slate-600 rounded-lg z-10">
                                  <div className="p-2 grid grid-cols-6 gap-1 max-h-40 overflow-y-auto">
                                    {DEFAULT_EMOJIS.map(emoji => (
                                      <button
                                        key={emoji}
                                        type="button"
                                        onClick={() => {
                                          const updated = [...subCategories]
                                          updated[idx].icon = emoji
                                          setSubCategories(updated)
                                          setOpenIconDropdown(null)
                                        }}
                                        className={`text-lg p-1 rounded transition ${sub.icon === emoji ? 'bg-primary-600' : 'bg-slate-800 hover:bg-slate-600'}`}
                                      >
                                        {emoji}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Sub-category color */}
                            <input
                              type="color"
                              value={sub.color}
                              onChange={e => {
                                const updated = [...subCategories]
                                updated[idx].color = e.target.value
                                setSubCategories(updated)
                              }}
                              className="w-full h-8 rounded-lg cursor-pointer"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <select
                              value={sub.frequency || ''}
                              onChange={e => {
                                const updated = [...subCategories]
                                updated[idx].frequency = (e.target.value as Frequency) || null
                                setSubCategories(updated)
                              }}
                              className="flex-1 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-primary-500"
                            >
                              <option value="">No frequency</option>
                              {FREQUENCY_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => setSubCategories(subCategories.filter((_, i) => i !== idx))}
                              className="px-2 py-1 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded text-xs transition"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

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
          </div>
        )}

        {/* Category display */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-16 bg-slate-800 rounded-lg animate-pulse" />)}
          </div>
        ) : categories.length === 0 ? (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center text-slate-400">
            No categories yet. Click "Add Category" to get started.
          </div>
        ) : view === 'card' ? (
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
        ) : (
          /* List view */
          <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
            {/* Table header */}
            <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-700">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Name</span>
              <div className="flex items-center gap-4 shrink-0 ml-4">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Frequency</span>
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wide w-14 text-right">Type</span>
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wide w-12 text-right">Actions</span>
              </div>
            </div>
            {expenseParents.length > 0 && (
              <>
                <div className="px-4 py-1.5 bg-slate-900/50">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Expenses</span>
                </div>
                {expenseParents.map(cat => renderListRow(cat))}
              </>
            )}
            {incomeParents.length > 0 && (
              <>
                <div className="px-4 py-1.5 bg-slate-900/50 border-t border-slate-700">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Income</span>
                </div>
                {incomeParents.map(cat => renderListRow(cat))}
              </>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}
