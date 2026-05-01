# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 📦 Quick Commands

```bash
npm run dev       # Start dev server at localhost:5173 with hot reload
npm run build     # Production build (runs TypeScript, then Vite)
npm run preview   # Preview production build locally
npm run lint      # Run ESLint with zero-warning policy
```

## 🏗️ High-Level Architecture

### Stack
- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS
- **Routing**: React Router v6
- **Backend**: Supabase (PostgreSQL + Auth)
- **Charts**: Recharts
- **Icons**: Lucide React
- **Deployment**: Vercel (auto-deploys on git push)

### App Structure
```
src/
├── pages/          # Route handlers (Dashboard, Analytics, Transactions, etc.)
├── components/     # Reusable UI components (Layout wrapper, etc.)
├── lib/
│   ├── supabase.ts # Supabase client initialization
│   └── utils.ts    # Period utilities and formatting helpers
├── App.tsx         # Auth context, routing, theme setup
└── index.css       # TailwindCSS imports + global styles
```

### Context API
- **AuthContext** - `user`, `loading`, `isAdmin` - accessed via `useContext(AuthContext)`
- **ThemeContext** - `theme`, `setTheme` - light/dark mode support

## 🔑 Key Concepts

### Period System (Custom Month Start Day)
The app supports custom month boundaries instead of calendar months (e.g., "25th to 25th" instead of "1st to last day"). This is critical for analytics and budget tracking:

**Core Utilities** (`src/lib/utils.ts`):
- `getMonthPeriodKey(dateStr, monthStartDay)` → returns "202504-25" (YYYYMM-DD format)
- `getPeriodDateRange(periodKey)` → returns `{ startDate, endDate }` as ISO strings
- `getPeriodDateRangeByType(periodKey, periodType)` → supports multiple period types (yearly, quarterly, monthly, weekly, daily)
- `getUniquePeriodKeysByType(dates, periodType, monthStartDay)` → generates array of unique periods, sorted newest first
- `formatPeriodLabel(periodKey, periodType)` → "Apr 25 - May 24, 2024"

**Usage Pattern**:
```typescript
// Get period details from user profile
const { month_start_day } = await supabase
  .from('profiles')
  .select('month_start_day')
  .eq('id', user.id)

// Calculate date range for analytics
const { startDate, endDate } = getPeriodDateRange(selectedPeriod)
const { data: txns } = await supabase
  .from('transactions')
  .select('*')
  .eq('user_id', user.id)
  .gte('transaction_date', startDate)
  .lte('transaction_date', endDate)
```

### Category Hierarchy
Categories support parent-child relationships for organization:
- **Main Categories**: `parent_id` is null or same as `id`
- **Sub Categories**: `parent_id` references a main category
- Each category has: `id`, `name`, `icon` (emoji), `color` (hex), `type` ('expense' | 'income')

Database queries often separate by category type to show expenses vs. income independently.

### Dashboard vs. Analytics
- **Dashboard** (`/`): Entry point with 6 metric cards (total spent, transactions, budget remaining, days tracked, avg per transaction, top category). Uses period selector for custom month start day.
- **Analytics** (`/analytics`): Deep analysis with charts (pie chart by category, line chart for cumulative daily spending), budget status, and category breakdown tables.

## 🗄️ Database Tables (Schema Overview)

| Table | Purpose |
|-------|---------|
| `profiles` | User settings: `monthly_budget`, `month_start_day`, `currency`, `theme` |
| `categories` | Expense/income categories with `parent_id` for hierarchy |
| `transactions` | Individual transactions with amount, category, date |
| `budgets` | Per-category monthly budgets linked to `month_period_key` |
| `login_events` | Tracks user logins (for admin stats) |

All tables use Row-Level Security (RLS) - queries are automatically scoped to the authenticated user.

## 🎨 Design System

**Color Palette**:
- Primary: Orange `#f97316` - buttons, active states, accents
- Background: Dark slate `#1e293b` to `#0f172a`
- Text: Light slate `#f1f5f9`
- Borders: `#334155` to `#475569`

**Layout**:
- `Layout` component wraps all pages with sidebar navigation
- Sidebar has links to Dashboard, Transactions, Categories, Budgets, Analytics, Settings, Admin Panel
- Page content inside `<Layout>` with `max-w-7xl` container

## 📊 Common Data Fetching Patterns

### Fetching Transactions for a Period
```typescript
const { startDate, endDate } = getPeriodDateRange(selectedPeriod)
const { data: txns } = await supabase
  .from('transactions')
  .select('*')
  .eq('user_id', user.id)
  .gte('transaction_date', startDate)
  .lte('transaction_date', endDate)
```

