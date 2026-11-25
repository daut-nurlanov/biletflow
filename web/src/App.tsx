import { useRef, useState } from 'react'
import { Link, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom'
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
import { AdminGuard, AdminWorkspace } from './admin/AdminLayout'
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
import { Brand } from './components/Surface'
import { Icon } from './components/Icon'

function SupportWorkspace() {
  const { user } = useAuth()
  return user?.role === 'platform_admin' ? <AdminWorkspace><Outlet /></AdminWorkspace> : <Outlet />
}

export default function App() {
  const { user, logout } = useAuth()
  const { lang, setLang, t } = useI18n()
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const closeMenu = () => setMenuOpen(false)
  const workspace = /^\/(admin|organizer)(\/|$)/.test(pathname) || (user?.role === 'platform_admin' && pathname.startsWith('/support'))
  const accountForm = ['/login', '/register', '/verify-email', '/forgot-password', '/reset-password'].includes(pathname)

  return (
    <>
      <a className="skip-link" href="#main-content">{t('Skip to main content')}</a>
      <header className="header site-header" onKeyDown={(event) => {
        if (event.key === 'Escape' && menuOpen) {
          closeMenu()
          menuButton.current?.focus()
        }
      }}>
        <div className="container">
          <Link to="/" className="logo" onClick={closeMenu}>
            <Brand />
          </Link>
          <button ref={menuButton} type="button" className="menu-toggle btn secondary" aria-expanded={menuOpen}
            aria-controls="site-navigation" aria-label={t('Menu')} onClick={() => setMenuOpen(!menuOpen)}>
            <Icon name={menuOpen ? 'close' : 'menu'} />
          </button>
          <nav id="site-navigation" className={`nav${menuOpen ? ' is-open' : ''}`} aria-label={t('Main navigation')}>
            <NavLink end to="/" onClick={closeMenu}>{t('Events')}</NavLink>
            <NavLink to="/my-tickets" onClick={closeMenu}>{t('My tickets')}</NavLink>
            <NavLink to="/my-orders" onClick={closeMenu}>{t('My orders')}</NavLink>
            <NavLink to="/support" onClick={closeMenu}>{t('Support')}</NavLink>
            {user ? (
              <>
                <NavLink to="/notifications" onClick={closeMenu}>{t('Notifications')}</NavLink>
                {user.role === 'platform_admin' && <NavLink to="/admin" onClick={closeMenu}>{t('Admin portal')}</NavLink>}
                {user.role === 'organizer' && (
                  <NavLink to="/organizer" onClick={closeMenu}>{t('Organizer dashboard')}</NavLink>
                )}
                <span className="nav-person muted" title={user.full_name}>{user.full_name}</span>
                <button className="btn secondary" onClick={() => { logout(); closeMenu() }}>
                  {t('Sign out')}
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login" onClick={closeMenu}>{t('Sign in')}</NavLink>
                <Link className="btn nav-register" to="/register" onClick={closeMenu}>{t('Register')}</Link>
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
      <main id="main-content" className={`container page${workspace ? ' workspace-page' : ''}${accountForm ? ' auth-page' : ''}`} tabIndex={-1}>
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
          <Route element={<SupportWorkspace />}>
            <Route path="/support" element={<SupportPage />} />
            <Route path="/support/new" element={<SupportNewPage />} />
            <Route path="/support/:id" element={<SupportCasePage />} />
          </Route>
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
