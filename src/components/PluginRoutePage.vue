<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import PluginCustomUiFrame from './PluginCustomUiFrame.vue'

const route = useRoute()
const pluginId = computed(() => route.params.pluginId)
const uiPath = computed(() => {
  const path = route.params.pathMatch
  return Array.isArray(path) ? path.join('/') : path ?? ''
})
</script>

<template>
  <q-page class="plugin-route-page">
    <PluginCustomUiFrame :plugin-key="pluginId" :ui-url="uiPath" />
  </q-page>
</template>

<style scoped>
.plugin-route-page {
  position: relative;
  min-height: calc(100vh - 64px);
  overflow: hidden;
}
</style>
