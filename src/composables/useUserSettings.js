import { ref } from 'vue'
import { api } from './useApi'

// Per-user preferences served by /me/settings (backend UserSetting rows). The
// only known preference today is `autoplay` (TV: auto-advance to the next episode).
const autoplay = ref(false)
const userSettingsLoaded = ref(false)

export function useUserSettings() {
  async function loadUserSettings() {
    userSettingsLoaded.value = false
    try {
      const { data } = await api.get('/me/settings')
      const settings = data.settings ?? {}
      autoplay.value = settings.autoplay === 'true'
    } catch {
      autoplay.value = false
    } finally {
      userSettingsLoaded.value = true
    }
  }

  async function setAutoplay(value) {
    autoplay.value = value
    try {
      await api.put('/me/settings', { settings: { autoplay: String(value) } })
    } catch {
      // Keep the local state; the server reconciles on the next load.
    }
  }

  return { autoplay, userSettingsLoaded, loadUserSettings, setAutoplay }
}