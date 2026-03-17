import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Signup from './pages/Signup'
import AdminLogin from './pages/AdminLogin'
import AdminCalendar from './pages/AdminCalendar'
import EventAdmin from './pages/EventAdmin'
import EventDelegate from './pages/EventDelegate'
import AdminMembers from './pages/AdminMembers'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Signup />} />
        <Route path="/admin" element={<AdminLogin />} />
        <Route path="/admin/calendar" element={<AdminCalendar />} />
        <Route path="/admin/members" element={<AdminMembers />} />
        <Route path="/admin/events/:id" element={<EventAdmin />} />
        <Route path="/event-admin/:id" element={<EventDelegate />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  )
}
