<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { apiOrigin } from '../composables/useApi'

// Sandboxed iframe host for a plugin's custom UI (a source with CustomUi = true). The
// iframe loads static assets from /plugins/{key}/ui and talks to the SPA over a narrow
// postMessage bridge. The bearer token NEVER crosses: API calls go through the parent.
const props = defineProps({
  pluginKey: { type: String, required: true },
  uiUrl: { type: String, default: null },
})

const emit = defineEmits(['open-details', 'play'])

const frame = ref(null)
const frameReady = ref(false)

// The iframe is same-origin (the API serves the assets); the sandbox attribute still
// applies: scripts run but it gets an opaque origin, no DOM access to the parent, no
// file transfers/popups. allow-scripts is the only escape hatch it needs.
const src = computed(() => {
  const base = `${apiOrigin()}/plugins/${encodeURIComponent(props.pluginKey)}/ui/`
  return props.uiUrl ? base + props.uiUrl.replace(/^\//, '') : base
})

// Bridge protocol (child → parent):
//   { source: 'mediapager-plugin', type: 'ready' }
//   { source: 'mediapager-plugin', type: 'api', id, method, url, body? }
//   { source: 'mediapager-plugin', type: 'open-details', externalId }
//   { source: 'mediapager-plugin', type: 'play', externalId, season?, episode? }
// parent → child: { source: 'mediapager', type: 'api-response', id, status, body }
async function handleApiRequest(message, event) {
  const id = message.id
  try {
    const response = await fetch(`${apiOrigin()}${message.url}`, {
      method: message.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        // The parent attaches the token; the iframe never sees it.
        Authorization: `******${localStorage.getItem('mediapager.accessToken') ?? ''}`,
      },
      body: message.body == null ? undefined : JSON.stringify(message.body),
    })
    const text = await response.text()
    let body = null
    try { body = text ? JSON.parse(text) : null } catch { body = text }
    reply(event, { type: 'api-response', id, status: response.status, body })
  } catch (requestError) {
    reply(event, { type: 'api-response', id, status: 0, body: { detail: String(requestError) } })
  }
}

function reply(event, payload) {
  event.source?.postMessage({ source: 'mediapager', ...payload }, { targetOrigin: event.origin })
}

function onMessage(event) {
  const message = event.data
  if (!message || message.source !== 'mediapager-plugin') return
  // Only accept messages from our iframe.
  if (frame.value && event.source !== frame.value.contentWindow) return

  switch (message.type) {
    case 'ready':
      frameReady.value = true
      break
    case 'api':
      handleApiRequest(message, event)
      break
    case 'open-details':
      emit('open-details', message.externalId)
      break
    case 'play':
      emit('play', message)
      break
  }
}

onMounted(() => window.addEventListener('message', onMessage))
onBeforeUnmount(() => window.removeEventListener('message', onMessage))
</script>

<template>
  <div class="plugin-frame-wrap">
    <iframe
      ref="frame"
      :src="src"
      class="plugin-frame"
      sandbox="allow-scripts"
      title="Plugin custom UI"
    />
  </div>
</template>

<style scoped>
.plugin-frame-wrap {
  position: absolute;
  inset: 0;
}

.plugin-frame {
  width: 100%;
  height: 100%;
  border: 0;
  background: transparent;
}
</style>
