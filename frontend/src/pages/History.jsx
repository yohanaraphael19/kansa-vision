import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getScans, deleteScan } from '../api/scans'
import { useAuth } from '../context/AuthContext'
import styles from './History.module.css'

const PAGE_SIZE = 7 // 1 featured + 6 grid cards

// ── Thumbnail ────────────────────────────────────────────────────────────────

function ScanThumbnail({ scanId }) {
  const [blobUrl, setBlobUrl] = useState(null)

  useEffect(() => {
    if (!scanId) return
    const token = localStorage.getItem('kv-token')
    const headers = token ? { Authorization: `Bearer ${token}` } : {}
    let active = true
    let createdUrl = null

    async function load() {
      for (const prep of [true, false]) {
        try {
          const res = await fetch(
            `${import.meta.env.VITE_API_URL}/scans/${scanId}/image?preprocessed=${prep}`,
            { headers }
          )
          if (res.ok) {
            const blob = await res.blob()
            createdUrl = URL.createObjectURL(blob)
            if (active) setBlobUrl(createdUrl)
            return
          }
        } catch {}
      }
    }
    load()
    return () => {
      active = false
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [scanId])

  if (!blobUrl) return <div className={styles.thumbPlaceholder} />
  return <img src={blobUrl} alt="" className={styles.thumbImg} />
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const taskLabels = {
  denoise:      'Denoising',
  clahe:        'Enhancement',
  segmentation: 'Segmentation',
  birads:       'Classification',
  report:       'Report',
}

function formatTasks(tasksRun) {
  if (!tasksRun || !tasksRun.trim()) return 'None'
  return tasksRun.split(',').map(t => taskLabels[t.trim()] || t.trim()).join(', ')
}

function daysSince(dateStr) {
  return (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function History() {
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const [scans, setScans]     = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(new Set())

  async function handleDelete(e, id) {
    e.stopPropagation()
    if (!window.confirm('Delete this scan permanently?')) return
    setDeleting(prev => new Set(prev).add(id))
    try {
      await deleteScan(id)
      setScans(prev => prev.filter(s => s.analysis_id !== id))
    } catch {
      alert('Could not delete scan.')
    } finally {
      setDeleting(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }
  const [search, setSearch] = useState('')
  const [modFilter, setModFilter] = useState('All Modalities')
  const [taskFilter, setTaskFilter] = useState('All Tasks')
  const [dateFilter, setDateFilter] = useState('Last 30 Days')
  const [page, setPage] = useState(1)

  useEffect(() => {
    getScans()
      .then(data => setScans(data || []))
      .catch(() => setScans([]))
      .finally(() => setLoading(false))
  }, [])

  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1) }, [search, modFilter, taskFilter, dateFilter])

  const filtered = useMemo(() => {
    return scans.filter(s => {
      // Search: filename or scan ID
      if (search) {
        const q = search.toLowerCase()
        const matchName = (s.filename || '').toLowerCase().includes(q)
        const matchId   = String(s.analysis_id).includes(q)
        if (!matchName && !matchId) return false
      }

      // Modality — filter value equals the stored modality string directly
      if (modFilter !== 'All Modalities') {
        if ((s.modality || '').toLowerCase() !== modFilter.toLowerCase()) return false
      }

      // Task filter
      if (taskFilter !== 'All Tasks') {
        const run = (s.tasks_run || '').toLowerCase()
        const map = {
          'Denoising':     () => run.includes('denoise'),
          'Segmentation':  () => run.includes('segmentation'),
          'Classification':() => run.includes('birads'),
          'Report':        () => s.has_report,
        }
        if (map[taskFilter] && !map[taskFilter]()) return false
      }

      // Date range
      const days = daysSince(s.created_at)
      if (dateFilter === 'Last 7 Days'   && days > 7)   return false
      if (dateFilter === 'Last 30 Days'  && days > 30)  return false
      if (dateFilter === 'Last 3 Months' && days > 90)  return false

      return true
    })
  }, [scans, search, modFilter, taskFilter, dateFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageScans  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const featured   = pageScans[0] || null
  const gridItems  = pageScans.slice(1)

  function reset() {
    setSearch('')
    setModFilter('All Modalities')
    setTaskFilter('All Tasks')
    setDateFilter('Last 30 Days')
  }

  // Pagination: show at most 5 page buttons around current page
  function pageNumbers() {
    const pages = []
    const start = Math.max(1, page - 2)
    const end   = Math.min(totalPages, start + 4)
    for (let i = start; i <= end; i++) pages.push(i)
    return pages
  }

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Analysis History</h1>
          <p className={styles.subtitle}>View and manage your diagnostic analysis records.</p>
        </div>
        <span className={styles.recordsBadge}>
          <span className={styles.recordsDot} />
          {loading ? 'LOADING…' : `${filtered.length} RECORD${filtered.length !== 1 ? 'S' : ''} TOTAL`}
        </span>
      </div>

      {/* ── Filter bar ── */}
      <div className={styles.filterBar}>
        <div className={styles.searchWrap}>
          <svg className={styles.searchIcon} width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            className={styles.searchInput}
            placeholder="Search by filename or scan ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className={styles.filterSelect} value={modFilter} onChange={e => setModFilter(e.target.value)}>
          {['All Modalities','ct','ultrasound','xray','mri','mammography','histopathology'].map(o => (
            <option key={o} value={o}>{o === 'All Modalities' ? o : o.toUpperCase()}</option>
          ))}
        </select>
        <select className={styles.filterSelect} value={taskFilter} onChange={e => setTaskFilter(e.target.value)}>
          {['All Tasks','Denoising','Segmentation','Classification','Report'].map(o => <option key={o}>{o}</option>)}
        </select>
        <select className={styles.filterSelect} value={dateFilter} onChange={e => setDateFilter(e.target.value)}>
          {['Last 30 Days','Last 7 Days','Last 3 Months','All Time'].map(o => <option key={o}>{o}</option>)}
        </select>
        <button className={styles.resetBtn} onClick={reset}>RESET</button>
      </div>

      <div className={styles.scrollArea}>

        {/* ── Loading ── */}
        {loading && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>◎</div>
            <p className={styles.emptyTitle}>Loading records…</p>
          </div>
        )}

        {/* ── Empty ── */}
        {!loading && filtered.length === 0 && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>◈</div>
            <p className={styles.emptyTitle}>
              {scans.length === 0 ? 'No analyses yet' : 'No results match your filters'}
            </p>
            <p className={styles.emptySub}>
              {scans.length === 0
                ? 'Upload a scan from the Workspace to get started.'
                : 'Try adjusting the search or filter options.'}
            </p>
            {scans.length > 0 && (
              <button className={styles.resetBtn} style={{ marginTop: 12 }} onClick={reset}>
                Clear Filters
              </button>
            )}
          </div>
        )}

        {/* ── Featured ── */}
        {!loading && featured && (() => {
          return (
            <div className={styles.featured}>
              <div className={styles.featuredThumb}>
                <ScanThumbnail scanId={featured.analysis_id} />
                <span className={styles.latestBadge}>LATEST RESULT</span>
              </div>
              <div className={styles.featuredInfo}>
                <div className={styles.featuredTop}>
                  <h2 className={styles.featuredTitle}>{featured.filename}</h2>
                  <span className={styles.completeBadge}>
                    {featured.has_report ? 'COMPLETE' : 'PENDING'}
                  </span>
                </div>
                <div className={styles.featuredMeta}>
                  <div className={styles.metaRow}>
                    <span className={styles.metaIcon}>◎</span>
                    <span className={styles.metaLabel}>Scan ID</span>
                    <span className={styles.metaValue}>#KV-{String(featured.analysis_id).padStart(5, '0')}</span>
                  </div>
                  <div className={styles.metaRow}>
                    <span className={styles.metaIcon}>◑</span>
                    <span className={styles.metaLabel}>Modality</span>
                    <span className={styles.metaValue}>{(featured.modality || '').toUpperCase()}</span>
                  </div>
                  <div className={styles.metaRow}>
                    <span className={styles.metaIcon}>⬡</span>
                    <span className={styles.metaLabel}>Tasks</span>
                    <span className={styles.metaValue}>{formatTasks(featured.tasks_run)}</span>
                  </div>
                  <div className={styles.metaRow}>
                    <span className={styles.metaIcon}>◈</span>
                    <span className={styles.metaLabel}>Date</span>
                    <span className={styles.metaValue}>{new Date(featured.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className={styles.featuredActions}>
                  <button
                    className={styles.viewBtn}
                    onClick={() => navigate(`/results/${featured.analysis_id}`)}
                  >
                    VIEW FULL REPORT
                  </button>
                  <button className={styles.shareBtn} title="Copy link" onClick={() => {
                    navigator.clipboard?.writeText(window.location.origin + `/results/${featured.analysis_id}`)
                  }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <circle cx="11" cy="3" r="1.8" stroke="currentColor" strokeWidth="1.2"/>
                      <circle cx="3" cy="7" r="1.8" stroke="currentColor" strokeWidth="1.2"/>
                      <circle cx="11" cy="11" r="1.8" stroke="currentColor" strokeWidth="1.2"/>
                      <path d="M4.7 8l4.6 2.2M9.3 4.8L4.7 7" stroke="currentColor" strokeWidth="1.2"/>
                    </svg>
                  </button>
                  <button
                    className={styles.deleteBtn}
                    title="Delete scan"
                    disabled={deleting.has(featured.analysis_id)}
                    onClick={e => handleDelete(e, featured.analysis_id)}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2 4h10M5 4V2.5h4V4M5.5 6v4.5M8.5 6v4.5M3 4l.7 7.5h6.6L11 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div className={styles.featuredAccuracy}>
                <div className={styles.accuracyMain}>
                  <svg className={styles.shieldIcon} width="28" height="28" viewBox="0 0 28 28" fill="none">
                    <path d="M14 3L4 7v7c0 5.25 4.3 10.15 10 11.35C19.7 24.15 24 19.25 24 14V7L14 3z" fill="rgba(13,148,136,0.2)" stroke="rgba(13,148,136,0.6)" strokeWidth="1.2"/>
                    <path d="M9 14l3.5 3.5L19 11" stroke="rgba(13,148,136,0.8)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className={styles.accuracyNum}>{filtered.length}</span>
                  <span className={styles.accuracyLabel}>Total Analyses</span>
                  <span className={styles.accuracySub}>In Current Filter</span>
                </div>
                <div className={styles.quickActions}>
                  <button className={styles.quickBtn} onClick={() => navigate('/')}>
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                      <rect x="1" y="1" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.2"/>
                      <path d="M4 6.5h5M6.5 4v5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                    New Analysis
                  </button>
                  <button className={styles.quickBtn} onClick={() => navigate(`/results/${featured.analysis_id}`)}>
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                      <circle cx="4.5" cy="5" r="2" stroke="currentColor" strokeWidth="1.2"/>
                      <circle cx="9" cy="5" r="2" stroke="currentColor" strokeWidth="1.2"/>
                      <path d="M1 11c0-2 1.6-3 3.5-3s3.5 1 3.5 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                      <path d="M9 8c1.5 0 3 .8 3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                    View Report
                  </button>
                </div>
              </div>
            </div>
          )
        })()}

        {/* ── Grid ── */}
        {!loading && gridItems.length > 0 && (
          <div className={styles.grid}>
            {gridItems.map(item => {
              return (
                <div
                  key={item.analysis_id}
                  className={styles.gridCard}
                  onClick={() => navigate(`/results/${item.analysis_id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className={styles.cardThumb}>
                    <ScanThumbnail scanId={item.analysis_id} />
                    <span className={styles.modalityBadge}>{(item.modality || '').toUpperCase()}</span>
                    <button
                      className={styles.menuBtn}
                      title="Delete scan"
                      disabled={deleting.has(item.analysis_id)}
                      onClick={e => handleDelete(e, item.analysis_id)}
                    >
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                        <path d="M2 4h10M5 4V2.5h4V4M5.5 6v4.5M8.5 6v4.5M3 4l.7 7.5h6.6L11 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                  <div className={styles.cardBody}>
                    <h3 className={styles.cardTitle}>{item.filename}</h3>
                    <div className={styles.cardMeta}>
                      <div className={styles.cardMetaRow}>
                        <span className={styles.cardMetaLabel}>Tasks</span>
                        <span className={styles.cardMetaVal}>{formatTasks(item.tasks_run)}</span>
                      </div>
                      <div className={styles.cardMetaRow}>
                        <span className={styles.cardMetaLabel}>Date</span>
                        <span className={styles.cardMetaVal}>{new Date(item.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className={styles.cardFooter}>
                      <span className={`${styles.statusBadge} ${item.has_report ? styles.complete : styles.review}`}>
                        {item.has_report ? 'COMPLETE' : 'PENDING'}
                      </span>
                      <button className={styles.detailsLink}>DETAILS →</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Pagination ── */}
        {!loading && totalPages > 1 && (
          <div className={styles.pagination}>
            <button
              className={styles.pageBtn}
              disabled={page === 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >‹</button>

            {pageNumbers().map(n => (
              <button
                key={n}
                className={`${styles.pageBtn} ${page === n ? styles.pageActive : ''}`}
                onClick={() => setPage(n)}
              >{n}</button>
            ))}

            {pageNumbers()[pageNumbers().length - 1] < totalPages && (
              <>
                <span className={styles.pageDots}>…</span>
                <button
                  className={`${styles.pageBtn} ${page === totalPages ? styles.pageActive : ''}`}
                  onClick={() => setPage(totalPages)}
                >{totalPages}</button>
              </>
            )}

            <button
              className={styles.pageBtn}
              disabled={page === totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            >›</button>
          </div>
        )}

      </div>
    </div>
  )
}
