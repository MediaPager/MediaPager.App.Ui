<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import PluginCustomUiFrame from './PluginCustomUiFrame.vue'
import { useSources } from '../composables/useSources'
import { usePlayback } from '../composables/usePlayback'

const route = useRoute()
const pluginId = computed(() => route.params.pluginId)
const { sources, loaded: sourcesLoaded, fetchSources } = useSources()
const { onPlaySourceItem } = usePlayback()

async function playPluginItem(message) {
  if (!message || typeof message !== 'object' || typeof message.externalId !== 'string' ||
      message.externalId.length === 0 || message.externalId.length > 512 ||
      typeof message.sourceKey !== 'string' || message.sourceKey.length > 128) return
  if (!sourcesLoaded.value) await fetchSources()
  const source = sources.value.find((entry) =>
    entry.key === message.sourceKey && entry.pluginId === pluginId.value)
  if (!source || typeof source.kind !== 'string') return

  await onPlaySourceItem({
    externalId: message.externalId,
    streamVariantId: typeof message.streamVariantId === 'string' ? message.streamVariantId : null,
    kind: source.kind,
    title: typeof message.title === 'string' ? message.title.slice(0, 500) : message.externalId,
    artworkUrl: typeof message.artworkUrl === 'string' ? message.artworkUrl : null,
    overview: typeof message.overview === 'string' ? message.overview.slice(0, 4000) : null,
  }, source.key)
}
const uiPath = computed(() => {
  const path = route.params.pathMatch
  return Array.isArray(path) ? path.join('/') : path ?? ''
})
</script>

<template>
  <q-page class="plugin-route-page">
    <PluginCustomUiFrame :plugin-key="pluginId" :ui-url="uiPath" @play="playPluginItem" />
  </q-page>
</template>

<style scoped>
.plugin-route-page {
  position: relative;
  min-height: calc(100vh - 64px);
  overflow: hidden;
}
</style>
