<template>
  <div class="no-catalogs column flex-center text-center">
    <q-icon name="library_add" size="64px" color="grey-6" />
    <div class="text-h6 q-mt-lg text-grey-3">No catalogs yet</div>
    <div class="text-body1 text-grey-5 q-mt-sm">
      Please set up a catalog to start building your library.
    </div>
    <q-btn
      v-if="canEditCatalogs"
      class="q-mt-xl"
      color="primary"
      unelevated
      icon="settings"
      label="Set up a catalog"
      :to="{ name: 'settings', params: { tab: 'catalogs' } }"
    />
  </div>
</template>

<script setup>
import { useAuth } from '../composables/useAuth'

// Empty state for a home with no catalogs and no online stream provider: no Stream
// tab, no catalog tabs — just this, pointing whoever can edit catalogs at setup.
const { canEditCatalogs } = useAuth()
</script>

<style scoped>
.no-catalogs {
  min-height: 60vh;
  padding: 48px 16px;
}
</style>
