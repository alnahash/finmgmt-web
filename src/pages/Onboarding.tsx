import { useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthContext } from '../App'

export default function Onboarding() {
  const { user } = useContext(AuthContext)
  const navigate = useNavigate()

  const handleComplete = () => {
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="bg-slate-900 border border-slate-800 rounded-lg shadow-xl p-8 text-center">
          <h1 className="text-4xl font-bold text-primary-500 mb-4">Welcome to FinMgmt</h1>
          <p className="text-slate-300 mb-8">Let's set up your account, {user?.user_metadata?.full_name}!</p>

          <div className="bg-slate-800 rounded-lg p-8 mb-8">
            <p className="text-slate-400 mb-4">Onboarding wizard - Coming soon</p>
            <p className="text-slate-500 text-sm">We'll help you configure your budgets, categories, and preferences</p>
          </div>

          <button
            onClick={handleComplete}
            className="bg-primary-600 hover:bg-primary-700 text-white font-medium px-8 py-3 rounded-lg transition"
          >
            Skip to Dashboard
          </button>
        </div>
      </div>
    </div>
  )
}
