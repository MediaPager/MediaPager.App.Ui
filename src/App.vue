<script setup>
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from './composables/useAuth'
import { useMovies } from './composables/useMovies'
import { useTvShows } from './composables/useTvShows'
import { useStreamTabs } from './composables/useStreamTabs'
import { useSettings } from './composables/useSettings'
import { usePlayback } from './composables/usePlayback'
import { usePluginActivity } from './composables/usePluginActivity'
import { useCatalogs } from './composables/useCatalogs'
import { useUserSettings } from './composables/useUserSettings'
import { useSources } from './composables/useSources'
import AuthPage from './components/AuthPage.vue'
import AppHeader from './components/AppHeader.vue'
import VideoPlayerDialog from './components/VideoPlayerDialog.vue'
import PluginActivityDrawer from './components/PluginActivityDrawer.vue'
import PlaylistDrawer from './components/PlaylistDrawer.vue'
import MediaDetails from './components/MediaDetails.vue'

const router = useRouter()
const { accessToken, isSuperAdmin, signOut } = useAuth()
const { fetchMovies, clearList } = useMovies()
const { clearTvList } = useTvShows()
const { streamTab } = useStreamTabs()
const { loadSettings } = useSettings()
const { playLoading, playerOpen, cueStyle } = usePlayback()
const { refreshActivity } = usePluginActivity()
const { fetchCatalogs, fetchNavCatalogs } = useCatalogs()
const { loadUserSettings } = useUserSettings()
const { fetchSources } = useSources()

// The mobile nav drawer is the only page-switching state left: pages are routes now.
const mobileNavOpen = ref(false)

function onLoggedIn() {
  fetchMovies()
  fetchCatalogs()
  fetchNavCatalogs()
  fetchSources()
  refreshActivity()
  loadUserSettings()
  if (isSuperAdmin.value) loadSettings()
}

function onSignOut() {
  playerOpen.value = false
  signOut()
  streamTab.value = 'movies'
  clearList()
  clearTvList()
  router.push('/')
}

// Signing out on any screen drops back to the auth page; signing in returns to the home tab.
watch(accessToken, (token) => {
  if (!token) router.push('/')
})

onMounted(() => {
  if (accessToken.value) {
    fetchMovies()
    fetchCatalogs()
    fetchNavCatalogs()
    fetchSources()
    refreshActivity()
    loadUserSettings()
    if (isSuperAdmin.value) loadSettings()
  }
})
</script>

<template>
  <q-layout view="hHh lpR fFf">
    <AppHeader
      v-if="accessToken"
      v-model:mobile-nav-open="mobileNavOpen"
      @sign-out="onSignOut"
    />

    <q-page-container>
      <AuthPage v-if="!accessToken" @logged-in="onLoggedIn" />
      <router-view v-else v-slot="{ Component, route: currentRoute }">
        <component
          :is="Component"
          v-if="currentRoute.name === 'stream' || currentRoute.name === 'catalog'"
          v-model:mobile-nav-open="mobileNavOpen"
        />
        <component v-else :is="Component" />
      </router-view>
    </q-page-container>

    <!-- Resolving stream. Teleported to <body> (like Quasar dialogs) AND layered
         above them: .play-loading uses z-index 10000 because Quasar's .q-dialog
         itself sits at 6000, so a same-stacking-context tie would let any
         dialog portal appended later in <body> paint on top of it. -->
    <Teleport to="body">
      <div v-if="playLoading" class="play-loading flex flex-center">
        <q-spinner-dots color="primary" size="4rem" />
        <div class="q-mt-sm text-grey-5">resolving stream…</div>
      </div>
    </Teleport>

    <VideoPlayerDialog />
    <PluginActivityDrawer />
    <PlaylistDrawer />
    <MediaDetails v-if="accessToken" />

    <component :is="'style'">{{ cueStyle }}</component>
  </q-layout>
</template>
