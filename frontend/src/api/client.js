const BASE = import.meta.env.VITE_API_URL
const TOKEN_KEY = 'kv-token'

async function request(method, path, { body, form } = {}) {
  const token = localStorage.getItem(TOKEN_KEY)
  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  let bodyInit
  if (form) {
    bodyInit = form // FormData — let browser set Content-Type
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    bodyInit = JSON.stringify(body)
  }

  const res = await fetch(`${BASE}${path}`, { method, headers, body: bodyInit })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw Object.assign(new Error(err.detail || `HTTP ${res.status}`), { status: res.status })
  }
  return res.status === 204 ? null : res.json()
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, { body }),
  patch: (path, body) => request('PATCH', path, { body }),
  delete: (path) => request('DELETE', path),
  upload: (path, form) => request('POST', path, { form }),
}
