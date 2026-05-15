import { useState, useEffect } from 'react'
import { getDoctors, createDoctor, deactivateDoctor, activateDoctor } from '../api/admin'
import styles from './Admin.module.css'

export default function Admin() {
  const [doctors, setDoctors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [form, setForm] = useState({ full_name: '', email: '', password: '' })
  const [formErr, setFormErr] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toggling, setToggling] = useState(null)

  useEffect(() => {
    reload()
  }, [])

  function reload() {
    setLoading(true)
    getDoctors()
      .then(setDoctors)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleAdd(e) {
    e.preventDefault()
    setFormErr('')
    setSubmitting(true)
    try {
      const doc = await createDoctor({ ...form, role: 'doctor' })
      setDoctors(prev => [doc, ...prev])
      setForm({ full_name: '', email: '', password: '' })
    } catch (err) {
      setFormErr(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function toggle(doc) {
    setToggling(doc.id)
    try {
      const updated = doc.is_active
        ? await deactivateDoctor(doc.id)
        : await activateDoctor(doc.id)
      setDoctors(prev => prev.map(d => d.id === updated.id ? updated : d))
    } catch (err) {
      setError(err.message)
    } finally {
      setToggling(null)
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Admin — Doctor Management</h1>
        <p className={styles.subtitle}>Register and manage clinician accounts.</p>
      </header>

      {/* Add doctor form */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Add Doctor</h2>
        <form className={styles.addForm} onSubmit={handleAdd}>
          <div className={styles.field}>
            <label>Full Name</label>
            <input
              type="text"
              value={form.full_name}
              onChange={set('full_name')}
              placeholder="Dr. Jane Doe"
              required
            />
          </div>
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
            <label>Temporary Password</label>
            <input
              type="password"
              value={form.password}
              onChange={set('password')}
              placeholder="••••••••"
              required
              minLength={8}
            />
          </div>
          {formErr && <p className={styles.error}>{formErr}</p>}
          <button type="submit" className={styles.addBtn} disabled={submitting}>
            {submitting ? 'Adding…' : '+ Add Doctor'}
          </button>
        </form>
      </div>

      {/* Roster */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>
          Doctor Roster
          <span className={styles.count}>{doctors.length}</span>
        </h2>

        {loading ? (
          <p className={styles.status}>Loading…</p>
        ) : error ? (
          <p className={styles.statusErr}>{error}</p>
        ) : doctors.length === 0 ? (
          <p className={styles.status}>No doctors registered yet.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {doctors.map(doc => (
                <tr key={doc.id} className={styles.row}>
                  <td className={styles.nameCell}>
                    <div className={styles.avatar}>
                      {doc.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                    </div>
                    {doc.full_name}
                  </td>
                  <td className={styles.emailCell}>{doc.email}</td>
                  <td>
                    <span className={doc.is_active ? styles.active : styles.inactive}>
                      {doc.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button
                      className={doc.is_active ? styles.deactivateBtn : styles.activateBtn}
                      onClick={() => toggle(doc)}
                      disabled={toggling === doc.id}
                    >
                      {toggling === doc.id
                        ? '…'
                        : doc.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
