import { Link, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import EventsPage from './pages/EventsPage'
import EventDetailPage from './pages/EventDetailPage'
import LoginPage from './pages/LoginPage'

export default function App() {
  const { user, logout } = useAuth()

  return (
    <>
      <header className="header">
        <div className="container">
          <Link to="/" className="logo">BiletFlow</Link>
          <nav className="nav">
            {user ? (
              <>
                <span className="muted">{user.full_name}</span>
                <button className="btn secondary" onClick={logout}>Выйти</button>
              </>
            ) : (
              <Link to="/login">Войти</Link>
            )}
          </nav>
        </div>
      </header>
      <main className="container">
        <Routes>
          <Route path="/" element={<EventsPage />} />
          <Route path="/events/:id" element={<EventDetailPage />} />
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </main>
    </>
  )
}