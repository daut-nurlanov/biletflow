import { Link, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import EventsPage from './pages/EventsPage'
import EventDetailPage from './pages/EventDetailPage'
import LoginPage from './pages/LoginPage'
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
            {user ? (
              <>
                {user.role === 'organizer' && (
                  <Link to="/organizer">Кабинет организатора</Link>
                )}
                <span className="muted">{user.full_name}</span>
                <button className="btn secondary" onClick={logout}>
                  Выйти
                </button>
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
                  Страница не найдена.{' '}
                  <Link to="/organizer">Мои мероприятия</Link>
                </p>
              }
            />
          </Route>
        </Routes>
      </main>
    </>
  )
}
