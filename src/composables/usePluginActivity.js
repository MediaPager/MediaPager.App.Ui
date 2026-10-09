import { computed, ref } from 'vue'
import { api } from './useApi'

const activityDrawerOpen = ref(false)
const jobs = ref([])
const notifications = ref([])
const activityCount = computed(() =>
  jobs.value.filter((job) => job.state?.toLowerCase() === 'running').length + notifications.value.length)

let pollTimer = null

export function usePluginActivity() {
  function hasRunningJobs() {
    return jobs.value.some((job) => job.state?.toLowerCase() === 'running')
  }

  function stopIfIdle() {
    if (activityDrawerOpen.value || hasRunningJobs() || !pollTimer) return
    clearInterval(pollTimer)
    pollTimer = null
  }

  async function refreshActivity() {
    try {
      const { data } = await api.get('/plugins/activity')
      jobs.value = data?.jobs ?? []
      notifications.value = data?.notifications ?? []
    } catch { /* keep the last snapshot during transient network errors */ }
    stopIfIdle()
  }

  function startPolling() {
    if (pollTimer) return
    refreshActivity()
    pollTimer = setInterval(refreshActivity, 1000)
  }

  function stopPolling() {
    if (hasRunningJobs()) return
    clearInterval(pollTimer)
    pollTimer = null
  }

  async function cancelJob(job) {
    try {
      await api.post(`/plugins/activity/jobs/${encodeURIComponent(job.id)}/cancel`)
      await refreshActivity()
    } catch { /* ignore */ }
  }

  async function clearJob(job) {
    try {
      await api.delete(`/plugins/activity/jobs/${encodeURIComponent(job.id)}`)
      await refreshActivity()
    } catch { /* ignore */ }
  }

  async function dismissNotification(notification) {
    try {
      await api.delete(`/plugins/activity/notifications/${encodeURIComponent(notification.id)}`)
      await refreshActivity()
    } catch { /* ignore */ }
  }

  return {
    activityDrawerOpen,
    activityCount,
    jobs,
    notifications,
    refreshActivity,
    startPolling,
    stopPolling,
    cancelJob,
    clearJob,
    dismissNotification,
  }
}
