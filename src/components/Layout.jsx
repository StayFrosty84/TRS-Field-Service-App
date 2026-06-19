import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

const TABS = [
  { to: '/', label: 'Work', ico: '🧰', end: true },
  { to: '/accounts', label: 'Accounts', ico: '🏢' },
  { to: '/contacts', label: 'Contacts', ico: '👤' },
  { to: '/settings', label: 'Settings', ico: '⚙️' },
];

// Top-level routes show the tab bar; deeper routes show a back button instead.
const ROOT_PATHS = TABS.map((t) => t.to);

export default function Layout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isRoot = ROOT_PATHS.includes(pathname);

  const title =
    TABS.find((t) => t.to === pathname)?.fullLabel ||
    TABS.find((t) => t.to === pathname)?.label ||
    'Field Service';

  return (
    <div className="app">
      <header className="topbar">
        {!isRoot && (
          <button className="back" onClick={() => navigate(-1)} aria-label="Back">
            ‹ Back
          </button>
        )}
        <h1>{isRoot ? title : ''}</h1>
      </header>

      <main className="app__main">
        <Outlet />
      </main>

      <nav className="nav">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="ico">{t.ico}</span>
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
