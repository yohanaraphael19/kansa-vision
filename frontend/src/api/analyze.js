const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const TOKEN_KEY = 'kv-token'

export async function runAnalysis(file, modality, tasks, segModel = '', sliceIdx = null) {
  const token = localStorage.getItem(TOKEN_KEY)
  const formData = new FormData()
  formData.append('file', file)
  formData.append('modality', modality)
  formData.append('tasks', tasks.join(','))
  if (segModel) formData.append('seg_model', segModel)
  if (sliceIdx !== null) formData.append('slice_idx', sliceIdx)

  const response = await fetch(`${API_URL}/scans/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.detail || 'Analysis failed')
  }
  return response.json()
}

export async function getHealth() {
  const response = await fetch(`${API_URL}/health`)
  return response.json()
}