### Grouping by Category
```typescript
const categoryMap = new Map<string, { amount: number; count: number }>()
txns.forEach((t) => {
  const current = categoryMap.get(t.category_id) || { amount: 0, count: 0 }
  categoryMap.set(t.category_id, {
    amount: current.amount + t.amount,
    count: current.count + 1,
  })
})
```

### Separating Income vs. Expense
```typescript
const categoryTypeMap = new Map(
  categories.map((c) => [c.id, c.type || 'expense'])
)
const isIncome = categoryTypeMap.get(t.category_id) === 'income'
if (isIncome) {
  totalIncome += t.amount
} else {
  totalExpense += t.amount
}
```

## 🔄 Important Implementation Notes

### Currency Formatting
- Use `getCurrencySymbol(currency)` to get symbol (e.g., "₹", "$", "BHD")
- Use `formatCurrency(amount, currency)` for full formatted strings
- All currency data stored in profile as currency code (e.g., "USD", "BHD")

### Admin Access
- Checked via email match against `VITE_ADMIN_EMAILS` env var (comma-separated)
- Admin panel accessible only if `AuthContext.isAdmin` is true
- Falls back to `'alnahash@gmail.com'` if env var not set

### Charts (Recharts)
- Wrap in `<ResponsiveContainer width="100%" height={350}>`
- Always include `<CartesianGrid>`, `<XAxis>`, `<YAxis>`, `<Tooltip>`
- Use `#94a3b8` for axis text, `#334155` for grid lines, `#1e293b` for tooltip background
- Category Spending Trends uses `ReferenceDot` with color-coded dots (green for decrease, red for increase, gray for neutral)

## 🚀 Recent Features

### Category Spending Trends (Analytics Page)
Users can select a category and view spending trends over 3/6/12 months with:
- **Trend line chart** showing spending over time
- **Color-coded dots**: Green ↓ (decreased), Red ↑ (increased), Gray ⚫ (neutral)
- **Trend statistics**: Average spending, highest month, % change
- Fetches data using `getUniquePeriodKeysByType()` to get last N periods

### Period-Based Dashboard
Dashboard now supports custom month start day with period selector matching Analytics patterns.

## 🔐 Key Security Notes

- All database queries use RLS - never pass user context manually
- Admin emails checked on client side via env var
- Supabase Auth handles password hashing/storage
- No sensitive data in localStorage except auth token (handled by Supabase)

## 📝 Development Workflow

1. **Start dev server**: `npm run dev`
2. **Make changes**: Files auto-reload via HMR
3. **Check types**: `npm run build` will catch TypeScript errors
4. **Lint before commit**: `npm run lint` (zero warnings enforced)
5. **Test in browser**: Check console for errors, use React DevTools to inspect state
6. **Commit and push**: Auto-deploys to Vercel production

## 🐛 Debugging

- **Supabase Studio**: View/edit database directly at supabase.com
- **Vercel Logs**: Check deployment logs on vercel.com dashboard
- **React DevTools**: Inspect component state and context values
- **Network Tab**: Check Supabase API calls and response data
- **Console**: Watch for TypeScript/Supabase errors

## 🎯 Common Tasks

### Adding a New Stat Card to Dashboard
1. Add state variable: `const [stat, setStat] = useState(0)`
2. Fetch data in `useEffect` after transactions load
3. Render card with icon and value
4. Update style to match existing cards (`bg-gradient-to-br from-slate-800 to-slate-900`)

### Adding a New Analytics Chart
1. Fetch period data using `getPeriodDateRangeByType()`
2. Transform data into Recharts format: `[{ name: string, value: number }, ...]`
3. Wrap in `ResponsiveContainer` and use appropriate Recharts component (LineChart, BarChart, etc.)
4. Match color scheme: lines/bars use `#f97316`, grid `#334155`, tooltip `#1e293b`

### Modifying Period Utility Functions
**Note**: Period calculations affect many pages (Dashboard, Analytics, Budgets). Always test across all affected pages when changing period logic.

## 📦 Environment Variables

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_ADMIN_EMAILS=admin1@example.com,admin2@example.com
```

## 🚢 Deployment

- **Auto-deploy**: Push to main branch → Vercel builds and deploys
- **Manual deploy**: `vercel deploy --prod --yes`
- **Build happens on**: TypeScript check → Vite build → Vercel uploads dist/
- **Env vars**: Set in Vercel project dashboard (auto-loads into build)
