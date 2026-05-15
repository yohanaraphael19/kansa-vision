import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import styles from './Login.module.css'

export default function Login() {
  const { login, bootstrap, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname || '/'

  const [needsBootstrap, setNeedsBootstrap] = useState(null)
  const [form, setForm] = useState({ fullName: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const API = import.meta.env.VITE_API_URL

  useEffect(() => {
    if (isAuthenticated) { navigate(from, { replace: true }); return }
    fetch(`${API}/auth/status`)
      .then(r => r.json())
      .then(d => setNeedsBootstrap(d.needs_bootstrap))
      .catch(() => setNeedsBootstrap(false))
  }, [isAuthenticated])

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      if (needsBootstrap) {
        await bootstrap(form.fullName, form.email, form.password)
      } else {
        await login(form.email, form.password)
      }
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (needsBootstrap === null) {
    return <div className={styles.page}><p className={styles.loading}>Connecting…</p></div>
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.logo}>KansaVision</h1>
          <span className={styles.tagline}>CLINICAL PRECISION</span>
          <p className={styles.subtitle}>
            {needsBootstrap
              ? 'Initialize Hospital IT Admin'
              : 'Doctor / Admin Sign-In'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {needsBootstrap && (
            <div className={styles.field}>
              <label>Full Name</label>
              <input
                type="text"
                value={form.fullName}
                onChange={set('fullName')}
                placeholder="Dr. Jane Doe"
                required
              />
            </div>
          )}
          <div className={styles.field}>
            <label>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={set('email')}
              placeholder="doctor@hospital.com"
              required
            />
          </div>
          <div className={styles.field}>
            <label>Password</label>
            <input
              type="password"
              value={form.password}
              onChange={set('password')}
              placeholder="••••••••"
              required
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button type="submit" className={styles.btn} disabled={submitting}>
            {submitting
              ? 'Please wait…'
              : needsBootstrap
              ? 'Create Admin Account'
              : 'Sign In'}
          </button>
        </form>

        <p className={styles.disclaimer}>
          Clinical Decision Support — not a diagnosis. Requires radiologist review and sign-off.
        </p>
      </div>
    </div>
  )
}
