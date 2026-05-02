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

### Admin System (Dual-Layer Architecture)

**Two-tier admin management**:
1. **Environment Variable (VITE_ADMIN_EMAILS)**: Built-in admin emails checked first (e.g., `alnahash@gmail.com`)
2. **Database Flag (profiles.is_admin)**: User-managed admin status in the database

**Code location**: `App.tsx`, `checkAdmin()` function
```typescript
const checkAdmin = async (email?: string, userId?: string) => {
  // 1. Check environment variable (backward compatibility)
  const envAdmins = import.meta.env.VITE_ADMIN_EMAILS?.split(',') || []
  const isEnvAdmin = email ? envAdmins.includes(email.toLowerCase()) : false
  if (isEnvAdmin) {
    setIsAdmin(true)
    return
  }
  
  // 2. Check database flag (user-managed admins)
  if (userId) {
    const { data } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', userId)
      .single()
    setIsAdmin(data?.is_admin || false)
  }
}
```

**AdminPanel Features**:
- View all users with login stats, last login date
- **Toggle admin status**: Only `alnahash@gmail.com` can call `toggleAdminStatus()`
- **Delete users**: Removes user from both `profiles` table (via RLS) and `auth.users` (via admin API)
- Custom success/error modals instead of browser alerts

**User Deletion Process**:
1. Delete from `profiles` table (RLS policy enforces admin check)
2. Supabase admin API removes from `auth.users`
3. User won't reappear because RPC function `get_admin_user_stats()` uses INNER JOIN (not LEFT JOIN) with profiles

**Important**: Deleted users in `auth.users` are filtered out by INNER JOIN, preventing orphaned records.

### Currency Formatting
- Use `getCurrencySymbol(currency)` to get symbol (e.g., "₹", "$", "BHD")
- Use `formatCurrency(amount, currency)` for full formatted strings
- All currency data stored in profile as currency code (e.g., "USD", "BHD")

### Email Verification
**Current status**: Disabled in signup flow
- Users can access app immediately after signup
- Supabase still sends verification emails but they're not enforced
- Removed: EmailVerification page, email_confirmed check in routing, verification redirects
- Reason: Better UX for users who can't access email immediately

### Charts (Recharts)
- Wrap in `<ResponsiveContainer width="100%" height={350}>`
- Always include `<CartesianGrid>`, `<XAxis>`, `<YAxis>`, `<Tooltip>`
- Use `#94a3b8` for axis text, `#334155` for grid lines, `#1e293b` for tooltip background
- Category Spending Trends uses `ReferenceDot` with color-coded dots (green for decrease, red for increase, gray for neutral)

## ✅ Implemented Features

### Authentication & Admin
- ✅ Email/password signup and login
- ✅ Supabase session management
- ✅ Admin system (email-based + database flag)
- ✅ AdminPanel with user management (view stats, toggle admin, delete users)
- ✅ RLS policies protecting all user data
- ❌ Email verification (disabled - users access app immediately after signup)

### Dashboard & Analytics
- ✅ Dashboard with 6 metric cards (total spent, transactions count, budget remaining, days tracked, avg per transaction, top category)
- ✅ Period selector supporting custom month_start_day
- ✅ Analytics page with charts (pie by category, cumulative spending line)
- ✅ Category breakdown tables (main + sub categories)
- ✅ Budget status section
- ✅ Category Spending Trends (select category, view 3/6/12 month trend with color-coded increase/decrease)

### Transaction & Category Management
- ✅ Add/edit/delete transactions
- ✅ Transaction filtering by category and date
- ✅ Category CRUD with emoji icons and colors
- ✅ Category hierarchy (parent_id for main/sub categories)
- ✅ Category type (expense vs. income)

### User Settings & Preferences
- ✅ Profile editing (full name, currency, monthly budget, month_start_day)
- ✅ Theme toggle (light/dark mode, persisted to profile)
- ✅ Onboarding flow with default categories setup

