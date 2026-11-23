import { Link, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import { LANGS, useI18n } from './i18n'
import EventsPage from './pages/EventsPage'
import EventDetailPage from './pages/EventDetailPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import VerifyEmailPage from './pages/VerifyEmailPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
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
import PaymentFailures from './admin/PaymentFailures'
import NotificationsPage from './pages/NotificationsPage'
import MyOrdersPage from './pages/MyOrdersPage'
import { Moderation, Money } from './admin/Moderation'
import { EditEventPage, NewEventPage } from './organizer/EventFormPage'
import SetupPage from './organizer/SetupPage'
import PromoPage from './organizer/PromoPage'
import ProfilePage from './organizer/ProfilePage'

export default function App() {
  const { user, logout } = useAuth()
  const { lang, setLang, t } = useI18n()

  return (
    <>
      <header className="header">
        <div className="container">
          <Link to="/" className="logo">
            BiletFlow
          </Link>
          <nav className="nav">
            <Link to="/my-tickets">{t('My tickets')}</Link>
            <Link to="/my-orders">{t('My orders')}</Link>
            <Link to="/support">{t('Support')}</Link>
            {user ? (
              <>
                <Link to="/notifications">{t('Notifications')}</Link>
                {user.role === 'platform_admin' && <Link to="/admin">{t('Admin portal')}</Link>}
                {user.role === 'organizer' && (
                  <Link to="/organizer">{t('Organizer dashboard')}</Link>
                )}
                <span className="muted">{user.full_name}</span>
                <button className="btn secondary" onClick={logout}>
                  {t('Sign out')}
                </button>
              </>
            ) : (
              <>
                <Link to="/login">{t('Sign in')}</Link>
                <Link to="/register">{t('Register')}</Link>
              </>
            )}
            <select
              aria-label={t('Language')}
              value={lang}
              onChange={(e) => setLang(e.target.value as typeof lang)}
            >
              {LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </nav>
        </div>
      </header>
      <main className="container">
        {user?.is_email_verified === false && (
          <p className="verification-notice" role="status">
            {t('Your email is not verified.')} <Link to="/verify-email">{t('Verify email')}</Link>
          </p>
        )}
        <Routes>
          <Route path="/" element={<EventsPage />} />
          <Route path="/events/:id" element={<EventDetailPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/my-tickets" element={<MyTicketsPage />} />
          <Route path="/my-orders" element={<MyOrdersPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/support" element={<SupportPage />} />
          <Route path="/support/new" element={<SupportNewPage />} />
          <Route path="/support/:id" element={<SupportCasePage />} />
          <Route path="/admin" element={<AdminGuard />}>
            <Route index element={<AdminOverview />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="events" element={<AdminEvents />} />
            <Route path="orders" element={<AdminOrders />} />
            <Route path="payment-failures" element={<PaymentFailures />} />
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
