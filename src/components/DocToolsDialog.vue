<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Notify } from 'quasar'
import { api, apiOrigin } from '../composables/useApi'

const open = defineModel('open', { type: Boolean, required: true })
const props = defineProps({ canManage: { type: Boolean, default: false } })
const status = ref(null)
const checking = ref(false)
const updating = ref(false)
const busy = computed(() => checking.value || updating.value || ['warming', 'checking', 'updating', 'installing'].includes(status.value?.phase))
let pollTimer = 0

watch(open, (isOpen) => {
  if (!isOpen) {
    window.clearInterval(pollTimer)
    pollTimer = 0
    return
  }
  void loadStatus()
  pollTimer = window.setInterval(() => {
    if (busy.value) void loadStatus()
  }, 1200)
})

onBeforeUnmount(() => window.clearInterval(pollTimer))

async function loadStatus() {
  try {
    const { data } = await api.get('/document-tools/status')
    status.value = data
    if (data.phase === 'ready' || data.phase === 'failed') updating.value = false
  } catch (error) {
    if (!status.value) Notify.create({ type: 'negative', message: error.response?.data?.detail ?? 'Could not load document-tool status.' })
  }
}

async function checkForUpdates() {
  checking.value = true
  try {
    const { data } = await api.post('/document-tools/check-updates')
    status.value = data
  } catch (error) {
    Notify.create({ type: 'negative', message: error.response?.data?.detail ?? 'Could not check document-tool updates.' })
  } finally {
    checking.value = false
  }
}

async function installTools() {
  updating.value = true
  try {
    const { data } = await api.post('/document-tools/update')
    status.value = data
  } catch (error) {
    updating.value = false
    Notify.create({ type: 'negative', message: error.response?.data?.detail ?? 'Could not install document tools.' })
  }
}

function toolUrl(tool) {
  return new URL(tool.editorUrl, apiOrigin()).toString()
}
</script>

<template>
  <q-dialog v-model="open" :persistent="busy">
    <q-card dark class="doc-tools-dialog">
      <div class="doc-tools-heading">
        <div>
          <div class="text-h6">Document tools</div>
          <div class="text-caption text-grey-5">Pinned custom editors for Word, spreadsheets, PDFs, and presentations.</div>
        </div>
        <q-spinner-dots v-if="busy" color="primary" size="26px" />
        <q-btn v-else flat round dense icon="close" aria-label="Close document tools" @click="open = false" />
      </div>
      <q-banner v-if="status?.phase === 'failed'" dense rounded class="error-banner q-mb-md">
        {{ status.message }}
      </q-banner>
      <q-linear-progress v-if="busy" indeterminate color="primary" />
      <q-markup-table flat separator="horizontal" class="doc-tools-table">
        <thead>
          <tr><th class="text-left">Tool</th><th class="text-left">Pinned</th><th class="text-left">Installed</th><th class="text-left">Latest</th><th /></tr>
        </thead>
        <tbody>
          <tr v-for="tool in status?.tools ?? []" :key="tool.id">
            <td>{{ tool.name }}</td>
            <td>{{ tool.pinnedVersion }}</td>
            <td>{{ tool.installedVersion ?? 'Not installed' }}</td>
            <td>{{ tool.latestVersion ?? '—' }}</td>
            <td class="text-right">
              <q-btn flat dense no-caps label="Open" icon="open_in_new" :disable="!tool.ready" :href="toolUrl(tool)" target="_blank" />
            </td>
          </tr>
          <tr v-if="!(status?.tools?.length)">
            <td colspan="5" class="text-grey-5">Loading pinned editor versions…</td>
          </tr>
        </tbody>
      </q-markup-table>
      <div class="doc-tools-footer">
        <span class="text-caption text-grey-5">{{ status?.message ?? 'Checking pinned editor bundles…' }}</span>
        <q-space />
        <template v-if="props.canManage">
          <q-btn flat no-caps label="Check for updates" :loading="checking" :disable="busy" @click="checkForUpdates" />
          <q-btn
            unelevated
            color="primary"
            text-color="dark"
            no-caps
            :label="status?.ready ? (status.updateAvailable ? 'Install updates' : 'Reinstall tools') : 'Install pinned tools'"
            :loading="updating"
            :disable="busy || (status?.ready && !status.updateAvailable)"
            @click="installTools"
          />
        </template>
      </div>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.doc-tools-dialog {
  width: min(900px, 96vw);
  max-width: 96vw;
  padding: 20px;
  border: 1px solid rgba(140, 163, 197, 0.16);
  border-radius: 16px;
  background: linear-gradient(145deg, #151f32, #0e1625);
}

.doc-tools-heading,
.doc-tools-footer {
  display: flex;
  align-items: center;
  gap: 12px;
}

.doc-tools-heading { margin-bottom: 16px; }
.doc-tools-footer { margin-top: 16px; }
.doc-tools-table { background: transparent; }

@media (max-width: 650px) {
  .doc-tools-dialog { padding: 14px; }
  .doc-tools-footer { align-items: flex-start; flex-wrap: wrap; }
}
</style>
