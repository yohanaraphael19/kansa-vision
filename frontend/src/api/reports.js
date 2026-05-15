import { api } from './client'

export const getReport = (scanId) => api.get(`/reports/${scanId}`)
export const signReport = (scanId, body) => api.post(`/reports/${scanId}/sign`, body)
