import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import styles from './Login.module.css'

export default function ChangePassword() {
  const { user, changePassword, logout, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // If not logged in at all, go to login
  if (!isAuthenticated) {
    navigate('/login', { replace: true })
    return null
  }

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (form.next !== form.confirm) {
      setError('New passwords do not match.')
      return
    }
    if (form.next.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    setSubmitting(true)
    try {
      await changePassword(form.current, form.next)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const isForced = user?.must_change_password

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.logo}>KansaVision</h1>
          <span className={styles.tagline}>SECURITY</span>
          <p className={styles.subtitle}>
            {isForced
              ? 'You must set a new password before continuing.'
              : 'Change your account password.'}
          </p>
        </div>

        {isForced && (
          <div className={styles.infoBanner}>
            Your account was created by an administrator. Please choose a personal password to proceed.
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label>Current Password</label>
            <input
              type="password"
              value={form.current}
              onChange={set('current')}
              placeholder="Enter current password"
              required
              autoFocus
            />
          </div>
          <div className={styles.field}>
            <label>New Password</label>
            <input
              type="password"
              value={form.next}
              onChange={set('next')}
              placeholder="Min. 8 characters"
              required
            />
          </div>
          <div className={styles.field}>
            <label>Confirm New Password</label>
            <input
              type="password"
              value={form.confirm}
              onChange={set('confirm')}
              placeholder="Repeat new password"
              required
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button type="submit" className={styles.btn} disabled={submitting}>
            {submitting ? 'Updating…' : 'Set New Password'}
          </button>
        </form>

        {!isForced && (
          <button
            onClick={() => navigate(-1)}
            style={{ marginTop: 12, fontSize: 13, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ← Back
          </button>
        )}

        {isForced && (
          <button
            onClick={logout}
            style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Sign out
          </button>
        )}
      </div>
    </div>
  )
}
