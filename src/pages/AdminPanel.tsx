import Layout from '../components/Layout'

export default function AdminPanel() {
  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white mb-6">Admin Panel 🛡️</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">User Management</h2>
            <p className="text-slate-400 text-sm">Coming soon</p>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">System Statistics</h2>
            <p className="text-slate-400 text-sm">Coming soon</p>
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
          <p className="text-slate-400">Admin panel features - Coming soon</p>
        </div>
      </div>
    </Layout>
  )
}
