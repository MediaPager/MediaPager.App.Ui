<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { useMovies } from '../composables/useMovies'
import { usePlayback } from '../composables/usePlayback'
import { useMediaDetails } from '../composables/useMediaDetails'
import { useTvShows } from '../composables/useTvShows'
import { useStreamTabs } from '../composables/useStreamTabs'
import { useSources } from '../composables/useSources'
import { usePluginActivity } from '../composables/usePluginActivity'
import { useSettings } from '../composables/useSettings'
import { useCatalogs } from '../composables/useCatalogs'
import { usePlaylist } from '../composables/usePlaylist'
import { Notify } from 'quasar'
import { api } from '../composables/useApi'
import ChangePasswordDialog from './ChangePasswordDialog.vue'
import appIcon from '../assets/images/icon.png'

// mobileNavOpen lives in App.vue; pages are routes, so "which page" comes from the router.
const mobileNavOpen = defineModel('mobileNavOpen', { type: Boolean, required: true })

const changePasswordOpen = ref(false)

const emit = defineEmits(['sign-out'])

const route = useRoute()
const router = useRouter()

// Search hides on the settings screen (it searches catalog/stream, not settings).
const settingsOpen = computed(() => route.name === 'settings')

const { currentUserEmail, userScopes, userInitial, isSuperAdmin } = useAuth()
const { query, search, openDetails } = useMovies()
const { onPlay, onPlaySourceItem } = usePlayback()
const { playlistDrawerOpen, queue, addToQueue } = usePlaylist()
const { openSourceDetails } = useMediaDetails()
const { tvQuery, searchTv, openTvDetails } = useTvShows()
const { streamTab, activeMediaKind, sourceTabs, isSourceTab } = useStreamTabs()
const { searchSource } = useSources()
const { activityDrawerOpen, activityCount } = usePluginActivity()
const { settingsAttentionNeeded, loadSettings } = useSettings()
const { navCatalogs, fetchNavCatalogs } = useCatalogs()

// One unified search box, the same on every tab: it type-aheads across all media
// categories. Provider-backed kinds can be selected and played directly from the results.
const searchText = ref('')
const isTvSearch = computed(() => streamTab.value === 'tv')
const activeSourceKey = computed(() => {
  if (isSourceTab(streamTab.value)) {
    return sourceTabs.value.find((source) => `source:${source.sourceKey}` === streamTab.value)?.sourceKey ?? null
  }
  if (activeMediaKind.value === 'music') {
    return sourceTabs.value.find((source) => String(source.kind ?? '').toLowerCase() === 'music')?.sourceKey ?? null
  }
  return null
})
const searchPlaceholder = 'search movies, TV, music, books…'

// Debounced type-ahead. The dropdown is a plain fixed-position popup positioned
// from whichever search input is focused (desktop toolbar vs the mobile bar).
// A plain div (no popup component) so it can never steal focus or block the box.
const typeaheadOpen = ref(false)
const typeaheadResults = ref([])
const typeaheadLoading = ref(false)
const typeaheadRect = ref({ top: 0, left: 0, width: 0 })
const typeaheadPopup = ref(null)
let typeaheadTimer = null
const desktopSearchInput = ref(null)
const mobileSearchInput = ref(null)
const focusedSearch = ref('desktop')

const kindMeta = {
  movie: { label: 'Movie', icon: 'movie' },
  tv: { label: 'TV Show', icon: 'live_tv' },
  podcast: { label: 'Podcast', icon: 'podcasts' },
  audiobook: { label: 'Audio Book', icon: 'headphones' },
  book: { label: 'Book', icon: 'menu_book' },
  music: { label: 'Music', icon: 'album' },
}

function searchTriggerEl() {
  return (focusedSearch.value === 'mobile' ? mobileSearchInput.value?.$el : desktopSearchInput.value?.$el) ?? null
}

function positionTypeahead() {
  const el = searchTriggerEl()
  if (!el) return
  const r = el.getBoundingClientRect()
  typeaheadRect.value = { top: r.bottom + 4, left: r.left, width: r.width }
}

function onTypeaheadPointer(e) {
  const target = e.target
  const trigger = searchTriggerEl()
  const popup = typeaheadPopup.value
  if ((trigger && trigger.contains(target)) || (popup && popup.contains(target))) return
  closeTypeahead()
}

