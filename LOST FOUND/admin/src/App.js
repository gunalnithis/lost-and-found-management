import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { PanelLeft, Search, BellDot, X } from 'lucide-react';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Items from './pages/Items';
import LostContactRequests from './pages/LostContactRequests';
import FoundContactRequests from './pages/FoundContactRequests';
import Feedbacks from './pages/Feedbacks';
import AdvertisementRequests from './pages/AdvertisementRequests';

const API_BASE = 'http://127.0.0.1:8000';
const DISMISSED_NOTIFICATIONS_KEY = 'adminDismissedNotifications';

const routeTitles = {
  '/': 'Overview Dashboard',
  '/users': 'User Management',
  '/items': 'Item Moderation',
  '/contacts/lost': 'Lost Item Requests',
  '/contacts/found': 'Found Item Requests',
  '/advertisements/requests': 'Advertisement Requests',
  '/feedbacks': 'Feedback Inbox',
};

const AdminShell = () => {
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationsError, setNotificationsError] = useState('');
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState(() => {
    try {
      const saved = window.localStorage.getItem(DISMISSED_NOTIFICATIONS_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const pageTitle = useMemo(
    () => routeTitles[location.pathname] || 'Overview Dashboard',
    [location.pathname],
  );

  const today = useMemo(
    () => new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    [],
  );

  const visibleNotifications = notifications.filter(
    (notification) => !dismissedNotificationIds.includes(String(notification.id)),
  );

  const fetchAdminNotifications = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/contact/admin-notifications?limit=40`);
      if (!response.ok) {
        throw new Error('Unable to load admin notifications');
      }
      const data = await response.json();
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      setNotificationsError('');
    } catch (error) {
      setNotificationsError(error.message || 'Unable to load notifications');
    }
  };

  const dismissNotification = (notificationId) => {
    setDismissedNotificationIds((current) => {
      const next = current.includes(String(notificationId))
        ? current
        : [...current, String(notificationId)];
      window.localStorage.setItem(DISMISSED_NOTIFICATIONS_KEY, JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    fetchAdminNotifications();
    const timerId = window.setInterval(fetchAdminNotifications, 15000);
    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    setNotificationsOpen(false);
  }, [location.pathname]);

  return (
    <div className="admin-ui min-h-screen text-slate-100">
      <div className="admin-bg-orb admin-bg-orb-one" aria-hidden="true" />
      <div className="admin-bg-orb admin-bg-orb-two" aria-hidden="true" />

      <div className="relative flex min-h-screen">
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

        <main className="flex-1 p-4 md:p-6 lg:p-8">
          <header className="admin-topbar mb-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsSidebarOpen((prev) => !prev)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700/60 bg-slate-900/70 text-slate-100 md:hidden"
                aria-label="Toggle sidebar"
              >
                <PanelLeft size={18} />
              </button>

              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">Admin Workspace</p>
                <h1 className="text-lg font-semibold text-slate-100 md:text-2xl">{pageTitle}</h1>
              </div>
            </div>

            <div className="hidden items-center gap-3 md:flex">
              <div className="admin-search-box">
                <Search size={16} className="text-cyan-300/80" />
                <span className="text-sm text-slate-400">{today}</span>
              </div>

              <div className="relative">
                <button
                  type="button"
                  className="admin-icon-btn relative"
                  aria-label="Notifications"
                  onClick={() => setNotificationsOpen((prev) => !prev)}
                >
                  <BellDot size={16} />
                  {visibleNotifications.length > 0 && (
                    <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-red-500 px-1 text-center text-[10px] font-bold text-white">
                      {visibleNotifications.length > 9 ? '9+' : visibleNotifications.length}
                    </span>
                  )}
                </button>

                {notificationsOpen && (
                  <div className="absolute right-0 z-50 mt-2 w-[360px] overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/95 shadow-2xl shadow-black/50 backdrop-blur">
                    <div className="flex items-center justify-between border-b border-slate-700/60 px-4 py-3">
                      <p className="text-sm font-bold text-slate-100">Admin Notifications</p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={fetchAdminNotifications}
                          className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                        >
                          Refresh
                        </button>
                        <button
                          type="button"
                          onClick={() => setNotificationsOpen(false)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800"
                          aria-label="Close notifications"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                      {notificationsError && (
                        <p className="px-4 py-3 text-xs font-semibold text-rose-400">{notificationsError}</p>
                      )}

                      {!notificationsError && visibleNotifications.length === 0 && (
                        <p className="px-4 py-6 text-center text-sm text-slate-400">
                          No pending requests right now.
                        </p>
                      )}

                      {visibleNotifications.map((notification) => (
                        <div
                          key={`${notification.type}-${notification.id}`}
                          className="flex items-start gap-3 border-b border-slate-800/80 px-4 py-3 transition hover:bg-slate-800/60 last:border-b-0"
                        >
                          <Link
                            to={notification.link}
                            onClick={() => setNotificationsOpen(false)}
                            className="min-w-0 flex-1"
                          >
                            <p className="text-xs font-black uppercase tracking-wide text-cyan-300">
                              {notification.title}
                            </p>
                            <p className="mt-1 text-sm text-slate-200">{notification.message}</p>
                            <p className="mt-1 text-[11px] text-slate-500">
                              {notification.createdAt
                                ? new Date(notification.createdAt).toLocaleString()
                                : 'Just now'}
                            </p>
                          </Link>

                          <button
                            type="button"
                            onClick={() => dismissNotification(notification.id)}
                            className="mt-1 inline-flex h-8 shrink-0 items-center rounded-md border border-slate-700 px-2 text-[11px] font-semibold text-slate-300 hover:bg-slate-800"
                            aria-label={`Dismiss ${notification.title}`}
                          >
                            Dismiss
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>

          <section className="max-w-7xl">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/users" element={<Users />} />
              <Route path="/items" element={<Items />} />
              <Route path="/contacts/lost" element={<LostContactRequests />} />
              <Route path="/contacts/found" element={<FoundContactRequests />} />
              <Route path="/advertisements/requests" element={<AdvertisementRequests />} />
              <Route path="/feedbacks" element={<Feedbacks />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </section>
        </main>
      </div>
    </div>
  );
};

function App() {
  return (
    <Router>
      <AdminShell />
    </Router>
  );
}

export default App;
