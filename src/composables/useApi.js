import axios from 'axios'

// Single shared axios instance. The launcher serves runtime-config.json next to the
// UI so the API URL can change without a rebuild; main.js awaits loadRuntimeConfig()
// before mounting so no API call ever fires against the placeholder base.
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/',
})

export async function loadRuntimeConfig() {
  try {
    const response = await fetch('/runtime-config.json')
    const runtimeConfig = response.ok ? await response.json() : null
    if (runtimeConfig?.apiBaseUrl) api.defaults.baseURL = runtimeConfig.apiBaseUrl
  } catch { /* same-origin fallback */ }
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('mediapager.accessToken')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// The API origin (used to build absolute stream URLs, since the SPA host would
// otherwise serve index.html for proxied paths).
export function apiOrigin() {
  const apiBase = api.defaults.baseURL
  return apiBase.startsWith('http') ? new URL(apiBase).origin : window.location.origin
}