function bindTypeaheadListeners() {
  document.addEventListener('mousedown', onTypeaheadPointer, true)
  document.addEventListener('touchstart', onTypeaheadPointer, true)
  window.addEventListener('resize', positionTypeahead)
  document.addEventListener('scroll', positionTypeahead, true)
}

function unbindTypeaheadListeners() {
  document.removeEventListener('mousedown', onTypeaheadPointer, true)
  document.removeEventListener('touchstart', onTypeaheadPointer, true)
  window.removeEventListener('resize', positionTypeahead)
  document.removeEventListener('scroll', positionTypeahead, true)
}

function openTypeahead() {
  if (typeaheadOpen.value) return
  positionTypeahead()
  typeaheadOpen.value = true
  bindTypeaheadListeners()
}

function closeTypeahead() {
  if (!typeaheadOpen.value) return
  typeaheadOpen.value = false
  unbindTypeaheadListeners()
}

function cancelTypeahead() {
  clearTimeout(typeaheadTimer)
  typeaheadTimer = null
}

function onSearchFocus(which) {
  focusedSearch.value = which
  const text = searchText.value.trim()
  if (!text) return
  if (typeaheadResults.value.length) openTypeahead()
  else scheduleTypeahead()
}

// v-model already updated searchText; react by opening a loading popup + debounced fetch.
function onSearchInput() {
  const text = searchText.value.trim()
  if (!text) {
    cancelTypeahead()
    closeTypeahead()
    typeaheadResults.value = []
    typeaheadLoading.value = false
    return
  }
  openTypeahead()
  typeaheadLoading.value = true
  scheduleTypeahead()
}

function scheduleTypeahead() {
  cancelTypeahead()
  const text = searchText.value.trim()
  if (!text) return
  typeaheadTimer = setTimeout(() => runTypeahead(text), 250)
}

async function runTypeahead(text) {
  try {
    const { data } = await api.get('/search', { params: { q: text, limit: 5 } })
    if (searchText.value.trim() !== text) return
    typeaheadResults.value = data
    typeaheadLoading.value = false
    if (typeaheadOpen.value) positionTypeahead()
  } catch {
    if (searchText.value.trim() !== text) return
    typeaheadResults.value = []
    typeaheadLoading.value = false
    closeTypeahead()
  }
}

function catalogNameForHit(hit) {
  if (hit.catalogId == null) return ''
  return navCatalogs.value.find((catalog) => catalog.id === hit.catalogId)?.name ?? 'Local library'
}

function metadataSummary(metadata) {
  return (metadata ?? []).slice(0, 3).map((field) => field.value).filter(Boolean).join(' · ')
}

function searchQueueItem(hit) {
  return {
    ...hit,
    id: hit.catalogItemId ?? hit.id,
    externalId: String(hit.externalId ?? hit.id),
    catalogItemId: hit.catalogItemId ?? null,
    kind: hit.kind,
    sourceKey: hit.sourceKey ?? null,
    artworkUrl: hit.artworkUrl ?? null,
  }
}

function playSearchHit(hit) {
  closeTypeahead()
  const item = searchQueueItem(hit)
  return item.sourceKey
    ? onPlaySourceItem(item, item.sourceKey)
    : onPlay(item)
}

function queueSearchHit(hit) {
  if (!addToQueue(searchQueueItem(hit))) return
  Notify.create({ type: 'positive', message: 'Added to the queue.' })
}

function togglePlaylistDrawer() {
  playlistDrawerOpen.value = !playlistDrawerOpen.value
}

// Local hits route to the exact catalog copy. Stream hits first select the matching
// media tab, then open the usual movie/TV detail sheet.
async function pickSearchResult(hit) {
  closeTypeahead()
  if (hit.catalogItemId != null && hit.catalogId != null) {
    let catalog = navCatalogs.value.find((entry) => entry.id === hit.catalogId)
    if (!catalog) {
      await fetchNavCatalogs()
      catalog = navCatalogs.value.find((entry) => entry.id === hit.catalogId)
    }
    if (catalog) router.push({ name: 'catalog', params: { name: catalog.name } })
    return
  }

  const tabByKind = {
    movie: 'movies',
    tv: 'tv',
    music: 'music',
    podcast: 'podcasts',
    audiobook: 'audiobooks',
    book: 'books',
  }
  const tab = tabByKind[hit.kind]
  if (tab) await router.push({ name: 'stream', params: { tab } })

  if (hit.kind === 'music') {
    openSourceDetails(hit.sourceKey, {
      kind: hit.kind,
      externalId: hit.externalId,
      title: hit.title,
      year: hit.year,
      overview: hit.overview,
      artworkUrl: hit.artworkUrl,
      metadata: hit.metadata,
    })
    return
  }

  const base = {
    id: hit.id,
    title: hit.title,
    year: hit.year,
    overview: hit.overview,
    posterUrl: hit.artworkUrl,
    backdropUrl: null,
    voteAverage: hit.voteAverage,
  }
  if (hit.kind === 'movie') openDetails(base)
  else if (hit.kind === 'tv') openTvDetails(base)
}

