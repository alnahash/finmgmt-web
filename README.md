# FinMgmt - Smart Expense Tracking Web Application

A modern, secure expense tracking web application built with React, TypeScript, TailwindCSS, and Supabase. FinMgmt helps users manage their finances with intelligent budgeting, category management, spending analytics, and administrative oversight.

## 🎨 Features

### Core Features
- **Authentication & Authorization**: Email/password signup and login with Supabase Auth
- **Expense Tracking**: Add, edit, delete, and filter transactions with optional descriptions and receipts
- **Category Management**: Create custom categories with emoji icons and colors (expense vs. income)
- **Budget Tracking**: Set monthly budgets and track spending vs. budget
- **Analytics Dashboard**: Visual charts and insights (Pie chart by category, Line chart for trends)
- **User Settings**: Profile customization, currency selection, month start day, theme preference
- **Admin Panel**: View all users, transaction counts, and app-wide spending statistics
- **Onboarding Wizard**: 3-step setup flow for new users

### Technical Features
- **Dark Theme**: Sleek dark UI with orange accent color (#f97316)
- **Responsive Design**: Works seamlessly on mobile, tablet, and desktop
- **Row-Level Security (RLS)**: Users can only access their own data
- **Real-time Updates**: Supabase integration for data consistency
- **Type-Safe**: Full TypeScript throughout the application

## 🚀 Tech Stack

### Frontend
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool (fast dev server)
- **TailwindCSS** - Utility-first styling
- **React Router** - Client-side routing
- **Recharts** - Data visualization
- **Lucide React** - Icon library

### Backend
- **Supabase** - PostgreSQL database + Auth
- **Row-Level Security (RLS)** - Data privacy
- **PostgreSQL** - Relational database

## 📋 Database Schema

```sql
profiles          -- User account info & settings
categories        -- Expense/income categories
transactions      -- Individual transactions
budgets           -- Monthly per-category budgets
spending_goals    -- Optional spending goals
```

## 🛠️ Setup & Installation

### Prerequisites
- Node.js 18+ and npm
- Supabase account (free tier available)

### 1. Clone & Install Dependencies
```bash
cd FinMgmt-Web
npm install
```

### 2. Set Environment Variables
Create `.env.local`:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_ADMIN_EMAILS=admin@example.com
```

### 3. Start Development Server
```bash
npm run dev
```

The app will open at `http://localhost:5173`

## 📱 Pages & Routes

| Route | Page | Description |
|-------|------|-------------|
| `/login` | Login | Email/password authentication |
| `/signup` | Signup | New account creation |
| `/onboarding` | Onboarding | 3-step setup wizard |
| `/` | Dashboard | Main overview with stats |
| `/transactions` | Transactions | CRUD for expenses/income |
| `/categories` | Categories | Manage custom categories |
| `/budgets` | Budgets | Set and track budgets |
| `/analytics` | Analytics | Charts and insights |
| `/settings` | Settings | User preferences & profile |
| `/admin` | Admin Panel | User management (admin only) |

## 🎯 Key Workflows

### Adding a Transaction
1. Click "Add Transaction" on Transactions page
2. Select category, amount, date, optional description
3. Click "Save" to add to database
4. View in transactions list with filtering options

### Setting a Budget
1. Go to Budgets page
2. Click "Set Budget"
3. Select category, amount, month/year
4. Budget automatically tracks spending vs. budget

### Viewing Analytics
1. Go to Analytics page
2. See pie chart of spending by category
3. View line chart showing cumulative daily spending
4. Check stats: total spent, top category, daily average

## 🔐 Security

✅ All database queries use Row-Level Security (RLS)
✅ Users can only see/edit their own data
✅ Passwords hashed by Supabase Auth
✅ Admin access verified by email check
✅ HTTPS enforced in production
✅ No sensitive data in localStorage

## 📊 Color Theme

- **Primary**: Orange (#f97316) - buttons, accents, active states
- **Background**: Dark Slate (#1e293b - #0f172a)
- **Text**: Light Slate (#f1f5f9)
- **Borders**: Slate (#334155 - #475569)

## 📦 Build & Deployment

### Build for Production
```bash
npm run build
```

This creates optimized bundle in `dist/` folder.

### Deploy to Vercel
1. Push code to GitHub
2. Connect repo to Vercel
3. Set environment variables in Vercel dashboard
4. Auto-deploys on every push

## 🐛 Development Tips

- Use `npm run dev` for hot module reloading (HMR)
- Check browser console for errors
- Supabase Studio: View/edit data directly
- React DevTools: Debug component state

## 📈 Future Enhancements

- [ ] Receipt image upload + OCR
- [ ] Multi-currency exchange rates
- [ ] Shared budgets with family/friends
- [ ] AI spending recommendations
- [ ] Mobile app (React Native)
- [ ] Bill reminders & recurring expenses
- [ ] Bank API integration (Plaid)
- [ ] Investment tracking
- [ ] Advanced reports (PDF export)

## 📝 File Structure

```
src/
├── pages/              # All page components
├── components/         # Reusable components (Layout, etc)
├── lib/               # Supabase client setup
├── App.tsx            # Main app & routing
├── main.tsx           # Entry point
└── index.css          # Global styles

public/
└── index.html         # HTML template
```

## 🤝 Contributing

This is a personal project. Feel free to fork and customize for your needs!

## 📄 License

MIT License - Use freely for personal or commercial projects.

## 💬 Questions?

Check the Supabase documentation: https://supabase.com/docs

---

**Happy Expense Tracking! 🎉**
# Latest deployment