### Financial Features
- ✅ Multiple currency support (USD, EUR, GBP, BHD, AED, SAR)
- ✅ Budget tracking (per-category monthly budgets)
- ✅ Spending vs. Saving analysis
- ✅ Login event tracking for admin stats

## 🚀 Recent Features (v1.6)

### Insights Tab - AI-Powered Financial Analysis
New dedicated `/insights` page with:
- **Deep Local Analysis Engine**: Crunches 6 months of spending data before calling AI
  - Monthly trend analysis (last 6 months)
  - Category growth detection (% change month-over-month)
  - "Death by 1000 cuts" detection (categories with 5+ small transactions)
  - Savings rate and budget health calculations
  
- **5 Structured AI Advice Sections** (via Groq API):
  1. **Quick Wins** - Specific, actionable savings with exact amounts
  2. **Category Recommendations** - Target budgets per category
  3. **Warning Signs** - Spending patterns to watch
  4. **Behavioral Insights** - Habits and mental frameworks
  5. **6-Month Strategy** - Realistic savings goal with milestones

- **UI Components**:
  - Quick stats bar (Income, Expenses, Savings Rate, Months Analyzed)
  - "Generate AI Report" button (on-demand, not auto-run to save API quota)
  - "Regenerate" button for fresh analysis
  - Organized insight cards with icons and color-coded sections
  - Last-generated timestamp

- **Code location**: `src/pages/Insights.tsx` (700+ lines)
  - `buildAnalysisBrief()` - Constructs comprehensive financial summary
  - `formatBriefForGroq()` - Formats analysis into Groq prompt
  - `callGroqForAdvice()` - Calls Groq AI with structured prompt
  - `parseInsights()` - Parses Groq response into 5 sections

### FinAI Auto-Focus Feature
Input field now automatically focuses in two scenarios:
- **Global click handler**: Clicking anywhere on the page focuses the input (except buttons/links)
- **Response completion**: After each AI response, cursor auto-returns to input box

- **Implementation**: `src/pages/FinAI.tsx` (lines 87-117)
  - Document event listener detects clicks
  - `closest()` method identifies interactive elements to skip
  - Cleanup on unmount prevents memory leaks
  - Only focuses when input is enabled (!loading && dataLoaded)

### Category Spending Trends (v1.5)
Users can select a category and view spending trends over 3/6/12 months with:
- **Trend line chart** showing spending over time
- **Color-coded dots**: Green ↓ (decreased), Red ↑ (increased), Gray ⚫ (neutral)
- **Trend statistics**: Average spending, highest month, % change
- Fetches data using `getUniquePeriodKeysByType()` to get last N periods

### Period-Based Dashboard (v1.5)
Dashboard now supports custom month start day with period selector matching Analytics patterns.

### Admin User Management (v1.5)
- Toggle user admin status (owner-only: alnahash@gmail.com)
- Delete users with proper RLS and auth cleanup
- View login stats and activity per user
- Custom success/error modals instead of browser alerts

## 📋 Planned Features (From Design Docs)

### Phase 2 - Budgets Redesign
- List view showing all categories grouped by main category
- Frequency filter tabs (All, Monthly, Yearly, Weekly, Daily, Quarterly, One Off)
- "Copy budgets from last month" bulk action
- Inline edit modal for budget amounts and frequency

### Phase 3 - Analytics Enhancements  
- Budget vs. actual spending analysis
- Spending forecast based on historical data
- Anomaly detection (unusual spending alerts)
- Smart budget recommendations

### Phase 4 - Predictive Features
- AI-powered spending forecasts
- Category spending pattern analysis
- Automated budget suggestions

## 🔐 Key Security Notes

### Row-Level Security (RLS)
All tables have RLS enabled with policies:
- Users see/edit only their own data (policy: `user_id = auth.uid()`)
- Admin-only operations require checking `is_admin = true` or owned data
- Delete operations require admin status

