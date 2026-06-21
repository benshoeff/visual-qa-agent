import { NavLink } from 'react-router-dom'

const links = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/pages', label: 'Pages', icon: '📄' },
  { to: '/runner', label: 'Test Runner', icon: '▶️' },
  { to: '/schedules', label: 'Schedules', icon: '⏰' },
  { to: '/reports', label: 'Reports', icon: '📋' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>Visual QA</h2>
          <span className="badge">Dashboard</span>
        </div>
        <nav>
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <span>{l.icon}</span>
              {l.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main">{children}</main>
    </div>
  )
}
