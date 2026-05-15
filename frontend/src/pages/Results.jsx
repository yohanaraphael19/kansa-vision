import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { getScan } from '../api/scans'
import { getReport, signReport } from '../api/reports'
import styles from './Results.module.css'

const API = import.meta.env.VITE_API_URL
const TOKEN_KEY = 'kv-token'

async function fetchBlobUrl(scanId, preprocessed = false) {
  const token = localStorage.getItem(TOKEN_KEY)
  const url = `${API}/scans/${scanId}/image${preprocessed ? '?preprocessed=true' : ''}`
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) return null
  return URL.createObjectURL(await res.blob())
}

function parseRecommendations(text) {
  if (!text) return []
  return text.split('\n').map(l => l.replace(/^[•\-]\s*/, '').trim()).filter(Boolean)
}

export default function Results() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const [scan,    setScan]    = useState(null)
  const [report,  setReport]  = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const canvasRef = useRef(null)

  const [origUrl, setOrigUrl] = useState(null)
  const [prepUrl, setPrepUrl] = useState(null)
  const [maskUrl, setMaskUrl] = useState(null)
  const [opacity, setOpacity] = useState(60)
  const [flipped, setFlipped] = useState(false)
  const [imgZoom, setImgZoom] = useState(false)

  // Sign-off state
  const [showSign,    setShowSign]    = useState(false)
  const [overrideVal, setOverrideVal] = useState('')
  const [notesVal,    setNotesVal]    = useState('')
  const [signing,     setSigning]     = useState(false)
  const [signError,   setSignError]   = useState('')

  const isNifti = scan?.filename?.endsWith('.nii.gz') || scan?.filename?.endsWith('.nii')

  useEffect(() => {
    if (location.state?.analysis_id == id) setScan(location.state)
    Promise.all([getScan(id), getReport(id)])
      .then(([s, r]) => { setScan(s); setReport(r) })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!id || !scan) return

    const isNiftiScan = scan.filename?.endsWith('.nii.gz') || scan.filename?.endsWith('.nii')

    if (isNiftiScan) {
      fetchBlobUrl(id, true).then(u => { if (u) setOrigUrl(u) })
      fetchBlobUrl(id, true).then(u => { if (u) setPrepUrl(u) })
    } else {
      fetchBlobUrl(id, false).then(u => { if (u) setOrigUrl(u) })
      fetchBlobUrl(id, true).then(u => { if (u) setPrepUrl(u) })
    }

    const maskSrc = `${API}/uploads/${id}_preprocessed_mask.png`
    fetch(maskSrc).then(r => r.ok ? setMaskUrl(maskSrc) : null).catch(() => null)
  }, [id, scan])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !prepUrl) return
    const ctx = canvas.getContext('2d')
    const baseImg = new Image()
    baseImg.crossOrigin = 'anonymous'
    baseImg.onload = () => {
      canvas.width  = baseImg.naturalWidth
      canvas.height = baseImg.naturalHeight
      ctx.drawImage(baseImg, 0, 0)
      if (!maskUrl) return
      const maskImg = new Image()
      maskImg.crossOrigin = 'anonymous'
      maskImg.onload = () => {
        const off = document.createElement('canvas')
        off.width  = canvas.width
        off.height = canvas.height
        const offCtx = off.getContext('2d')
        offCtx.drawImage(maskImg, 0, 0, canvas.width, canvas.height)
        const maskData = offCtx.getImageData(0, 0, canvas.width, canvas.height)
        const overlayData = offCtx.createImageData(canvas.width, canvas.height)
        for (let i = 0; i < maskData.data.length; i += 4) {
          const isMask = maskData.data[i] > 128
          overlayData.data[i]     = isMask ? 13  : 0
          overlayData.data[i + 1] = isMask ? 148 : 0
          overlayData.data[i + 2] = isMask ? 136 : 0
          overlayData.data[i + 3] = isMask ? Math.round(opacity * 2.55) : 0
        }
        offCtx.putImageData(overlayData, 0, 0)
        ctx.globalCompositeOperation = 'source-over'
        ctx.drawImage(off, 0, 0)
      }
      maskImg.src = maskUrl
    }
    baseImg.src = prepUrl
  }, [prepUrl, maskUrl, opacity])

  async function handleSign(e) {
    e.preventDefault()
    setSignError(''); setSigning(true)
    try {
      const updated = await signReport(id, {
        override_category: overrideVal ? parseInt(overrideVal, 10) : null,
        notes: notesVal || null,
      })
      setReport(updated)
      setShowSign(false)
    } catch (err) {
      setSignError(err.message)
    } finally {
      setSigning(false)
    }
  }

  if (loading) return <div className={styles.page}><p className={styles.stateMsg}>Loading analysis…</p></div>
  if (error)   return <div className={styles.page}><p className={styles.stateErr}>{error}</p></div>

  const recs     = parseRecommendations(report?.recommendations)
  const modality = scan?.modality ? scan.modality.toUpperCase().replace('_', ' ') : '—'
  const scanDate = scan?.created_at ? new Date(scan.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
  const signed   = report?.doctor_signed
  const reportSource = !report ? null
    : report.findings?.startsWith('MedGemma analysis unavailable')
      ? 'fallback' : 'medgemma'

  return (
    <div className={styles.page}>

      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.backBtn} onClick={() => navigate('/')}>← Workspace</button>
          <div>
            <h1 className={styles.title}>
              Analysis Result: <span className={styles.titleId}>#KV-{String(id).padStart(5, '0')}</span>
            </h1>
            <div className={styles.metaRow}>
              <span className={styles.metaItem}>{scan?.filename || '—'}</span>
              <span className={styles.metaDot}>·</span>
              <span className={styles.metaItem}>{scanDate}</span>
              <span className={styles.metaDot}>·</span>
              <span className={styles.metaItem}>{modality}</span>
              {signed && <span className={styles.signedPill}>✓ Signed</span>}
              {(scan?.filename?.endsWith('.nii.gz') || scan?.filename?.endsWith('.nii')) && (
                <span className={styles.niftiBadge}>3D VOLUME</span>
              )}
            </div>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.btnOutline} onClick={() => navigate('/history')}>
            SAVE TO HISTORY
          </button>
          <button className={styles.btnFilled} onClick={() => window.print()}>
            DOWNLOAD REPORT
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className={styles.body}>

        {/* ═══ Left (65%) ═══ */}
        <div className={styles.left}>

          {/* Diagnostic Visualization */}
          <div className={styles.card}>
            <div className={styles.cardHeadRow}>
              <h2 className={styles.cardTitle}>Diagnostic Visualization</h2>
              <div className={styles.opacityRow}>
                <span className={styles.opacityLabel}>Segmentation Opacity</span>
                <input
                  type="range" min={0} max={100} value={opacity}
                  onChange={e => setOpacity(+e.target.value)}
                  className={styles.slider}
                />
                <span className={styles.opacityVal}>{opacity}%</span>
              </div>
            </div>

            <div className={styles.imageRow}>
              {/* Original */}
              <div className={styles.imagePanel}>
                {origUrl
                  ? <img src={origUrl} alt="Original" className={styles.scanImg} />
                  : <div className={styles.imgPlaceholder}><span>Loading…</span></div>}
                <span className={styles.imgBadge}>{isNifti ? 'EXTRACTED SLICE' : 'ORIGINAL'}</span>
              </div>

              {/* Enhanced + Segmentation Mask Overlay (canvas) */}
              <div className={styles.imagePanel}>
                {prepUrl
                  ? <canvas
                      ref={canvasRef}
                      className={styles.scanImg}
                      style={{
                        transform: `${flipped ? 'scaleX(-1)' : ''} ${imgZoom ? 'scale(1.6)' : 'scale(1)'}`,
                        transition: 'transform 0.2s ease',
                      }}
                    />
                  : <div className={styles.imgPlaceholder}><span>Loading…</span></div>}
                <span className={styles.imgBadge}>
                  {maskUrl
                    ? 'ENHANCED + SEGMENTED'
                    : scan?.tasks_run?.includes('clahe') || scan?.tasks_run?.includes('denoise')
                      ? 'ENHANCED'
                      : 'ORIGINAL'}
                </span>
                <div className={styles.imgTools}>
                  <button
                    className={`${styles.imgToolBtn} ${imgZoom ? styles.imgToolActive : ''}`}
                    title="Zoom" onClick={() => setImgZoom(z => !z)}
                  >
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                      <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.3"/>
                      <path d="M9 9l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                      <path d="M3.5 5.5h4M5.5 3.5v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                  </button>
                  <button
                    className={`${styles.imgToolBtn} ${flipped ? styles.imgToolActive : ''}`}
                    title="Flip" onClick={() => setFlipped(f => !f)}
                  >
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                      <path d="M6.5 2v9M2 5l4.5-3L11 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M2 8l4.5 3L11 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Structured Clinical Report */}
          <div className={styles.card}>
            <div className={styles.reportTitleRow}>
              <h2 className={styles.cardTitle}>Structured Clinical Report</h2>
              {reportSource === 'medgemma' && (
                <span className={styles.sourceBadgeMed}>MedGemma 4B-IT</span>
              )}
              {reportSource === 'fallback' && (
                <span className={styles.sourceBadgeFallback}>AI UNAVAILABLE</span>
              )}
            </div>

            {report?.findings ? (
              <div className={styles.reportSection}>
                <span className={styles.reportLabel}>FINDINGS</span>
                <p className={styles.reportText}>{report.findings}</p>
              </div>
            ) : null}

            {report?.impression ? (
              <div className={styles.reportSection}>
                <span className={styles.reportLabel}>IMPRESSION</span>
                <p className={styles.reportText}>{report.impression}</p>
              </div>
            ) : null}

            {recs.length > 0 ? (
              <div className={styles.reportSection}>
                <span className={styles.reportLabel}>RECOMMENDATIONS</span>
                <ul className={styles.recList}>
                  {recs.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            ) : null}

            {!report?.findings && !report?.impression && recs.length === 0 && (
              <p className={styles.reportEmpty}>No clinical report generated. Run BI-RADS analysis to produce findings.</p>
            )}

            {/* Doctor notes if signed */}
            {report?.notes && (
              <div className={styles.reportSection}>
                <span className={styles.reportLabel}>DOCTOR NOTES</span>
                <p className={styles.reportText}>{report.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* ═══ Right (35%) ═══ */}
        <div className={styles.right}>

          {/* Classification */}
          <div className={styles.card}>
            <h2 className={styles.confTitle}>CLASSIFICATION</h2>

            {report ? (
              <>
                {/* BI-RADS Scale — 1 to 6, highlight current */}
                <div className={styles.biradsScale}>
                  <p className={styles.biradsScaleLabel}>BI-RADS CATEGORY</p>
                  <div className={styles.biradsTrack}>
                    {[1, 2, 3, 4, 5, 6].map(n => (
                      <div
                        key={n}
                        className={`${styles.biradsStep} ${
                          (report.override_category ?? report.bi_rads_category) === n
                            ? styles.biradsStepActive
                            : ''
                        }`}
                      >
                        <span className={styles.biradsNum}>{n}</span>
                      </div>
                    ))}
                  </div>
                  <div className={styles.biradsLabels}>
                    <span>Normal</span>
                    <span>Malignant</span>
                  </div>
                </div>

                {/* Label */}
                {report.bi_rads_label && (
                  <div className={styles.biradsLabelRow}>
                    <span className={styles.biradsLabelText}>
                      {report.override_category ?? report.bi_rads_category
                        ? `BI-RADS ${report.override_category ?? report.bi_rads_category}`
                        : ''}
                    </span>
                    <span className={styles.biradsLabelValue}>{report.bi_rads_label}</span>
                  </div>
                )}

                {/* Malignant probability bar */}
                {report.malignant_probability != null && (
                  <div className={styles.malignantRow}>
                    <div className={styles.malignantHeader}>
                      <span className={styles.malignantLabel}>MALIGNANCY RISK</span>
                      <span className={styles.malignantPct}>
                        {(report.malignant_probability * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className={styles.malignantBarWrap}>
                      <div
                        className={styles.malignantBar}
                        style={{
                          width: `${report.malignant_probability * 100}%`,
                          backgroundColor: report.malignant_probability > 0.5
                            ? '#EF4444'
                            : report.malignant_probability > 0.2
                              ? '#F59E0B'
                              : 'var(--teal)',
                        }}
                      />
                    </div>
                  </div>
                )}

                <p className={styles.classifierSource}>
                  Classified by MedGemma 4B-IT via HF Space
                </p>
              </>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                No classification data
              </p>
            )}

            <div className={styles.validatedBadge}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M6.5 1L2 3.5v4c0 2.5 2 4.8 4.5 5.4C9 12.3 11 10 11 7.5v-4L6.5 1z"
                  fill="rgba(13,148,136,0.15)" stroke="var(--teal)" strokeWidth="1.1"/>
                <path d="M4 6.5l2 2 3-3" stroke="var(--teal)" strokeWidth="1.3"
                  strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Validated Analysis
            </div>
          </div>

          {/* Quick Actions */}
          <div className={styles.card}>
            <h2 className={styles.actionsTitle}>Quick Actions</h2>
            <div className={styles.actionsList}>
              <button className={styles.actionRow} onClick={() => navigate('/')}>
                <div className={styles.actionLeft}>
                  <span className={styles.actionIcon}>
                    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                      <rect x="1" y="1" width="13" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.3"/>
                      <path d="M7.5 4.5v6M4.5 7.5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </span>
                  <span className={styles.actionLabel}>Run Another Task</span>
                </div>
                <span className={styles.actionChevron}>›</span>
              </button>

              {!signed && report && (
                <button className={styles.actionRow} onClick={() => setShowSign(s => !s)}>
                  <div className={styles.actionLeft}>
                    <span className={styles.actionIcon}>
                      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                        <path d="M3 10l2-2 1.5 1.5L10 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                        <rect x="1" y="1" width="13" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.3"/>
                      </svg>
                    </span>
                    <span className={styles.actionLabel}>Sign Report</span>
                  </div>
                  <span className={styles.actionChevron}>›</span>
                </button>
              )}

              <button className={styles.actionRow} onClick={() => navigate('/history')}>
                <div className={styles.actionLeft}>
                  <span className={styles.actionIcon}>
                    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                      <path d="M2 5l5.5 5.5L13 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      <circle cx="7.5" cy="5" r="4" stroke="currentColor" strokeWidth="1.3"/>
                    </svg>
                  </span>
                  <span className={styles.actionLabel}>Export DICOM</span>
                </div>
                <span className={styles.actionChevron}>›</span>
              </button>

              <button className={styles.actionRow}>
                <div className={styles.actionLeft}>
                  <span className={styles.actionIcon}>
                    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                      <circle cx="5" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
                      <circle cx="10.5" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
                      <path d="M1 13c0-2.5 1.8-4 4-4s4 1.5 4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                      <path d="M10.5 9.5c2 0 3.5 1 3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                  </span>
                  <span className={styles.actionLabel}>Request Peer Review</span>
                </div>
                <span className={styles.actionChevron}>›</span>
              </button>
            </div>
          </div>

          {/* Sign-off form (inline, shown when Sign Report is clicked) */}
          {showSign && (
            <div className={styles.card}>
              <h2 className={styles.actionsTitle}>Sign Report</h2>
              <form onSubmit={handleSign}>
                <div className={styles.signField}>
                  <label>Override BI-RADS (optional)</label>
                  <select value={overrideVal} onChange={e => setOverrideVal(e.target.value)} className={styles.signSelect}>
                    <option value="">Keep model category</option>
                    {[1,2,3,4,5,6].map(n => <option key={n} value={n}>BI-RADS {n}</option>)}
                  </select>
                </div>
                <div className={styles.signField}>
                  <label>Clinical Notes (optional)</label>
                  <textarea rows={3} value={notesVal} onChange={e => setNotesVal(e.target.value)}
                    placeholder="Additional observations…" className={styles.signTextarea} />
                </div>
                {signError && <p className={styles.signErr}>{signError}</p>}
                <button type="submit" className={styles.signBtn} disabled={signing}>
                  {signing ? 'Signing…' : 'Sign & Validate'}
                </button>
              </form>
            </div>
          )}

          {/* Model footer */}
          <p className={styles.modelFooter}>
            MODEL: {scan?.model_version?.toUpperCase() || 'MEDGEMMA-4B'} &nbsp;·&nbsp;
            LAT: {scan?.inference_ms ?? '—'}MS
          </p>
        </div>
      </div>
    </div>
  )
}
