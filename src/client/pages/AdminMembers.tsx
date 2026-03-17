import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Users, Search } from 'lucide-react'

interface Member {
  id: string
  name: string
  phone: string
  createdAt: string
}

export default function AdminMembers() {
  const [members, setMembers] = useState<Member[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const token = localStorage.getItem('adminToken') || ''

  useEffect(() => {
    if (!token) { navigate('/admin'); return }
    fetch('/api/admin/members', { headers: { 'x-admin-token': token } })
      .then(r => { if (r.status === 401) navigate('/admin'); return r.json() })
      .then(data => { setMembers(Array.isArray(data) ? data : []); setLoading(false) })
  }, [])

  const filtered = members.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.phone.includes(search)
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate('/admin/calendar')} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-2">
          <Users size={20} className="text-green-600" />
          <h1 className="text-lg font-bold">Riders</h1>
          {!loading && <span className="text-sm text-gray-400">({members.length})</span>}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="relative mb-5">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-16">
            {search ? 'No riders match your search' : 'No riders yet'}
          </p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {filtered.map(m => (
              <div key={m.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-medium text-sm">{m.name}</p>
                  <p className="text-xs text-gray-400">{m.phone}</p>
                </div>
                <p className="text-xs text-gray-400">{m.createdAt.slice(0, 10)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
