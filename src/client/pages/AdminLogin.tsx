import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bike, Lock } from 'lucide-react'

export default function AdminLogin() {
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    // Verify token by hitting a protected endpoint
    const res = await fetch('/api/admin/events', {
      headers: { 'x-admin-token': token },
    })
    if (res.ok) {
      localStorage.setItem('adminToken', token)
      navigate('/admin/calendar')
    } else {
      setError('Invalid admin token')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Bike size={32} className="text-green-600" />
            <span className="text-2xl font-bold">Bike Party</span>
          </div>
          <p className="text-gray-500">Admin Access</p>
        </div>

        <form onSubmit={handleLogin} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Admin Token</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="password"
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="Enter your admin token"
                className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            type="submit"
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-xl transition-colors"
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  )
}
