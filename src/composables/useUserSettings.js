import { ref } from 'vue'
import { api } from './useApi'

// Per-user preferences served by /me/settings (backend UserSetting rows). The
// only known preference today is `autoplay` (TV: auto-advance to the next episode).
const autoplay = ref(false)
const userSettings = ref({})
const userSettingsLoaded = ref(false)

export function useUserSettings() {
  async function loadUserSettings() {
    userSettingsLoaded.value = false
    try {
      const { data } = await api.get('/me/settings')
      const settings = data.settings ?? {}
      userSettings.value = settings
      autoplay.value = settings.autoplay === 'true'
    } catch {
      autoplay.value = false
      userSettings.value = {}
    } finally {
      userSettingsLoaded.value = true
    }
  }

  async function setAutoplay(value) {
    autoplay.value = value
    userSettings.value = { ...userSettings.value, autoplay: String(value) }
    try {
      await api.put('/me/settings', { settings: { autoplay: String(value) } })
    } catch {
      // Keep the local state; the server reconciles on the next load.
    }
  }

  async function setPluginPreference(pluginId, key, value) {
    const namespacedKey = `plugin:${pluginId}:${key}`
    userSettings.value = { ...userSettings.value, [namespacedKey]: String(value) }
    try {
      await api.put('/me/settings', { settings: { [namespacedKey]: String(value) } })
    } catch {
      // Keep the local preference; the server reconciles on the next load.
    }
  }

  return { autoplay, userSettings, userSettingsLoaded, loadUserSettings, setAutoplay, setPluginPreference }
}
