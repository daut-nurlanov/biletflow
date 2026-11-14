import { Link, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import EventsPage from './pages/EventsPage'
import EventDetailPage from './pages/EventDetailPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import MyTicketsPage from './pages/MyTicketsPage'
import { EventLayout, OrganizerGuard } from './organizer/Layout'
import { EventOverviewPage, OrganizerEventsPage } from './organizer/EventsPage'
import AttendeesPage from './organizer/AttendeesPage'
import { OrderPage, OrdersPage } from './organizer/OrdersPage'

export default function App() {
  const { user, logout } = useAuth()

  return (
    <>
      <header className="header">
        <div className="container">
          <Link to="/" className="logo">
            BiletFlow
          </Link>
          <nav className="nav">
            <Link to="/my-tickets">My tickets</Link>
            {user ? (
              <>
                {user.role === 'organizer' && (
                  <Link to="/organizer">Organizer dashboard</Link>
                )}
                <span className="muted">{user.full_name}</span>
                <button className="btn secondary" onClick={logout}>
                  Sign out
                </button>
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
          <Route path="/organizer" element={<OrganizerGuard />}>
            <Route index element={<OrganizerEventsPage />} />
            <Route path="events/:eventId" element={<EventLayout />}>
              <Route index element={<EventOverviewPage />} />
              <Route path="attendees" element={<AttendeesPage />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="orders/:orderId" element={<OrderPage />} />
            </Route>
            <Route
              path="*"
              element={
                <p>
                  Page not found. <Link to="/organizer">My events</Link>
                </p>
              }
            />
          </Route>
        </Routes>
      </main>
    </>
  )
}