import { Link, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import EventsPage from './pages/EventsPage'
import EventDetailPage from './pages/EventDetailPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import MyTicketsPage from './pages/MyTicketsPage'
import SupportNewPage from './pages/SupportNewPage'
import SupportPage from './pages/SupportPage'
import SupportCasePage from './pages/SupportCasePage'
import { EventLayout, OrganizerGuard } from './organizer/Layout'
import { EventOverviewPage, OrganizerEventsPage } from './organizer/EventsPage'
import AttendeesPage from './organizer/AttendeesPage'
import { OrderPage, OrdersPage } from './organizer/OrdersPage'
import AnalyticsPage from './organizer/AnalyticsPage'
import StaffPage from './organizer/StaffPage'
import HistoryPage from './organizer/HistoryPage'
import EventSupportPage from './organizer/SupportPage'
import { AdminGuard } from './admin/AdminLayout'
import AdminOverview from './admin/Overview'
import AdminUsers from './admin/Users'
import AdminEvents from './admin/Events'
import AdminOrders from './admin/Orders'
import { Moderation, Money } from './admin/Moderation'
import { EditEventPage, NewEventPage } from './organizer/EventFormPage'
import SetupPage from './organizer/SetupPage'
import PromoPage from './organizer/PromoPage'
import ProfilePage from './organizer/ProfilePage'

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
            <Link to="/support">Support</Link>
            {user ? (
              <>
                {user.role === 'platform_admin' && <Link to="/admin">Admin portal</Link>}
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
          <Route path="/support" element={<SupportPage />} />
          <Route path="/support/new" element={<SupportNewPage />} />
          <Route path="/support/:id" element={<SupportCasePage />} />
          <Route path="/admin" element={<AdminGuard />}>
            <Route index element={<AdminOverview />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="events" element={<AdminEvents />} />
            <Route path="orders" element={<AdminOrders />} />
            <Route path="moderation" element={<Moderation />} />
            <Route path="money" element={<Money />} />
          </Route>
          <Route path="/organizer" element={<OrganizerGuard />}>
            <Route index element={<OrganizerEventsPage />} />
            <Route path="new" element={<NewEventPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="events/:eventId/edit" element={<EditEventPage />} />
            <Route path="events/:eventId" element={<EventLayout />}>
              <Route index element={<EventOverviewPage />} />
              <Route path="setup" element={<SetupPage />} />
              <Route path="promotions" element={<PromoPage />} />
              <Route path="attendees" element={<AttendeesPage />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="orders/:orderId" element={<OrderPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="staff" element={<StaffPage />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="support" element={<EventSupportPage />} />
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
