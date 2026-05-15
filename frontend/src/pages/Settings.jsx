import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import styles from './Settings.module.css'

const SETTINGS_KEY = 'kv-settings'

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {} } catch { return {} }
}

function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
}

const ENGINES    = ['VisionCore v4.2 (Stable)', 'VisionCore v4.1 (Legacy)', 'VisionCore v5.0 (Beta)']
const THRESHOLDS = ['Standard (95% Confidence)', 'High (98% Confidence)', 'Permissive (90% Confidence)']
const TIERS      = ['Real-time (GPU Accelerated)', 'Standard (CPU)', 'Batch Processing']
const LOCALITIES = ['Cloud Processing (Secure)', 'On-Premise Only', 'Hybrid']

const COLORS = [
  { id: 'navy',   hex: '#1B2A4A' },
  { id: 'red',    hex: '#dc2626' },
  { id: 'teal',   hex: '#0D9488' },
  { id: 'orange', hex: '#f97316' },
  { id: 'yellow', hex: '#eab308' },
]

function getTheme() {
  return localStorage.getItem('kv-theme') || 'light'
}

function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t)
  localStorage.setItem('kv-theme', t)
}

export default function Settings() {
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()

  const saved0 = loadSettings()

  const [engine,    setEngine]    = useState(saved0.engine    ?? ENGINES[0])
  const [threshold, setThreshold] = useState(saved0.threshold ?? THRESHOLDS[0])
  const [tier,      setTier]      = useState(saved0.tier      ?? TIERS[0])
  const [locality,  setLocality]  = useState(saved0.locality  ?? LOCALITIES[0])

  const [theme,    setThemeState] = useState(getTheme)
  const [color,    setColor]      = useState(saved0.color    ?? 'teal')
  const [contrast, setContrast]   = useState(saved0.contrast ?? 50)

  const [mfa,       setMfa]       = useState(saved0.mfa       ?? true)
  const [hipaa,     setHipaa]     = useState(saved0.hipaa     ?? true)
  const [autoPurge, setAutoPurge] = useState(saved0.autoPurge ?? false)

  const [saved, setSaved] = useState(false)

  useEffect(() => { applyTheme(theme) }, [])

  function toggleTheme(t) {
    setThemeState(t)
    applyTheme(t)
  }

  function handleSave() {
    saveSettings({ engine, threshold, tier, locality, color, contrast, mfa, hipaa, autoPurge })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleReset() {
    setEngine(ENGINES[0]); setThreshold(THRESHOLDS[0])
    setTier(TIERS[0]); setLocality(LOCALITIES[0])
    setContrast(50); setColor('teal')
    setMfa(true); setHipaa(true); setAutoPurge(false)
    toggleTheme('light')
    saveSettings({})
  }

  const initials = user?.full_name
    ? user.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  return (
    <div className={styles.page}>
      {/* ── Top header ── */}
      <div className={styles.topBar}>
        <div>
          <h1 className={styles.title}>System Preferences</h1>
          <p className={styles.subtitle}>Configure your diagnostic environment and account parameters.</p>
        </div>
        <div className={styles.userInfo}>
          <button className={styles.bellBtn} title="Notifications">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1.5C5.5 1.5 4 3.5 4 6v4l-1.5 2h11L12 10V6c0-2.5-1.5-4-4-4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
              <path d="M6.5 13.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.3"/>
            </svg>
          </button>
          <div className={styles.userMeta}>
            <span className={styles.userName}>{user?.full_name || 'Dr. Sarah Chen'}</span>
            <span className={styles.userRole}>{isAdmin ? 'HOSPITAL IT ADMIN' : 'SENIOR RADIOLOGIST'}</span>
          </div>
          <div className={styles.avatar}>{initials}</div>
        </div>
      </div>

      <div className={styles.layout}>
        {/* ── Main column ── */}
        <div className={styles.main}>

          {/* Model Preferences */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.cardIcon}>⚙</span>
              <h2 className={styles.cardTitle}>Model Preferences</h2>
            </div>
            <div className={styles.grid2x2}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>PRIMARY VISION ENGINE</label>
                <select className={styles.formSelect} value={engine} onChange={e => setEngine(e.target.value)}>
                  {ENGINES.map(o => <option key={o}>{o}</option>)}
                </select>
                <span className={styles.formHint}>Optimized for MRI and CT scans</span>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>ANOMALY THRESHOLD</label>
                <select className={styles.formSelect} value={threshold} onChange={e => setThreshold(e.target.value)}>
                  {THRESHOLDS.map(o => <option key={o}>{o}</option>)}
                </select>
                <span className={styles.formHint}>Affects automated flagging sensitivity</span>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>PROCESSING TIER</label>
                <select className={styles.formSelect} value={tier} onChange={e => setTier(e.target.value)}>
                  {TIERS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>DATA LOCALITY</label>
                <select className={styles.formSelect} value={locality} onChange={e => setLocality(e.target.value)}>
                  {LOCALITIES.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Display Preferences */}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.cardIcon}>◑</span>
              <h2 className={styles.cardTitle}>Display Preferences</h2>
            </div>

            {/* Theme toggle */}
            <div className={styles.prefRow}>
              <div>
                <span className={styles.prefLabel}>System Theme</span>
                <span className={styles.prefDesc}>Choose between light and dark interface</span>
              </div>
              <div className={styles.themeToggle}>
                <button
                  className={`${styles.themeBtn} ${theme === 'light' ? styles.themeActive : ''}`}
                  onClick={() => toggleTheme('light')}
                >Light</button>
                <button
                  className={`${styles.themeBtn} ${theme === 'dark' ? styles.themeActive : ''}`}
                  onClick={() => toggleTheme('dark')}
                >Dark</button>
              </div>
            </div>

            {/* Overlay color */}
            <div className={styles.prefRow}>
              <span className={styles.prefLabel}>OVERLAY HIGHLIGHT COLOR</span>
              <div className={styles.swatches}>
                {COLORS.map(c => (
                  <button
                    key={c.id}
                    className={`${styles.swatch} ${color === c.id ? styles.swatchActive : ''}`}
                    style={{ background: c.hex }}
                    onClick={() => setColor(c.id)}
                    title={c.id}
                  />
                ))}
              </div>
            </div>

            {/* Contrast slider */}
            <div className={styles.prefRow}>
              <span className={styles.prefLabel}>DIAGNOSTIC CONTRAST</span>
              <div className={styles.sliderRow}>
                <span className={styles.sliderEnd}>NATURAL</span>
                <input
                  type="range"
                  min={0} max={100}
                  value={contrast}
                  onChange={e => setContrast(+e.target.value)}
                  className={styles.slider}
                />
                <span className={styles.sliderEnd}>ENHANCED</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Sidebar ── */}
        <div className={styles.sidebar}>

          {/* Account Status */}
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Account Status</h2>
            <div className={styles.quotaRow}>
              <span className={styles.quotaLabel}>API QUOTA USAGE</span>
              <span className={styles.quotaVal}>8.4k / 10k</span>
            </div>
            <div className={styles.progressWrap}>
              <div className={styles.progressBar} style={{ width: '84%' }} />
            </div>
            <p className={styles.quotaHint}>Monthly cycle resets in 12 days</p>
            <div className={styles.accountMeta}>
              <div className={styles.accountRow}>
                <span className={styles.accountLabel}>Active Plan</span>
                <span className={styles.planBadge}>Professional</span>
              </div>
              <div className={styles.accountRow}>
                <span className={styles.accountLabel}>Parallel Threads</span>
                <span className={styles.accountVal}>16 Core</span>
              </div>
              <div className={styles.accountRow}>
                <span className={styles.accountLabel}>Storage Used</span>
                <span className={styles.accountVal}>124.5 GB</span>
              </div>
            </div>
            <button className={styles.upgradeBtn}>UPGRADE PLAN</button>
          </div>

          {/* Change Password */}
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Account Security</h2>
            <p className={styles.supportText} style={{ marginBottom: 12 }}>
              Change your login password at any time.
            </p>
            <button
              className={styles.upgradeBtn}
              style={{ background: 'var(--navy)' }}
              onClick={() => navigate('/change-password')}
            >
              CHANGE PASSWORD
            </button>
          </div>

          {/* Support */}
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Support</h2>
            <p className={styles.supportHeading}>Need assistance?</p>
            <p className={styles.supportText}>Our technical team is available 24/7 for clinical integration support.</p>
            <a href="#" className={styles.supportLink}>Open Support Ticket →</a>
          </div>

          {/* Security */}
          <div className={styles.card}>
            <p className={styles.securityLabel}>SECURITY</p>
            <div className={styles.securityChecks}>
              <label className={styles.checkRow}>
                <input type="checkbox" checked={mfa} onChange={e => setMfa(e.target.checked)} className={styles.checkbox} />
                <span>Multi-factor Authentication</span>
              </label>
              <label className={styles.checkRow}>
                <input type="checkbox" checked={hipaa} onChange={e => setHipaa(e.target.checked)} className={styles.checkbox} />
                <span>HIPAA Compliance Logging</span>
              </label>
              <label className={styles.checkRow}>
                <input type="checkbox" checked={autoPurge} onChange={e => setAutoPurge(e.target.checked)} className={styles.checkbox} />
                <span>Auto-purge Scan Data</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer bar ── */}
      <div className={styles.footerBar}>
        <button className={styles.resetBtn} onClick={handleReset}>
          RESET TO DEFAULT
        </button>
        <button className={styles.saveBtn} onClick={handleSave}>
          {saved ? '✓ SAVED' : 'SAVE CHANGES'}
        </button>
      </div>
    </div>
  )
}
