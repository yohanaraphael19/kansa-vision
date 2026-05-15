import { api } from './client'

export const getDoctors = () => api.get('/admin/doctors')
export const createDoctor = (body) => api.post('/admin/doctors', body)
export const deactivateDoctor = (id) => api.patch(`/admin/doctors/${id}/deactivate`)
export const activateDoctor = (id) => api.patch(`/admin/doctors/${id}/activate`)
