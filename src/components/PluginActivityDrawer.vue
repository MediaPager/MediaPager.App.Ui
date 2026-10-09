<script setup>
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { usePluginActivity } from '../composables/usePluginActivity'

const {
  activityDrawerOpen,
  jobs,
  notifications,
  refreshActivity,
  startPolling,
  stopPolling,
  cancelJob,
  clearJob,
  dismissNotification,
} = usePluginActivity()

watch(activityDrawerOpen, (open) => open ? startPolling() : stopPolling())
onMounted(() => {
  refreshActivity()
  if (activityDrawerOpen.value) startPolling()
})
onBeforeUnmount(stopPolling)

function levelColor(level) {
  switch (level?.toLowerCase()) {
    case 'success': return 'positive'
    case 'warning': return 'warning'
    case 'error': return 'negative'
    default: return 'primary'
  }
}

function stateColor(state) {
  switch (state?.toLowerCase()) {
    case 'completed': return 'positive'
    case 'failed': return 'negative'
    case 'cancelled': return 'grey-6'
    default: return 'primary'
  }
}
</script>

<template>
  <q-drawer
    v-model="activityDrawerOpen"
    side="right"
    overlay
    bordered
    :width="360"
    class="activity-drawer"
  >
    <div class="activity-header">
      <div class="activity-title">Activity</div>
      <q-btn flat round dense icon="close" aria-label="Close activity" @click="activityDrawerOpen = false" />
    </div>

    <q-scroll-area class="activity-list">
      <div v-if="jobs.length === 0 && notifications.length === 0" class="text-grey-6 q-pa-md">
        no activity yet
      </div>

      <section v-if="notifications.length" class="q-pa-sm">
        <div class="text-overline text-grey-6 q-px-sm">Notifications</div>
        <div v-for="notification in notifications" :key="notification.id" class="plugin-notification">
          <q-icon :name="notification.level?.toLowerCase() === 'error' ? 'error' : 'notifications'" :color="levelColor(notification.level)" />
          <div class="col">
            <div class="text-weight-medium">{{ notification.title }}</div>
            <div v-if="notification.message" class="text-caption text-grey-5">{{ notification.message }}</div>
          </div>
          <q-btn flat round dense size="sm" icon="close" aria-label="Dismiss" @click="dismissNotification(notification)" />
        </div>
      </section>

      <section v-if="jobs.length" class="q-pa-sm">
        <div class="text-overline text-grey-6 q-px-sm">Jobs</div>
        <div v-for="job in jobs" :key="job.id" class="activity-job">
          <div class="row items-center justify-between">
            <div class="activity-job-title ellipsis">{{ job.title }}</div>
            <q-chip dense :color="stateColor(job.state)" text-color="dark" class="activity-status">
              {{ job.state }}
            </q-chip>
          </div>
          <div v-if="job.status" class="text-caption text-grey-6">{{ job.status }}</div>
          <q-linear-progress
            v-if="job.progress != null"
            :value="job.progress"
            :indeterminate="job.state?.toLowerCase() === 'running' && job.progress === 0"
            color="primary"
            track-color="grey-8"
            rounded
            class="q-mt-xs"
          />
          <div class="row items-center justify-between q-mt-xs">
            <span v-if="job.progress != null" class="text-caption text-grey-6">{{ Math.round(job.progress * 100) }}%</span>
            <span v-else class="text-caption text-grey-6">working…</span>
            <q-btn
              v-if="job.state?.toLowerCase() === 'running'"
              flat dense size="sm" color="grey-5" label="cancel" @click="cancelJob(job)"
            />
            <q-btn
              v-else
              flat dense size="sm" color="grey-6" label="clear" @click="clearJob(job)"
            />
          </div>
        </div>
      </section>
    </q-scroll-area>
  </q-drawer>
</template>

<style scoped>
.plugin-notification {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  padding: 0.7rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
</style>
