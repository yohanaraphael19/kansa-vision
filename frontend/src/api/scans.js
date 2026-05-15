import { api } from './client'

export function uploadScan(file, tasks) {
  const form = new FormData()
  form.append('file', file)
  form.append('tasks', tasks.join(','))
  return api.upload('/scans/upload', form)
}

export const getModels    = () => api.get('/scans/models')
export const getNiftiInfo = (scanId) => api.get(`/scans/${scanId}/nifti-info`)
export const getScans  = () => api.get('/scans')
export const getScan   = (id) => api.get(`/scans/${id}`)
export const deleteScan = (id) => api.delete(`/scans/${id}`)