**Example policy for admin deletion**:
```sql
CREATE POLICY "Admin can delete any profile"
ON profiles FOR DELETE
USING (
  auth.uid() IN (
    SELECT id FROM auth.users 
    WHERE email = 'alnahash@gmail.com'
  )
)
```

### RPC Functions & Deleted User Handling
**get_admin_user_stats()** returns all users for AdminPanel.

**Critical implementation**: Uses INNER JOIN (not LEFT JOIN) with profiles
- Reason: Deleted users still exist in `auth.users` but have no `profiles` record
- LEFT JOIN would show deleted users; INNER JOIN filters them out
- Ensures clean data after user deletion

```sql
SELECT 
  au.id, au.email,
  COUNT(le.logged_in_at) as login_count,
  MAX(le.logged_in_at) as last_login,
  pr.is_admin
FROM auth.users au
INNER JOIN public.profiles pr ON au.id = pr.id  -- Filters deleted users
LEFT JOIN public.login_events le ON au.id = le.user_id
GROUP BY au.id, au.email, pr.is_admin
ORDER BY au.created_at DESC
```

### Other Security Notes
- Admin emails checked on client side via env var
- Supabase Auth handles password hashing/storage
- No sensitive data in localStorage except auth token (handled by Supabase)
- Custom modals used instead of browser alerts (no exposure of raw error messages)

## 📝 Development Workflow

1. **Start dev server**: `npm run dev`
2. **Make changes**: Files auto-reload via HMR
3. **Check types**: `npm run build` will catch TypeScript errors
4. **Lint before commit**: `npm run lint` (zero warnings enforced)
5. **Test in browser**: Check console for errors, use React DevTools to inspect state
6. **Commit and push**: Auto-deploys to Vercel production

## 🐛 Debugging

### Common Issues & Solutions

**User deletion shows success but user still appears in AdminPanel**:
- Check if RPC function uses INNER JOIN or LEFT JOIN with profiles
- LEFT JOIN keeps deleted users; INNER JOIN filters them (correct)
- Verify both `profiles` and `auth.users` are deleted
- Check `login_events` doesn't have stale entries

**User can't access app after signup**:
- Verify email verification is NOT blocking (check App.tsx routing)
- Check `profiles` table has corresponding row for user.id
- Ensure `month_start_day` is set in onboarding (defaults to 1 if missing)
- Check RLS policy on `profiles` allows user to read own data