function doSearch() {
  closeTypeahead()
  const text = searchText.value.trim()
  if (activeSourceKey.value) {
    searchSource(activeSourceKey.value, text)
  } else if (isTvSearch.value) {
    tvQuery.value = text
    searchTv()
  } else {
    query.value = text
    search()
  }
}

function cleanupTypeahead() {
  cancelTypeahead()
  unbindTypeaheadListeners()
}

onBeforeUnmount(cleanupTypeahead)

function openSettings() {
  loadSettings()
  router.push({ name: 'settings' })
}

function openProfile() {
  router.push({ name: 'profile' })
}
</script>

<template>
  <q-header class="page-header">
    <q-toolbar>
      <q-btn
        flat
        round
        dense
        icon="menu"
        aria-label="Navigation"
        class="mobile-nav-btn"
        @click="mobileNavOpen = !mobileNavOpen"
      />
      <q-toolbar-title class="brand brand-home" @click="router.push('/')">
        <img :src="appIcon" alt="" class="brand-icon" />
        <span>mediapager<span class="text-primary">_</span></span>
      </q-toolbar-title>
      <q-space />
      <q-input
        v-if="!settingsOpen"
        v-model="searchText"
        ref="desktopSearchInput"
        dark
        dense
        outlined
        :placeholder="searchPlaceholder"
        class="search-input"
        @focus="onSearchFocus('desktop')"
        @update:model-value="onSearchInput"
        @keyup.enter="doSearch"
      >
        <template #append>
          <q-btn flat round dense icon="search" color="primary" @click="doSearch" />
        </template>
      </q-input>
      <q-btn
        v-if="!settingsOpen"
        flat
        round
        dense
        icon="queue_music"
        aria-label="Open queue and playlists"
        title="Queue and playlists"
        class="q-ml-sm"
        @click="togglePlaylistDrawer"
      >
        <q-badge v-if="queue.length" color="primary" text-color="dark" floating>{{ queue.length }}</q-badge>
      </q-btn>
      <q-space />
      <q-btn
        flat
        round
        dense
        icon="notifications"
        aria-label="Activity and notifications"
        title="Activity and notifications"
        class="q-ml-sm"
        @click="activityDrawerOpen = !activityDrawerOpen"
      >
        <q-badge v-if="activityCount > 0" color="primary" text-color="dark" floating>
          {{ activityCount }}
        </q-badge>
      </q-btn>
      <q-btn round flat dense class="q-ml-sm account-avatar" aria-label="Account">
        <q-avatar size="30px" color="primary" text-color="dark" class="account-initial">
          {{ userInitial }}
        </q-avatar>
        <q-menu dark class="account-menu">
          <q-list dense>
            <q-item>
              <q-item-section avatar>
                <q-avatar size="36px" color="primary" text-color="dark">{{ userInitial }}</q-avatar>
              </q-item-section>
              <q-item-section>
                <q-item-label class="account-email">{{ currentUserEmail }}</q-item-label>
                <q-item-label caption class="text-grey-6">{{ userScopes.join(', ') || 'user' }}</q-item-label>
              </q-item-section>
            </q-item>
            <q-separator dark class="q-my-xs" />
            <q-item clickable v-close-popup @click="openProfile">
              <q-item-section avatar>
                <q-icon name="account_circle" />
              </q-item-section>
              <q-item-section>Profile</q-item-section>
            </q-item>
            <q-item
              v-if="isSuperAdmin"
              clickable
              v-close-popup
              @click="openSettings"
            >
              <q-item-section avatar>
                <q-icon name="settings" />
              </q-item-section>
              <q-item-section>Settings</q-item-section>
              <q-item-section side v-if="settingsAttentionNeeded">
                <q-badge color="negative" text-color="white" rounded>!</q-badge>
              </q-item-section>
            </q-item>
            <q-item clickable v-close-popup @click="changePasswordOpen = true">
              <q-item-section avatar>
                <q-icon name="lock_reset" />
              </q-item-section>
              <q-item-section>Change password</q-item-section>
            </q-item>
            <q-item clickable v-close-popup @click="emit('sign-out')">
              <q-item-section avatar>
                <q-icon name="logout" />
              </q-item-section>
              <q-item-section>Sign out</q-item-section>
            </q-item>
          </q-list>
        </q-menu>
      </q-btn>
      <ChangePasswordDialog v-model:open="changePasswordOpen" />
    </q-toolbar>
    <q-toolbar v-if="!settingsOpen" class="mobile-search-bar">
      <q-input
        v-model="searchText"
        ref="mobileSearchInput"
        dark
        dense
        outlined
        :placeholder="searchPlaceholder"
        class="search-input-mobile"
        @focus="onSearchFocus('mobile')"
        @update:model-value="onSearchInput"
        @keyup.enter="doSearch"
      >
        <template #append>
          <q-btn flat round dense icon="search" color="primary" @click="doSearch" />
        </template>
      </q-input>
      <q-btn
        flat
        round
        dense
        icon="queue_music"
        aria-label="Open queue and playlists"
        title="Queue and playlists"
        @click="togglePlaylistDrawer"
      >
        <q-badge v-if="queue.length" color="primary" text-color="dark" floating>{{ queue.length }}</q-badge>
      </q-btn>
    </q-toolbar>

    <!-- type-ahead dropdown; fixed-position, anchored to whichever search input has focus -->
    <Transition name="typeahead-fade">
      <div
        v-if="typeaheadOpen"
        ref="typeaheadPopup"
        class="typeahead-popup"
        :style="{
          top: typeaheadRect.top + 'px',
          left: typeaheadRect.left + 'px',
          width: typeaheadRect.width + 'px',
        }"
      >
        <div v-if="typeaheadLoading" class="typeahead-status flex flex-center">
          <q-spinner-dots color="primary" size="1.5rem" />
        </div>
        <template v-else-if="typeaheadResults.length">
          <div
            v-for="hit in typeaheadResults"
            :key="`${hit.kind}-${hit.sourceKey}-${hit.externalId ?? hit.id}`"
            class="typeahead-item"
            role="button"
            tabindex="0"
            @click="pickSearchResult(hit)"
            @keydown.enter.prevent="pickSearchResult(hit)"
          >
            <div class="typeahead-avatar">
              <q-img :src="hit.artworkUrl ?? undefined" fit="cover" class="typeahead-thumb" ratio="2/3">
                <template #error>
                  <div class="typeahead-thumb-fallback flex flex-center">
                    <q-icon :name="kindMeta[hit.kind]?.icon ?? 'search'" size="1.1rem" color="grey-6" />
                  </div>
                </template>
              </q-img>
            </div>
            <div class="typeahead-item-text">
              <div class="typeahead-title">{{ hit.title }}</div>
              <div v-if="metadataSummary(hit.metadata)" class="typeahead-year">
                {{ metadataSummary(hit.metadata) }}
              </div>
              <div v-if="hit.year || hit.catalogId != null" class="typeahead-year">
                {{ hit.year ?? '—' }}
                <span v-if="hit.catalogId != null"> · {{ catalogNameForHit(hit) }}</span>
              </div>
            </div>
            <q-badge
              outline
              color="primary"
              text-color="primary"
              :label="kindMeta[hit.kind]?.label ?? hit.kind"
              class="typeahead-badge"
            />
            <div class="typeahead-actions row items-center no-wrap">
              <q-btn
                flat
                round
                dense
                size="sm"
                icon="play_arrow"
                aria-label="Play now"
                title="Play now"
                @click.stop="playSearchHit(hit)"
              />
              <q-btn
                flat
                round
                dense
                size="sm"
                icon="playlist_add"
                aria-label="Add to queue"
                title="Add to queue"
                @click.stop="queueSearchHit(hit)"
              />
            </div>
          </div>
        </template>
        <div v-else role="button" tabindex="0" class="typeahead-empty" @click="doSearch" @keydown.enter.prevent="doSearch">
          no matches across movies, TV, music, books…
        </div>
      </div>
    </Transition>
  </q-header>
</template>
