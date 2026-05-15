import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getHealth } from '../api/analyze'
import styles from './Sidebar.module.css'

const NAV = [
  { to: '/', label: 'Workspace', icon: '🔬' },
  { to: '/history', label: 'History', icon: '📋' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]

export default function Sidebar() {
  const { user, isAdmin, logout } = useAuth()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const [online, setOnline] = useState(null)

  useEffect(() => {
    getHealth()
      .then(() => setOnline(true))
      .catch(() => setOnline(false))
  }, [])

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const initials = user?.full_name
    ? user.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  const cls = `${styles.sidebar} ${collapsed ? styles.collapsed : ''}`

  return (
    <aside className={cls}>
      <div className={styles.brand}>
        {!collapsed && (
          <>
            <span className={styles.brandName}>KansaVision</span>
          </>
        )}
        <button
          className={styles.toggleBtn}
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      <nav className={styles.nav}>
        {NAV.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `${styles.navItem} ${isActive ? styles.active : ''}`
            }
            title={collapsed ? label : undefined}
          >
            <span className={styles.navIcon}>{icon}</span>
            {!collapsed && label}
          </NavLink>
        ))}
        {isAdmin && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `${styles.navItem} ${isActive ? styles.active : ''}`
            }
            title={collapsed ? 'Admin' : undefined}
          >
            <span className={styles.navIcon}>🏥</span>
            {!collapsed && 'Admin'}
          </NavLink>
        )}
      </nav>

      <div className={styles.footer}>
        <div className={styles.userBlock}>
          <div className={styles.avatar}>{initials}</div>
          {!collapsed && (
            <div className={styles.userInfo}>
              <span className={styles.userName}>{user?.full_name}</span>
              <span className={styles.userRole}>
                {isAdmin ? 'HOSPITAL IT' : 'DOCTOR'}
              </span>
            </div>
          )}
          <button className={styles.logoutBtn} onClick={handleLogout} title="Log out">
            ↩
          </button>
        </div>
        {!collapsed && (
          <div className={styles.systemStatus}>
            <span className={`${styles.statusDot} ${online === false ? styles.statusOffline : styles.statusOnline}`} />
            <span className={styles.statusText}>
              {online === null ? 'Connecting…' : online ? 'System Online' : 'System Offline'}
            </span>
          </div>
        )}
        {!collapsed && <div className={styles.version}>v0.1.0</div>}
      </div>
    </aside>
  )
}