**Admin features not working**:
- Verify user email matches `VITE_ADMIN_EMAILS` env var OR has `is_admin = true` in database
- Refresh page after `is_admin` flag changed (AuthContext doesn't auto-update)
- Check browser console for RLS 403 errors
- Check AdminPanel is only shown when `AuthContext.isAdmin` is true

**Period selector shows no periods**:
- Check if transaction dates exist in database
- Verify `getUniquePeriodKeysByType()` is being called correctly
- Ensure `month_start_day` from profile is passed to utility functions
- Check console for date parsing errors

### Tools & Resources

- **Supabase Studio**: View/edit database directly at supabase.com
- **Vercel Logs**: Check deployment logs on vercel.com dashboard
- **Supabase SQL Editor**: Test queries, RLS policies, RPC functions
- **React DevTools**: Inspect component state and context values
- **Network Tab**: Check Supabase API calls and response status codes
- **Browser Console**: Watch for TypeScript/Supabase errors and warnings

## 🎨 UI Patterns

### Custom Modals (NOT Browser Alerts)
Instead of `alert()` or `confirm()`, use custom modal components:

```typescript
const [successMessage, setSuccessMessage] = useState('')
const [errorMessage, setErrorMessage] = useState('')

// Show success (auto-dismisses after 3 seconds)
setSuccessMessage('User marked as admin')
setTimeout(() => setSuccessMessage(''), 3000)

// Show error (user can close or auto-dismiss)
setErrorMessage('Failed to delete user')
setTimeout(() => setErrorMessage(''), 4000)
```

**Render modals in component**:
- Success modal: Green background, CheckCircle icon, success message
- Error modal: Red background, AlertCircle icon, error message
- Both are overlay modals that don't block user interaction

**Benefits**:
- Better UX - no jarring browser alerts
- Can show detailed error messages
- Consistent with dark theme design
- Auto-dismiss provides feedback without interaction

### Form Validation UI
Use real-time validation indicators:
- **✓ Green checkmark**: Valid input (meets requirements)
- **✗ Red X**: Invalid input (doesn't meet requirements)
- Show validation feedback next to field as user types

### Icon Usage
- Use Lucide React icons consistently
- Common icons: Check, X, AlertCircle, CheckCircle, Eye, EyeOff, Trash2, Edit2
- Icon colors: Primary orange `#f97316`, muted gray `#94a3b8`, red `#ef4444`, green `#10b981`

## 🎯 Common Tasks

### Adding a New Stat Card to Dashboard
1. Add state variable: `const [stat, setStat] = useState(0)`
2. Fetch data in `useEffect` after period is selected
3. Render card with icon and value
4. Update style to match existing cards (`bg-slate-800 border border-slate-700 rounded-lg`)
5. Make responsive with `md:col-span-2` or similar for larger cards

### Adding a New Analytics Chart
1. Fetch period data using `getPeriodDateRangeByType()`
2. Transform data into Recharts format: `[{ name: string, value: number }, ...]`
3. Wrap in `ResponsiveContainer` and use appropriate Recharts component (LineChart, BarChart, etc.)
4. Match color scheme: lines/bars use `#f97316`, grid `#334155`, tooltip `#1e293b`, axis text `#94a3b8`
5. Add proper tooltips showing currency format

### Adding a New Page with Admin Check
1. Create `src/pages/NewAdminPage.tsx`
2. Add auth guard at top of component:
   ```typescript
   const { isAdmin } = useContext(AuthContext)
   if (!isAdmin) return <Navigate to="/" />
   ```
3. Add route in `App.tsx` inside authenticated routes, conditionally:
   ```typescript
   {isAdmin && <Route path="/admin-feature" element={<NewAdminPage />} />}
   ```
4. Implement RLS policy on database tables if needed

### Handling User Deletion
```typescript
const deleteUser = async (userId: string) => {
  try {
    // 1. Delete from profiles (RLS policy enforces admin check)
    await supabase.from('profiles').delete().eq('id', userId)
    
    // 2. Delete from auth.users via admin API
    await fetch('/api/admin/delete-user', {
      method: 'POST',
      body: JSON.stringify({ userId })
    })
    
    // 3. Show success modal and refresh list
    setSuccessMessage('User deleted successfully')
    await fetchAdminData()
  } catch (error) {
    setErrorMessage(error.message)
  }
}
```

### Modifying Period Utility Functions
**Note**: Period calculations affect many pages (Dashboard, Analytics, Budgets). Always test across all affected pages when changing period logic:
1. Dashboard (period selector, metric cards)
2. Analytics (charts, trend analysis)
3. Budgets (if period-based budgets used)
4. Any page that fetches transactions

## 💻 TypeScript & Strict Mode

**Strict mode is enabled** in `tsconfig.json`:
- No `any` types allowed
- Null checks required: `user?.id` not `user.id`
- All component props must have explicit types
- `useContext()` must be typed: `const { user } = useContext<AuthContextType>(AuthContext)`

**Common patterns**:
```typescript
// ✓ Good
const getValue = (obj?: MyType) => obj?.value || 0
const handleClick = (e: React.MouseEvent) => { ... }
const [data, setData] = useState<User[]>([])

// ✗ Bad
const getValue = (obj) => obj.value  // No type
const data: any = {}  // Avoid any
```

## 📦 Environment Variables

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_ADMIN_EMAILS=admin1@example.com,admin2@example.com
```

**In development**: Create `.env.local` with above variables
**In production**: Set in Vercel project settings → Environment Variables

## ⚠️ Common Gotchas & Anti-Patterns

**DO NOT**:
1. Use browser `alert()` or `confirm()` - use custom modals instead
2. Fetch `auth.users` data directly in queries - only `profiles` table is accessible via RLS
3. Forget to update period filtering when adding new features that use transactions
4. Use calendar month filtering (`DATE_TRUNC('month', date)`) - always use period date ranges
5. Assume `user.id` exists without null check - use `user?.id`
6. Change period utility function logic without testing all affected pages
7. Hard-code admin emails in components - use `VITE_ADMIN_EMAILS` env var
8. Leave unused imports/variables (breaks TypeScript lint)
9. Use LEFT JOIN with `auth.users` in RPC functions (orphaned records problem)
10. Forget to set RLS policies on new tables (data exposed to all users)

**ALWAYS**:
1. Use `getPeriodDateRange()` for transaction queries
2. Pass `monthStartDay` to period utility functions
3. Filter by `user_id` in all queries (RLS enforces this but be explicit)
4. Test admin features as non-admin user (verify access denied)
5. Test date-dependent features around month boundaries
6. Check Vercel logs if deployment looks stuck
7. Verify TypeScript compiles before pushing: `npm run build`
8. Use custom modals for user feedback instead of console.log() or alerts
9. Test deleted user doesn't appear in AdminPanel (check RPC function JOIN logic)
10. Set currency properly during onboarding (affects all formatting)

## 🚢 Deployment & Vercel

### Auto-Deployment Flow
1. Push to `main` branch on GitHub
2. Vercel webhook triggered
3. Vercel runs: TypeScript check → Vite build → Deploy to `dist/`
4. Deployment takes 1-2 minutes typically
5. Automatic redirect from production domain

### Manual Deployment (⚠️ REQUIRED - Webhook Not Working)
⚠️ **IMPORTANT**: GitHub webhook is NOT automatically triggering Vercel deployments. You MUST manually deploy after pushing:

```bash
npm run build                 # Verify local build succeeds first
git push origin main         # Push to GitHub
npx vercel deploy --prod --yes  # ⚠️ MANUALLY trigger Vercel deployment
```

**This is NOT optional** - without the manual `vercel deploy` command, your changes won't reach production even though git push succeeds!

### Checking Deployment Status
- Vercel Dashboard: https://vercel.com/dashboard
- Recent deployments show build status, logs, and preview URLs
- Failed builds show detailed error messages in build logs

### Build Troubleshooting
If `npm run build` fails locally:
1. Check TypeScript errors: `npm run lint`
2. Verify all imports resolve correctly
3. Check for unused variables/imports (will fail build)
4. Run `npm install` if dependencies changed
5. Delete `node_modules` and `.next` (if exists), reinstall

**Deployment lag note**: Code changes may take time to deploy. Always check Vercel logs to confirm deployment succeeded before investigating further.

## 🔍 Deployment Verification Checklist (IMPORTANT)

**⚠️ CRITICAL: GitHub webhooks are NOT working. You MUST manually deploy to Vercel after every git push.**

### After Each Code Change, Follow This Process:

#### 1️⃣ **Local Build Verification** (Before pushing)
```bash
# Ensure TypeScript compiles without errors
npm run build

# If build succeeds, continue
git add -A
git commit -m "..."
git push origin main
```

#### 1.5️⃣ **⚠️ MANUAL VERCEL DEPLOYMENT (REQUIRED!)**
```bash
# DO NOT SKIP THIS STEP - webhook is not working!
npx vercel deploy --prod --yes
```
**Wait for output showing "Production: https://finmgmt-..." and "Aliased: https://finmgmt-web.vercel.app"**

#### 2️⃣ **Wait for Vercel Build** (2-3 minutes typically)
- Vercel detects push within 10-30 seconds
- Build starts automatically
- Total build time: 1-3 minutes depending on asset size

#### 3️⃣ **Check Deployment Status** (Use Vercel API)
```bash
# Get latest deployments
vercel --prod --token=<YOUR_TOKEN>

# OR use curl (from project directory with .vercel/project.json)
curl -H "Authorization: Bearer <TOKEN>" \
  "https://api.vercel.com/v13/deployments?projectId=<PROJECT_ID>&teamId=<TEAM_ID>&limit=5"
```

#### 4️⃣ **Verify Deployment State**
Look for the **newest deployment** in Vercel dashboard:
- ✅ **State: READY** → Successfully deployed (can take 1-3 min)
- 🔄 **State: BUILDING** → Still building, wait 1-2 min and recheck
- ❌ **State: ERROR** → Build failed, check build logs
- ⏳ **Commit SHA doesn't match** → Vercel hasn't picked up push yet, wait 30 sec and recheck

#### 5️⃣ **Test the Production URL**
```bash
# After READY state confirmed, test the live app
# Production URL: https://finmgmt-web.vercel.app

# Quick checks:
# 1. Open the app in browser
# 2. Navigate to the changed feature/page
# 3. Verify the changes are visible
# 4. Check browser console for errors (F12 → Console tab)
# 5. Test the specific functionality that was changed
```

#### 6️⃣ **Verify Specific Changes**
Examples:
- **Code changes to Insights.tsx**:
  - Click "Insights" tab in sidebar
  - Click "Generate AI Report" button
  - Verify new profile data appears in the prompt (name, email, etc.)
  - Check browser console for any errors

- **New components**:
  - Navigate to the page with the new component
  - Verify it renders correctly
  - Check for layout/styling issues

- **Database query changes**:
  - Perform the action that triggers the query
  - Verify correct data appears
  - Check browser Network tab for API response

### Common Deployment Failures & Fixes

| Failure | Cause | Fix |
|---------|-------|-----|
| **TypeScript Error on Vercel** | Local build succeeded but Vercel build failed | Check node_modules/dependencies. Delete `.next` folder. Push again. |
| **Build logs show "Can't find module"** | Missing dependency | Run `npm install <package>` and commit lock file |
| **Layout looks broken** | CSS import issue | Verify TailwindCSS classes are used correctly, check for typos |
| **API call fails in production** | Environment variables not set | Check .env.production in Vercel dashboard |
| **Old code still showing** | Browser cache | Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac) |
| **Deployment stuck at 50%** | Build timeout (rare) | Manually cancel deployment in Vercel and push again |

### Tools for Vercel Deployment Verification

**Option 1: Vercel Dashboard (Manual)**
- Navigate to https://vercel.com/dashboard
- Select project → Deployments tab
- Look for newest commit SHA and check state

**Option 2: Vercel CLI**
```bash
# Install once
npm i -g vercel

# Check status (from project directory)
vercel status

# View recent deployments
vercel list
```

**Option 3: Git Commit SHA Matching**
```bash
# Get latest commit on main
git log -1 --oneline

# Check latest Vercel deployment's commit SHA
# (should appear in Vercel dashboard within 30 seconds of push)
```

### What NOT to Do

❌ Don't assume deployment succeeded just because `git push` succeeded
❌ Don't wait only 10 seconds before checking - Vercel takes 1-3 minutes
❌ Don't reload the browser expecting changes - if old code shows, deployment might have failed
❌ Don't push multiple changes rapidly without verifying each one deployed
❌ Don't skip the local `npm run build` check before pushing

### Automation Tip for Future Sessions

**WORKFLOW (since webhook doesn't work)**:
1. Run `npm run build` locally to verify no TypeScript errors
2. `git add -A && git commit -m "..."` with clear message
3. `git push origin main` to GitHub
4. **`npx vercel deploy --prod --yes`** ← ⚠️ DO NOT SKIP!
5. Wait for "Aliased: https://finmgmt-web.vercel.app [XXs]" message
6. Test production URL to verify changes are live
7. Only move to next task after confirming changes visible

**Key point**: `git push` alone is NOT enough. Manual `vercel deploy` is required!
