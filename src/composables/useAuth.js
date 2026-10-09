import { computed, ref } from 'vue'
import { api } from './useApi'

const accessToken = ref(localStorage.getItem('mediapager.accessToken') ?? '')
const currentUserEmail = ref(localStorage.getItem('mediapager.userEmail') ?? '')
const savedScopes = JSON.parse(localStorage.getItem('mediapager.scopes') ?? '[]')
const userScopes = ref(Array.isArray(savedScopes) ? savedScopes : [])

// 401 anywhere means the session is dead; drop local auth state.
api.interceptors.response.use((response) => response, (requestError) => {
  if (requestError.response?.status === 401 && localStorage.getItem('mediapager.accessToken')) {
    localStorage.removeItem('mediapager.accessToken')
    localStorage.removeItem('mediapager.scopes')
    accessToken.value = ''
    userScopes.value = []
  }
  return Promise.reject(requestError)
})

export function useAuth() {
  const canInvite = computed(() => userScopes.value.includes('admin:super') || userScopes.value.includes('admin:can-invite'))
  const canEditSettings = computed(() => userScopes.value.includes('admin:super') || userScopes.value.includes('admin:settings-edit'))
  const canEditCatalogs = computed(() => userScopes.value.includes('admin:super') || userScopes.value.includes('admin:catalogs-edit'))
  const isSuperAdmin = computed(() => userScopes.value.includes('admin:super'))
  const userInitial = computed(() => (currentUserEmail.value.trim()[0] ?? '?').toUpperCase())

  function setSession(email, token, scopes) {
    localStorage.setItem('mediapager.accessToken', token)
    localStorage.setItem('mediapager.scopes', JSON.stringify(scopes))
    localStorage.setItem('mediapager.userEmail', email)
    accessToken.value = token
    userScopes.value = scopes
    currentUserEmail.value = email
  }

  function signOut() {
    localStorage.removeItem('mediapager.accessToken')
    localStorage.removeItem('mediapager.scopes')
    localStorage.removeItem('mediapager.userEmail')
    accessToken.value = ''
    userScopes.value = []
    currentUserEmail.value = ''
  }

  return {
    accessToken,
    currentUserEmail,
    userScopes,
    canInvite,
    canEditSettings,
    canEditCatalogs,
    isSuperAdmin,
    userInitial,
    setSession,
    signOut,
  }
}
