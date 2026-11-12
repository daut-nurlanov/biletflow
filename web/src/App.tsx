import { Link, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import EventsPage from './pages/EventsPage'
import EventDetailPage from './pages/EventDetailPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import MyTicketsPage from './pages/MyTicketsPage'

export default function App() {
  const { user, logout } = useAuth()

  return (
    <>
      <header className="header">
        <div className="container">
          <Link to="/" className="logo">BiletFlow</Link>
          <nav className="nav">
            <Link to="/my-tickets">My tickets</Link>
            {user ? (
              <>
                <span className="muted">{user.full_name}</span>
                <button className="btn secondary" onClick={logout}>Sign out</button>
              </>
            ) : (
              <>
                <Link to="/login">Sign in</Link>
                <Link to="/register">Register</Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="container">
        <Routes>
          <Route path="/" element={<EventsPage />} />
          <Route path="/events/:id" element={<EventDetailPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/my-tickets" element={<MyTicketsPage />} />
        </Routes>
      </main>
    </>
  )
}