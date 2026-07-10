const TOKEN_KEY = 'dcsmart_analytics_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

// AuthContext se suscribe acá para poder reaccionar a un 401 sin que api.js
// tenga que conocer React (evita una dependencia circular con el contexto).
let onUnauthorized = null
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth) {
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  let resp
  try {
    resp = await fetch(`/api${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    })
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor.')
  }

  if (resp.status === 401 && auth) onUnauthorized?.()

  let data = null
  try { data = await resp.json() } catch { /* respuesta sin body */ }

  if (!resp.ok) {
    throw new ApiError(resp.status, data?.error || `Error ${resp.status}`)
  }
  return data
}

function toQueryString(query = {}) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, v)
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export const api = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  me: () => request('/auth/me'),

  getGrupos: () => request('/data/grupos'),
  getDashboard: (query) => request(`/data/dashboard${toQueryString(query)}`),
  getDatasetOptions: (dataset, query) => request(`/data/${dataset}/options${toQueryString(query)}`),
  getDataset: (dataset, query) => request(`/data/${dataset}${toQueryString(query)}`),
  getEtlStatus: () => request('/data/etl/status'),

  askAi: (payload) => request('/ai', { method: 'POST', body: payload }),

  getUsers: (search) => request(`/access/users${toQueryString({ search })}`),
  updateUserAccess: (id, body) => request(`/access/users/${id}`, { method: 'PUT', body })
}
