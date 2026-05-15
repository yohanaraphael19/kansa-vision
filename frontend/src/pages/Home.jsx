import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { runAnalysis } from '../api/analyze'
import { getModels } from '../api/scans'
import styles from './Home.module.css'

const MODALITIES = ['ULTRA', 'MAMMOGRAPHY', 'MRI', 'CT SCAN', 'X-RAY']

const TASKS = [
  { id: 'denoise',      icon: '◈', label: 'Smart Denoising',      desc: 'Remove artifact noise while preserving edge fidelity' },
  { id: 'clahe',        icon: '◑', label: 'Contrast Enhancement', desc: 'CLAHE-based adaptive contrast for deep tissue visibility' },
  { id: 'segmentation', icon: '◎', label: 'Auto-Segmentation',    desc: 'Isolate organs/anomalies via U-Net models' },
  { id: 'birads',       icon: '⬡', label: 'Classification',       desc: 'Pathology categorization based on global datasets' },
  { id: 'report',       icon: '≡', label: 'Report Generation',    desc: 'Synthesize findings into editable clinical summary' },
]

const QUEUE = [
  { id: 'ingestion',   label: 'IMAGE INGESTION' },
  { id: 'denoising',   label: 'DENOISING' },
  { id: 'enhancement', label: 'ENHANCEMENT' },
  { id: 'segmentation', label: 'SEGMENTATION' },
]

const TASK_IDS = ['denoise', 'clahe', 'segmentation', 'birads', 'report']

