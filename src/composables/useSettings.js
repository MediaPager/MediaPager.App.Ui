import { computed, ref } from 'vue'
import { api } from './useApi'
import { useAuth } from './useAuth'

const settingsTab = ref('general')
const settingsValues = ref({})
const settingsLoading = ref(false)
const settingsMessage = ref('')
const settingsError = ref('')
const browseLoadingKey = ref('')
// Setup checklist (admin only): each item tells whether a required piece is in place.
const setupChecklist = ref([])
const setupLoading = ref(false)

export const settingsGroups = [
  {
    name: 'setup',
    label: 'Setup',
    // Rendered by a dedicated checklist template. Each failed item can jump to its tab.
    fields: [],
  },
  {
    name: 'general',
    label: 'General',
    fields: [
      { key: 'Artwork:Directory', label: 'Artwork folder (posters & backdrops)', type: 'text', browse: true },
      { key: 'Frontend:BaseUrl', label: 'Site URL (for email links)', type: 'text' },
    ],
  },
  { name: 'users', label: 'Users', fields: [] },
  { name: 'catalogs', label: 'Catalogs', fields: [] },
]

export function useSettings() {
  const { canEditSettings } = useAuth()

  // The server checklist is the single source of truth for the Setup badge.
  const missingRequiredSettings = computed(() =>
    setupChecklist.value.filter((item) => !item.ok).map((item) => item.label))
  const settingsAttentionNeeded = computed(() => canEditSettings.value && missingRequiredSettings.value.length > 0)
  const setupReady = computed(() => setupChecklist.value.length > 0 && setupChecklist.value.every((item) => item.ok))

  async function fetchSetupChecklist() {
    if (!canEditSettings.value) return
    setupLoading.value = true
    try {
      const { data } = await api.get('/settings/setup-checklist')
      setupChecklist.value = data?.items ?? []
    } catch { /* keep last known */ } finally {
      setupLoading.value = false
    }
  }

  async function browseFolder(fieldKey) {
    browseLoadingKey.value = fieldKey
    try {
      const { data, status } = await api.get('/settings/browse-folder', { validateStatus: () => true })
      if (status === 200 && data?.path) {
        settingsValues.value[fieldKey] = data.path
      }
    } catch (e) {
      settingsError.value = e.response?.data?.detail ?? 'Could not open the folder picker.'
    } finally {
      browseLoadingKey.value = ''
    }
  }

  async function loadSettings() {
    if (!canEditSettings.value) return
    settingsLoading.value = true
    settingsMessage.value = ''
    settingsError.value = ''
    try {
      const { data } = await api.get('/settings')
      settingsValues.value = { ...data }
      // Warm the checklist so the header attention badge is right without visiting Settings.
      await fetchSetupChecklist()
    } catch (requestError) {
      settingsError.value = requestError.response?.data?.detail ?? 'Could not load settings.'
    } finally {
      settingsLoading.value = false
    }
  }

  async function saveSettings() {
    settingsLoading.value = true
    settingsMessage.value = ''
    settingsError.value = ''
    try {
      const payload = { ...settingsValues.value }
      const { data } = await api.put('/settings', payload)
      settingsMessage.value = data.message
    } catch (requestError) {
      settingsError.value = requestError.response?.data?.detail ?? 'Could not save settings.'
    } finally {
      settingsLoading.value = false
    }
  }

  return {
    settingsTab,
    settingsValues,
    settingsLoading,
    settingsMessage,
    settingsError,
    browseLoadingKey,
    missingRequiredSettings,
    settingsAttentionNeeded,
    setupChecklist,
    setupLoading,
    setupReady,
    fetchSetupChecklist,
    browseFolder,
    loadSettings,
    saveSettings,
  }
}
