import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useFeatures } from '../lib/useFeatures.js';

const ALL_TABS = [
  { to: '/', label: 'Work', ico: '🧰', end: true },
  { to: '/accounts', label: 'Accounts', ico: '🏢' },
  { to: '/contacts', label: 'Contacts', ico: '👤' },
  { to: '/billing', label: 'Billing', ico: '💵' },
  { to: '/settings', label: 'Settings', ico: '⚙️' },
];

// Top-level routes show the tab bar; deeper routes show a back button instead.
const ROOT_PATHS = ALL_TABS.map((t) => t.to);

export default function Layout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const features = useFeatures();
  const isRoot = ROOT_PATHS.includes(pathname);
  const tabs = ALL_TABS.filter((t) => t.to !== '/billing' || features.billing);

  return (
    <div className="app">
      <header className="topbar">
        {!isRoot && (
          <button className="back" onClick={() => navigate(-1)} aria-label="Back">
            ‹ Back
          </button>
        )}
      </header>

      <main className="app__main">
        <Outlet />
      </main>

      <nav className="nav">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="ico">{t.ico}</span>
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
