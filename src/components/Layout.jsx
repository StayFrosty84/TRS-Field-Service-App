import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useFeatures } from '../lib/useFeatures.js';
import Icon from './Icon.jsx';

const ALL_TABS = [
  { to: '/', label: 'Home', ico: 'home', end: true },
  { to: '/work', label: 'Work', ico: 'wrench' },
  { to: '/accounts', label: 'Accounts', ico: 'building' },
  { to: '/contacts', label: 'Contacts', ico: 'user' },
  { to: '/settings', label: 'Settings', ico: 'settings' },
];

// Top-level routes show the tab bar; deeper routes show a back button instead.
const ROOT_PATHS = ALL_TABS.map((t) => t.to);

export default function Layout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const features = useFeatures();
  const isRoot = ROOT_PATHS.includes(pathname);
  const tabs = ALL_TABS.filter((t) => !(t.to === '/' && !features.dashboard));

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
            <Icon name={t.ico} size={24} />
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