export default function Home() {
  const navigate = useNavigate()
  const fileInputRef = useRef()

  const [file, setFile]                 = useState(null)
  const [previewUrl, setPreviewUrl]     = useState(null)
  const [dragging, setDragging]         = useState(false)
  const [zoomIdx, setZoomIdx]           = useState(0)
  const [contrastIdx, setContrastIdx]   = useState(0)

  const ZOOM_LEVELS     = [1, 1.5, 2]
  const CONTRAST_LEVELS = [100, 140, 200]
  const [modality, setModality]         = useState('ULTRA')
  const [selectedTasks, setSelectedTasks] = useState(['birads'])
  const [models, setModels]             = useState({})
  const [segModel, setSegModel]         = useState('')
  const [niftiMeta, setNiftiMeta]       = useState(null)
  const [sliceIdx, setSliceIdx]         = useState(null)
  const [running, setRunning]           = useState(false)
  const [error, setError]               = useState('')
  const [progress, setProgress]         = useState({ ingestion: 0, denoising: 0, enhancement: 0, segmentation: 0 })
  const timersRef = useRef([])

  useEffect(() => () => timersRef.current.forEach(clearTimeout), [])

  useEffect(() => { getModels().then(setModels).catch(() => {}) }, [])

  useEffect(() => {
    const label = { ULTRA: 'ultrasound', MAMMOGRAPHY: 'mammography', MRI: 'mri', 'CT SCAN': 'ct', 'X-RAY': 'xray' }[modality] ?? 'ultrasound'
    const available = models[label] ?? []
    const def = available.find(m => m.is_default) ?? available[0]
    setSegModel(def ? def.filename : '')
  }, [modality, models])

  async function pickFile(f) {
    if (!f) return
    setFile(f)
    setError('')

    const isNifti = f.name.endsWith('.nii') || f.name.endsWith('.nii.gz')

    if (isNifti) {
      setPreviewUrl(null)
      setNiftiMeta(null)
      try {
        const token = localStorage.getItem('kv-token')
        const formData = new FormData()
        formData.append('file', f)
        if (sliceIdx !== null) formData.append('slice_idx', sliceIdx)
        const res = await fetch(`${import.meta.env.VITE_API_URL}/scans/preview-slice`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        })
        if (res.ok) {
          const blob = await res.blob()
          setPreviewUrl(URL.createObjectURL(blob))
          setNiftiMeta({
            nSlices:    parseInt(res.headers.get('X-Nifti-Slices')     || '0'),
            bestSlice:  parseInt(res.headers.get('X-Nifti-Best-Slice') || '0'),
            nTimepoints: parseInt(res.headers.get('X-Nifti-Timepoints') || '1'),
            sliceUsed:  parseInt(res.headers.get('X-Nifti-Slice-Used')  || '0'),
          })
          setSliceIdx(parseInt(res.headers.get('X-Nifti-Slice-Used') || '0'))
        }
      } catch (err) {
        console.error('NIfTI preview failed:', err)
      }
    } else {
      setPreviewUrl(URL.createObjectURL(f))
      setNiftiMeta(null)
      setSliceIdx(null)
    }

    setZoomIdx(0)
    setContrastIdx(0)
  }

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false)
    pickFile(e.dataTransfer.files[0])
  }, [])

  function toggleTask(id) {
    setSelectedTasks(p => p.includes(id) ? p.filter(t => t !== id) : [...p, id])
  }

  function animateBar(key, duration, from = 0, to = 90) {
    const steps = 30
    const interval = duration / steps
    let current = from
    const step = (to - from) / steps
    const id = setInterval(() => {
      current = Math.min(current + step, to)
      setProgress(p => ({ ...p, [key]: Math.round(current) }))
      if (current >= to) clearInterval(id)
    }, interval)
    timersRef.current.push(id)
  }

  function finishAllBars() {
    setProgress({ ingestion: 100, denoising: 100, enhancement: 100, segmentation: 100 })
  }

  function resetBars() {
    setProgress({ ingestion: 0, denoising: 0, enhancement: 0, segmentation: 0 })
  }

  async function handleRun() {
    if (!file) { setError('Please upload a scan first.'); return }
    if (selectedTasks.length === 0) { setError('Select at least one task.'); return }
    setError('')
    setRunning(true)
    resetBars()

    // Staggered progress animation while real API call runs
    animateBar('ingestion',   800,  0, 90)
    const t1 = setTimeout(() => animateBar('denoising',   1000, 0, 85), 600)
    const t2 = setTimeout(() => animateBar('enhancement', 900,  0, 75), 1400)
    timersRef.current.push(t1, t2)

    const apiTasks = selectedTasks.filter(t => TASK_IDS.includes(t))
      .map(t => t === 'report' ? 'birads' : t)
      .filter((v, i, a) => a.indexOf(v) === i)

    try {
      const result = await runAnalysis(file, modality, apiTasks, segModel, sliceIdx)
      finishAllBars()
      const t3 = setTimeout(() => navigate(`/results/${result.analysis_id}`, { state: result }), 400)
      timersRef.current.push(t3)
    } catch (err) {
      setError(err.message)
      resetBars()
      setRunning(false)
    }
  }

  const modalityLabel = {
    'ULTRA': 'ultrasound',
    'MAMMOGRAPHY': 'mammography',
    'MRI': 'mri',
    'CT SCAN': 'ct',
    'X-RAY': 'xray',
  }[modality] ?? 'ultrasound'

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Diagnostic Workspace</h1>
          <p className={styles.subtitle}>Upload medical imaging files and configure your diagnostic pipeline.</p>
        </div>
      </div>

      <div className={styles.workspace}>
        {/* ── Left panel ── */}
        <div className={styles.left}>
          {/* Upload zone */}
          <div
            className={`${styles.dropzone} ${dragging ? styles.dragging : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".dcm,.dicom,.png,.jpg,.jpeg,.bmp,.tiff,.tif,.nii,.nii.gz"
              className={styles.hiddenInput}
              onChange={e => pickFile(e.target.files[0])}
            />
            <div className={styles.uploadIcon}>
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <circle cx="20" cy="20" r="19" stroke="rgba(13,148,136,0.4)" strokeWidth="1.5"/>
                <path d="M20 28V16M14 22l6-6 6 6" stroke="#0D9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M13 30h14" stroke="#0D9488" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            {file ? (
              <p className={styles.dropFilename}>{file.name}</p>
            ) : (
              <p className={styles.dropText}>Drag &amp; drop DICOM, JPG, or PNG files here</p>
            )}
            <div className={styles.uploadBtns}>
              <button className={styles.btnSelect} onClick={() => fileInputRef.current.click()}>
                SELECT FILES
              </button>
              <button className={styles.btnPacs} disabled title="PACS integration coming soon">
                PACS IMPORT
              </button>
            </div>
            <p className={styles.dropHint}>Supports DICOM · JPG · PNG · NIfTI · max 20 MB</p>
          </div>

          {/* Image preview panel */}
          <div className={styles.previewPanel}>
            <div className={styles.previewToolbar}>
              <span className={styles.toolbarTitle}>
                {file ? file.name : 'Preview'}
              </span>
              <div className={styles.toolbarActions}>
                <button
                  className={`${styles.toolBtn} ${zoomIdx > 0 ? styles.toolBtnActive : ''}`}
                  title="Cycle zoom level"
                  onClick={() => setZoomIdx(i => (i + 1) % ZOOM_LEVELS.length)}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    <path d="M4 6h4M6 4v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                  Zoom {ZOOM_LEVELS[zoomIdx]}×
                </button>
                <button
                  className={`${styles.toolBtn} ${contrastIdx > 0 ? styles.toolBtnActive : ''}`}
                  title="Cycle contrast level"
                  onClick={() => setContrastIdx(i => (i + 1) % CONTRAST_LEVELS.length)}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M7 1.5v11M1.5 7h11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.4"/>
                    <path d="M7 1.5A5.5 5.5 0 0 1 7 12.5V1.5z" fill="currentColor"/>
                  </svg>
                  Contrast {CONTRAST_LEVELS[contrastIdx]}%
                </button>
                <button className={styles.toolBtn} title="Segmentation overlay (available after analysis)">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M7 1L13 4.5 7 8 1 4.5 7 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                    <path d="M1 7.5L7 11l6-3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                  Layers
                </button>
              </div>
            </div>
            <div
              className={styles.previewContent}
              style={{ overflow: zoomIdx > 0 ? 'auto' : 'hidden', alignItems: zoomIdx > 0 ? 'flex-start' : 'center' }}
            >
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Scan preview"
                  className={styles.previewImg}
                  style={{
                    width: `${ZOOM_LEVELS[zoomIdx] * 100}%`,
                    maxWidth: 'none',
                    filter: `contrast(${CONTRAST_LEVELS[contrastIdx]}%)`,
                    transition: 'width 0.2s ease, filter 0.2s ease',
                  }}
                />
              ) : (
                <div className={styles.previewEmpty}>
                  <svg width="48" height="48" viewBox="0 0 48 48" fill="none" opacity="0.25">
                    <rect x="8" y="8" width="32" height="32" rx="4" stroke="white" strokeWidth="1.5"/>
                    <circle cx="24" cy="22" r="7" stroke="white" strokeWidth="1.5"/>
                    <path d="M12 36l8-8 4 4 6-8 6 12" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
                  </svg>
                  <p className={styles.previewEmptyText}>Waiting for image upload...</p>
                  <p className={styles.previewEmptyHint}>Supported formats: DICOM · JPG · PNG</p>
                </div>
              )}
            </div>
          </div>

          {/* NIfTI slice controls */}
          {niftiMeta && (
            <div className={styles.niftiControls}>
              <div className={styles.niftiBadge}>
                3D VOLUME · {niftiMeta.nSlices} slices
                {niftiMeta.nTimepoints > 1 && ` · ${niftiMeta.nTimepoints} time points`}
              </div>
              <div className={styles.sliceRow}>
                <span className={styles.sliceLabel}>SLICE</span>
                <input
                  type="range"
                  min={0}
                  max={niftiMeta.nSlices - 1}
                  value={sliceIdx ?? niftiMeta.bestSlice}
                  onChange={async e => {
                    const idx = +e.target.value
                    setSliceIdx(idx)
                    const token = localStorage.getItem('kv-token')
                    const fd = new FormData()
                    fd.append('file', file)
                    fd.append('slice_idx', idx)
                    const res = await fetch(`${import.meta.env.VITE_API_URL}/scans/preview-slice`, {
                      method: 'POST',
                      headers: { Authorization: `Bearer ${token}` },
                      body: fd,
                    })
                    if (res.ok) setPreviewUrl(URL.createObjectURL(await res.blob()))
                  }}
                  className={styles.slider}
                />
                <span className={styles.sliceVal}>{sliceIdx ?? niftiMeta.bestSlice}</span>
              </div>
              <button
                className={styles.autoSliceBtn}
                onClick={() => setSliceIdx(niftiMeta.bestSlice)}
              >
                Jump to best slice ({niftiMeta.bestSlice})
              </button>
            </div>
          )}
        </div>

        {/* ── Right panel ── */}
        <div className={styles.right}>
          {/* Modality tabs */}
          <div className={styles.modalityCard}>
            <p className={styles.sectionLabel}>IMAGING MODALITY</p>
            <div className={styles.modalityTabs}>
              {MODALITIES.map(m => (
                <button
                  key={m}
                  className={`${styles.modalityTab} ${modality === m ? styles.modalityActive : ''}`}
                  onClick={() => setModality(m)}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Tasks */}
          <div className={styles.tasksCard}>
            <p className={styles.sectionLabel}>ANALYSIS TASKS</p>
            {TASKS.map(task => (
              <label key={task.id} className={styles.taskRow}>
                <div className={styles.taskLeft}>
                  <span className={styles.taskIcon}>{task.icon}</span>
                  <div className={styles.taskText}>
                    <span className={styles.taskLabel}>{task.label}</span>
                    <span className={styles.taskDesc}>{task.desc}</span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={selectedTasks.includes(task.id)}
                  onChange={() => toggleTask(task.id)}
                  className={styles.taskCheck}
                />
              </label>
            ))}
          </div>

          {selectedTasks.includes('segmentation') && (models[modalityLabel] ?? []).length > 0 && (
            <div className={styles.modelCard}>
              <p className={styles.sectionLabel}>SEGMENTATION MODEL</p>
              <select
                className={styles.modelSelect}
                value={segModel}
                onChange={e => setSegModel(e.target.value)}
              >
                {(models[modalityLabel] ?? []).map(m => (
                  <option key={m.filename} value={m.filename}>
                    {m.label} — {m.description}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && <p className={styles.error}>{error}</p>}

          <button
            className={styles.runBtn}
            onClick={handleRun}
            disabled={running}
          >
            {running
              ? <><span className={styles.spinner} /> PROCESSING…</>
              : 'RUN DIAGNOSTIC ANALYSIS'}
          </button>
        </div>
      </div>

      {/* ── Process queue strip ── */}
      <div className={styles.queueStrip}>
        <div className={styles.queueLeft}>
          <span className={styles.queueTitle}>ACTIVE PROCESS QUEUE</span>
          <div className={styles.queueItems}>
            {QUEUE.map(q => (
              <div key={q.id} className={styles.queueItem}>
                <span className={styles.queueLabel}>{q.label}</span>
                <div className={styles.queueBarWrap}>
                  <div
                    className={styles.queueBar}
                    style={{ width: `${progress[q.id]}%` }}
                  />
                </div>
                <span className={styles.queuePct}>{progress[q.id]}%</span>
              </div>
            ))}
          </div>
        </div>
        <span className={`${styles.systemBadge} ${running ? styles.systemActive : ''}`}>
          <span className={styles.systemDot} />
          {running ? 'PROCESSING' : 'SYSTEM IDLE'}
        </span>
      </div>
    </div>
  )
}
