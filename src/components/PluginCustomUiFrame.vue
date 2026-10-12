<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { apiOrigin } from '../composables/useApi'
import {
  buildPluginUiUrl,
  externalPluginUiUrl,
  validatePluginUiApiRequest,
} from '../composables/pluginUiBridge'

// Sandboxed iframe host for a plugin's custom UI. Packaged UI is served from
// /plugins/{key}/ui and gets a narrow, plugin-scoped postMessage bridge. An external
// HTTPS URL is rendered without a bridge. The bearer token NEVER crosses the iframe.
const props = defineProps({
  pluginKey: { type: String, required: true },
  uiUrl: { type: String, default: null },
})

const emit = defineEmits(['open-details', 'play'])

const frame = ref(null)
const frameReady = ref(false)

const externalUiUrl = computed(() => externalPluginUiUrl(props.uiUrl))

const bridgeEnabled = computed(() => externalUiUrl.value === null)

// `sandbox="allow-scripts"` deliberately gives even same-host package assets an opaque
// origin. Do not add allow-same-origin: the bridge, not same-origin DOM/API access, is the
// supported way for packaged plugin UI to call the host.
const src = computed(() => {
  return buildPluginUiUrl(props.pluginKey, props.uiUrl, apiOrigin())
})

// Bridge protocol (child → parent):
//   { source: 'mediapager-plugin', type: 'ready' }
//   { source: 'mediapager-plugin', type: 'api', id, method, url, body? }
//   { source: 'mediapager-plugin', type: 'open-details', externalId }
//   { source: 'mediapager-plugin', type: 'play', externalId, season?, episode? }
// parent → child: { source: 'mediapager', type: 'api-response', id, status, body }
async function handleApiRequest(message) {
  const id = message.id
  const request = validateApiRequest(message)
  if (!request) {
    reply({ type: 'api-response', id, status: 403, body: { detail: 'Plugin UI API request is not allowed.' } })
    return
  }

  try {
    const token = localStorage.getItem('mediapager.accessToken')
    if (!token) throw new Error('The parent session is not authenticated.')
    const response = await fetch(`${apiOrigin()}${request.path}`, {
      method: request.method,
      headers: {
        'Content-Type': 'application/json',
        // Only the parent attaches credentials, and only to allowlisted settings/actions or
        // the sanitized catalog-list response granted to the plugin.
        Authorization: `******${token}`,
      },
      body: request.body,
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
    })
    const text = await response.text()
    let body = null
    try { body = text ? JSON.parse(text) : null } catch { body = text }
    if (request.catalogList) {
      body = Array.isArray(body)
        ? body
          .filter((catalog) => Number.isInteger(catalog?.id) && typeof catalog?.name === 'string')
          .map((catalog) => ({
            id: catalog.id,
            name: catalog.name,
            catalogType: { slug: catalog.catalogType?.slug ?? '' },
          }))
        : []
    }
    reply({ type: 'api-response', id, status: response.status, body })
  } catch (requestError) {
    reply({ type: 'api-response', id, status: 0, body: { detail: String(requestError) } })
  }
}

function validateApiRequest(message) {
  if (!bridgeEnabled.value) return null
  return validatePluginUiApiRequest(message, props.pluginKey)
}

function reply(payload) {
  // The sandboxed child has an opaque origin (`null`), so a literal target origin cannot
  // address it. `onMessage` first authenticates the exact child WindowProxy and packaged
  // UI mode; this targets only that window, never all browsing contexts.
  frame.value?.contentWindow?.postMessage({ source: 'mediapager', ...payload }, '*')
}

function onMessage(event) {
  const message = event.data
  if (!bridgeEnabled.value || event.origin !== 'null' || !message ||
      message.source !== 'mediapager-plugin' || frame.value?.contentWindow !== event.source) return

  switch (message.type) {
    case 'ready':
      frameReady.value = true
      break
    case 'api':
      if (!(typeof message.id === 'string' || typeof message.id === 'number') ||
          (typeof message.id === 'string' && message.id.length > 128)) return
      handleApiRequest(message)
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
      referrerpolicy="no-referrer"
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
