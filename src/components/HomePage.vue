<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Notify } from 'quasar'
import { api } from '../composables/useApi'
import { useMovies } from '../composables/useMovies'
import { useTvShows } from '../composables/useTvShows'
import { builtinStreamTabs, useStreamTabs } from '../composables/useStreamTabs'
import { usePlayback } from '../composables/usePlayback'
import { useCatalogs } from '../composables/useCatalogs'
import { useCatalogItems } from '../composables/useCatalogItems'
import { useSources } from '../composables/useSources'
import { usePluginActivity } from '../composables/usePluginActivity'
import { useAuth } from '../composables/useAuth'
import SourceBrowseGrid from './SourceBrowseGrid.vue'
import PluginCustomUiFrame from './PluginCustomUiFrame.vue'
import NotFoundPage from './NotFoundPage.vue'
import NoCatalogsScreen from './NoCatalogsScreen.vue'
import CatalogItemEditDialog from './CatalogItemEditDialog.vue'
import CatalogUploadDialog from './CatalogUploadDialog.vue'
import DocToolsDialog from './DocToolsDialog.vue'
import DocEditorDialog from './DocEditorDialog.vue'
import DocsExplorer from './DocsExplorer.vue'
import MusicCatalogBrowser from './MusicCatalogBrowser.vue'
import ItemRatingMenu from './ItemRatingMenu.vue'
import PluginActionButtons from './PluginActionButtons.vue'

// Which home tab shows is route state now: /stream/:tab or /catalog/:id. Writes push a
// route; the back/forward buttons and pasted links land on the same tab.
const route = useRoute()
const router = useRouter()

const homeTab = computed({
  get: () =>
    route.name === 'catalog'
      ? `catalog:${route.params.name}`
      : 'stream',
  set: (tab) => {
    if (tab === 'stream') router.push({ name: 'stream', params: { tab: streamTab.value } })
    else if (tab?.startsWith('catalog:')) router.push({ name: 'catalog', params: { name: tab.slice('catalog:'.length) } })
  },
})

const mobileNavOpen = defineModel('mobileNavOpen', { type: Boolean, required: true })

const {
  movies,
  page,
  totalPages,
  loading,
  error,
  movieGenres,
  movieGenreId,
  movieYear,
  movieMinRating,
  movieMinVoteCount,
  movieLanguage,
  movieSortBy,
  openDetails,
  openLocalDetails,
  goToPage,
  applyMovieFilters,
  clearMovieFilters,
  isTouchDevice,
} = useMovies()
const {
  tvShows,
  tvPage,
  tvTotalPages,
  tvLoading,
  tvError,
  tvGenres,
  tvGenreId,
  tvYear,
  tvMinRating,
  tvMinVoteCount,
  tvLanguage,
  tvSortBy,
  openTvDetails,
  goToTvPage,
  fetchTvShows,
  applyTvFilters,
  clearTvFilters,
} = useTvShows()
const { streamTabs, streamTab, sourceTabs, availableStreamKinds, activeMediaKind, isSourceTab } = useStreamTabs()
const { onPlay } = usePlayback()
const { navCatalogs, navCatalogsLoaded, saveNavOrder } = useCatalogs()
const {
  items,
  itemsLoading,
  itemsError,
  fetchItems,
  refreshLocalMap,
  localItemFor,
  editItemRequest,
  clearEditItemRequest,
} = useCatalogItems()
const { jobs: pluginJobs } = usePluginActivity()
const { canEditCatalogs, canEditSettings } = useAuth()
const docToolsDialogOpen = ref(false)
const docEditorOpen = ref(false)
const docEditorCatalog = ref(null)
const docEditorEntry = ref(null)
const docEditorTool = ref(null)
const seenCompletedJobIds = new Set()
const filterYears = Array.from({ length: new Date().getFullYear() - 1870 + 1 }, (_, index) => {
  const value = new Date().getFullYear() - index
  return { label: String(value), value }
})
const ratingFilters = [
  { label: 'Any rating', value: null },
  { label: '5+ stars', value: 5 },
  { label: '6+ stars', value: 6 },
  { label: '7+ stars', value: 7 },
  { label: '8+ stars', value: 8 },
]
const voteCountFilters = [
  { label: 'Any vote count', value: null },
  { label: '25+ votes', value: 25 },
  { label: '100+ votes', value: 100 },
  { label: '500+ votes', value: 500 },
  { label: '1,000+ votes', value: 1000 },
]
const languageFilters = [
  { label: 'Any language', value: null },
  { label: 'English', value: 'en' },
  { label: 'Spanish', value: 'es' },
  { label: 'French', value: 'fr' },
  { label: 'German', value: 'de' },
  { label: 'Italian', value: 'it' },
  { label: 'Japanese', value: 'ja' },
  { label: 'Korean', value: 'ko' },
  { label: 'Chinese', value: 'zh' },
  { label: 'Hindi', value: 'hi' },
  { label: 'Portuguese', value: 'pt' },
]
const movieSortFilters = [
  { label: 'Popularity', value: 'popularity.desc' },
  { label: 'Top rated', value: 'vote_average.desc' },
  { label: 'Newest releases', value: 'primary_release_date.desc' },
  { label: 'Title A–Z', value: 'title.asc' },
]
const tvSortFilters = [
  { label: 'Popularity', value: 'popularity.desc' },
  { label: 'Top rated', value: 'vote_average.desc' },
  { label: 'Newest premieres', value: 'first_air_date.desc' },
  { label: 'Title A–Z', value: 'name.asc' },
]
const hasMovieFilters = computed(() => movieGenreId.value != null || movieYear.value != null || movieMinRating.value != null || movieMinVoteCount.value != null || movieLanguage.value !== 'en' || movieSortBy.value !== 'popularity.desc')
const hasTvFilters = computed(() => tvGenreId.value != null || tvYear.value != null || tvMinRating.value != null || tvMinVoteCount.value != null || tvLanguage.value !== 'en' || tvSortBy.value !== 'popularity.desc')

// Own the "is this movie already in the library?" lookup: catalog tabs and the stream
// grid both need it (stream shows edit when a local copy exists).
refreshLocalMap()

// Stream sub-tabs: the movies list is fetched at login (App.vue), TV is fetched lazily
// the first time the TV tab is opened so the header search uses the right endpoint.
const streamTvLoaded = ref(false)
watch(activeMediaKind, (key) => {
  if (key === 'tv' && !streamTvLoaded.value) {
    streamTvLoaded.value = true
    fetchTvShows()
  }
})

// Stream sub-tab ⇆ route param: clicking a tab pushes /stream/:tab; arriving via a deep
// link or back/forward adopts the param as the active tab. A `source:…` deep link can
// arrive before /sources loads, so the tab adopts the param immediately and the grid
// resolves once the source catalog is in.
watch(() => route.params.tab, (tab) => {
  if (route.name === 'stream' && typeof tab === 'string' && tab && tab !== streamTab.value) {
    streamTab.value = tab
  }
}, { immediate: true })

const activeStreamTab = computed(() => streamTabs.value.find((tab) => tab.key === activeMediaKind.value) ?? null)

const activeSourceTab = computed(() => {
  if (isSourceTab(streamTab.value)) {
    return sourceTabs.value.find((tab) => `source:${tab.sourceKey}` === streamTab.value) ?? null
  }
  if (activeMediaKind.value === 'music') {
    return sourceTabs.value.find((tab) => String(tab.kind ?? '').toLowerCase() === 'music') ?? null
  }
  return null
})

// 404 handling: a stream tab that matches neither a built-in kind nor a loaded source,
// or a catalog name that isn't in the user's nav, is a bad URL — render the 404 page
// in place (the address bar keeps the offending path).
const { loaded: sourcesLoaded, hasOnlineStreamProvider, pluginMainNav } = useSources()
const streamTabNotFound = computed(() =>
  route.name === 'stream' &&
  sourcesLoaded.value &&
  !activeStreamTab.value &&
  !activeSourceTab.value)
// Catalogs exist but none were set up yet (or the nav fetch failed): say so instead of
// 404ing a deep link or parking the user on an empty stream screen.
const noCatalogsScreen = computed(() =>
  sourcesLoaded.value &&
  navCatalogsLoaded.value &&
  navCatalogs.value.length === 0 &&
  !hasOnlineStreamProvider.value)
const catalogNotFound = computed(() =>
  route.name === 'catalog' &&
  navCatalogsLoaded.value &&
  navCatalogs.value.length > 0 &&
  !selectedCatalog.value)

// The Stream entry only exists when an ONLINE stream provider plugin is loaded —
// without one there is nothing to stream from (local stream providers obey the
// catalogs instead). Shown until discovery finishes to avoid flicker.
const showStreamNav = computed(() => {
  if (!sourcesLoaded.value) return true
  return hasOnlineStreamProvider.value
})

// No online provider + somewhere else to go → land on the first catalog instead of the
// stream screen (covers '/', deep links, and back/forward onto /stream/…). With no
// catalogs either, noCatalogsScreen takes over on the same route.
watch(
  [sourcesLoaded, () => route.name, navCatalogs, streamTab, availableStreamKinds, sourceTabs],
  () => {
    if (route.name !== 'stream' || !sourcesLoaded.value) return
    if (!hasOnlineStreamProvider.value) {
      const first = navCatalogs.value[0]
      if (first) router.replace({ name: 'catalog', params: { name: first.name } })
      return
    }

    const currentTab = streamTab.value
    const currentSourceExists = sourceTabs.value.some((source) => source.key === currentTab)
    const currentBuiltinExists = streamTabs.value.some((tab) => tab.key === currentTab)
    if ((isSourceTab(currentTab) && currentSourceExists) || currentBuiltinExists) return
    if (!isSourceTab(currentTab) && !builtinStreamTabs.some((tab) => tab.key === currentTab)) return

    const fallback = streamTabs.value[0]?.key ?? (sourceTabs.value[0] ? `source:${sourceTabs.value[0].sourceKey}` : null)
    if (fallback) {
      streamTab.value = fallback
      router.replace({ name: 'stream', params: { tab: fallback } })
    }
  },
  { immediate: true },
)

// Catalog tabs are named `catalog:{uniqueName}` so they coexist with stream — the route
// param is the catalog's name (its unique key), never the numeric id.
const selectedCatalog = computed(() => {
  if (!homeTab.value.startsWith('catalog:')) return null
  const name = homeTab.value.slice('catalog:'.length)
  return navCatalogs.value.find((catalog) => catalog.name === name) ?? null
})

const showCatalogAlphabetIndex = computed(() =>
  route.name === 'catalog' && ['movies', 'tv-shows'].includes(selectedCatalog.value?.catalogType?.slug))
const catalogItemElements = new Map()
const basicAlphabet = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']
const catalogAlphaIndexElement = ref(null)
const catalogAlphaHeight = ref(0)
const catalogAlphaFontSize = ref(13)
const catalogAlphaFocus = ref({ from: null, to: null, progress: 0 })
const catalogAlphaActiveLetter = ref(null)
const catalogAlphaScrolling = ref(false)
let catalogAlphaHeightFrame = 0
let catalogAlphaFocusFrame = 0
let catalogAlphaScrollTimer = null

const catalogDisplayItems = computed(() => {
  if (selectedCatalog.value?.catalogType?.slug !== 'tv-shows') return items.value
  return items.value.filter((item) => item.kind === 'show' && item.parentId == null)
})

function catalogInitial(title) {
  const first = Array.from(String(title ?? '').trim())[0]
  if (!first || /^[0-9]$/u.test(first) || !/^\p{L}$/u.test(first)) return '#'
  const upper = first.toLocaleUpperCase()
  return /^[A-Z]$/u.test(upper) ? upper : upper
}

const catalogAlphabetIndex = computed(() => {
  const extras = [...new Set(catalogDisplayItems.value
    .map((item) => catalogInitial(item.title))
    .filter((initial) => !basicAlphabet.includes(initial)))]
    .sort((left, right) => left.localeCompare(right))
  const available = new Set(catalogDisplayItems.value.map((item) => catalogInitial(item.title)))
  return [...basicAlphabet, ...extras].map((letter) => ({ letter, available: available.has(letter) }))
})

function setCatalogItemElement(itemId, element) {
  if (element) catalogItemElements.set(itemId, element)
  else catalogItemElements.delete(itemId)
}

function jumpToCatalogInitial(letter) {
  const item = catalogDisplayItems.value.find((entry) => catalogInitial(entry.title) === letter)
  catalogItemElements.get(item?.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function updateCatalogAlphaHeight() {
  catalogAlphaHeightFrame = 0
  const element = catalogAlphaIndexElement.value
  if (!element) {
    catalogAlphaHeight.value = 0
    return
  }

  const panelBottom = element.closest('.home-panel')?.getBoundingClientRect().bottom ?? window.innerHeight
  const top = element.getBoundingClientRect().top
  const availableHeight = Math.max(0, Math.floor(Math.min(panelBottom, window.innerHeight) - top - 18))
  const rowHeight = availableHeight / Math.max(catalogAlphabetIndex.value.length, 1)
  const maxFontSize = window.innerWidth <= 600 ? 15 : 18

  catalogAlphaHeight.value = availableHeight
  catalogAlphaFontSize.value = Math.min(maxFontSize, Math.max(8, Math.floor(rowHeight * 0.78 * 10) / 10))
  updateCatalogAlphaFocus()
}

function updateCatalogAlphaFocus() {
  catalogAlphaFocusFrame = 0
  const element = catalogAlphaIndexElement.value
  if (!element) return
  const top = element.getBoundingClientRect().top
  const panel = element.closest('.home-panel')
  const panelBounds = panel?.getBoundingClientRect()
  const scrollAnchor = panelBounds
    ? panelBounds.top + Math.min(100, panelBounds.height * 0.16)
    : top
  const initialGroups = []
  for (const item of catalogDisplayItems.value) {
    const itemElement = catalogItemElements.get(item.id)
    if (!itemElement) continue
    const letter = catalogInitial(item.title)
    const itemTop = itemElement.getBoundingClientRect().top
    const last = initialGroups.at(-1)
    if (last?.letter === letter) continue
    if (last && Math.abs(last.top - itemTop) < 1) {
      last.letter = letter
      last.top = itemTop
    } else {
      initialGroups.push({ letter, top: itemTop })
    }
  }

  let from = initialGroups[0]?.letter ?? null
  let to = null
  let progress = 0
  if (initialGroups.length > 1) {
    if (scrollAnchor >= initialGroups.at(-1).top) {
      from = initialGroups.at(-1).letter
      progress = 1
    } else {
      for (let index = 0; index < initialGroups.length - 1; index++) {
        const current = initialGroups[index]
        const next = initialGroups[index + 1]
        if (scrollAnchor > next.top) continue
        from = current.letter
        to = next.letter
        progress = Math.max(0, Math.min(1, (scrollAnchor - current.top) / Math.max(next.top - current.top, 1)))
        break
      }
    }
  }
  catalogAlphaFocus.value = { from, to, progress }
  if (!catalogAlphaScrolling.value) {
    catalogAlphaActiveLetter.value = to && progress >= 0.5 ? to : from
  }
}

function scheduleCatalogAlphaHeight() {
  if (!catalogAlphaHeightFrame) {
    catalogAlphaHeightFrame = requestAnimationFrame(updateCatalogAlphaHeight)
  }
}

function scheduleCatalogAlphaFocus() {
  if (!catalogAlphaFocusFrame) {
    catalogAlphaFocusFrame = requestAnimationFrame(updateCatalogAlphaFocus)
  }
}

function onCatalogPanelScroll() {
  catalogAlphaScrolling.value = true
  clearTimeout(catalogAlphaScrollTimer)
  catalogAlphaScrollTimer = setTimeout(() => {
    catalogAlphaScrolling.value = false
    const { from, to, progress } = catalogAlphaFocus.value
    catalogAlphaActiveLetter.value = to && progress >= 0.5 ? to : from
  }, 160)
  scheduleCatalogAlphaFocus()
}

function catalogAlphaScale(letter) {
  let emphasis = 0
  if (catalogAlphaScrolling.value) {
    const { from, to, progress } = catalogAlphaFocus.value
    if (letter === from) emphasis = to ? 1 - progress : 1
    else if (letter === to) emphasis = progress
  } else if (letter === catalogAlphaActiveLetter.value) {
    emphasis = 0.25
  }
  return `${1 + emphasis * 0.55} ${1 + emphasis * 0.4}`
}

watch([showCatalogAlphabetIndex, catalogAlphabetIndex], () => nextTick(scheduleCatalogAlphaHeight), { flush: 'post' })

onMounted(() => {
  window.addEventListener('resize', scheduleCatalogAlphaHeight)
  nextTick(scheduleCatalogAlphaHeight)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', scheduleCatalogAlphaHeight)
  clearTimeout(catalogAlphaScrollTimer)
  if (catalogAlphaHeightFrame) cancelAnimationFrame(catalogAlphaHeightFrame)
  if (catalogAlphaFocusFrame) cancelAnimationFrame(catalogAlphaFocusFrame)
})

const catalogSlugToMediaTab = {
  movies: 'movies',
  'tv-shows': 'tv',
  music: 'music',
  podcasts: 'podcasts',
  audiobooks: 'audiobooks',
  books: 'books',
}

const activeMediaTabKey = computed(() => route.name === 'catalog'
  ? catalogSlugToMediaTab[selectedCatalog.value?.catalogType?.slug] ?? null
  : activeMediaKind.value)

function mediaTabEnabled(tabKey) {
  if (route.name === 'catalog') return activeMediaTabKey.value === tabKey
  return availableStreamKinds.value.has(tabKey)
}

function selectMediaTab(tabKey) {
  if (route.name !== 'stream' || !mediaTabEnabled(tabKey)) return
  streamTab.value = tabKey
  router.push({ name: 'stream', params: { tab: tabKey } })
}

// Library items for the selected catalog tab; (re)fetch whenever the tab changes.
const itemEditOpen = ref(false)
const itemEditTarget = ref(null)
const catalogUploadOpen = ref(false)
const musicRefreshToken = ref(0)
watch(selectedCatalog, (catalog) => {
  if (catalog) fetchItems(catalog.id)
}, { immediate: true })

function openItemEditor(item) {
  itemEditTarget.value = item
  itemEditOpen.value = true
}

function openCatalogItemDetails(item) {
  if (selectedCatalog.value?.catalogType?.slug === 'docs') {
    void openCatalogDocument(item)
    return
  }
  if (selectedCatalog.value?.catalogType?.slug === 'tv-shows') {
    const tmdbId = Number(item.externalId)
    if (Number.isSafeInteger(tmdbId) && tmdbId > 0) {
      return openTvDetails({
        id: tmdbId,
        title: item.title,
        year: item.year,
        overview: item.overview,
        posterUrl: item.imageUrl,
        backdropUrl: item.backdropUrl,
        voteAverage: item.rating ?? 0,
        localItem: item,
        isCatalogItem: true,
      })
    }
  }
  return openLocalDetails(item)
}

async function openCatalogDocument(item) {
  // Open a blank tab synchronously from the user's click so browser popup blockers
  // allow the capability URL to be assigned once the authenticated API call returns.
  const documentWindow = window.open('about:blank', '_blank')
  if (!documentWindow) {
    Notify.create({ type: 'warning', message: 'Allow pop-ups to open documents from this catalog.' })
    return
  }
  documentWindow.opener = null
  documentWindow.document.title = item.title ?? 'Document'
  try {
    const { data } = await api.post(`/catalog-items/${encodeURIComponent(item.id)}/local`)
    documentWindow.location.replace(data.url)
  } catch (requestError) {
    documentWindow.close()
    const message = requestError.response?.data?.detail ?? requestError.response?.data?.error ?? 'Could not open this document.'
    Notify.create({ type: 'negative', message })
  }
}

function openDocEditor({ catalog, entry, tool }) {
  docEditorCatalog.value = catalog
  docEditorEntry.value = entry
  docEditorTool.value = tool
  docEditorOpen.value = true
}

async function onCatalogItemCreated() {
  if (selectedCatalog.value) await fetchItems(selectedCatalog.value.id)
  musicRefreshToken.value++
  await refreshLocalMap()
}

function onCatalogItemChanged() {
  musicRefreshToken.value++
  void refreshLocalMap()
  if (selectedCatalog.value && selectedCatalog.value.catalogType.slug !== 'music')
    void fetchItems(selectedCatalog.value.id)
}

watch(pluginJobs, (jobs) => {
  let completedNewJob = false
  for (const job of jobs) {
    if (job.state?.toLowerCase() !== 'completed' || seenCompletedJobIds.has(job.id)) continue
    seenCompletedJobIds.add(job.id)
    completedNewJob = true
  }
  if (!completedNewJob) return
  refreshLocalMap()
  if (selectedCatalog.value) fetchItems(selectedCatalog.value.id)
})

watch(editItemRequest, (requestedItem) => {
  if (!requestedItem) return
  openItemEditor(requestedItem)
  clearEditItemRequest()
})

function closeMobileNav() {
  mobileNavOpen.value = false
}

// Reorder mode: turned on explicitly so nobody drags the nav by accident (desktop or
// mobile). Stream is always pinned to the top and never participates.
const reorderMode = ref(false)
const dragIndex = ref(null)
const reorderError = ref('')

function toggleReorderMode() {
  const turningOff = reorderMode.value
  reorderMode.value = !reorderMode.value
  dragIndex.value = null
  reorderError.value = ''
  if (turningOff) persistOrder()
}

function persistOrder() {
  saveNavOrder(navCatalogs.value.map((catalog) => catalog.id)).catch(() => {
    reorderError.value = 'could not save the new order'
  })
}

function moveCatalog(index, targetIndex) {
  const list = [...navCatalogs.value]
  const [moved] = list.splice(index, 1)
  list.splice(targetIndex, 0, moved)
  navCatalogs.value = list
}

function moveUp(index) {
  if (index > 0) moveCatalog(index, index - 1)
}

function moveDown(index) {
  if (index < navCatalogs.value.length - 1) moveCatalog(index, index + 1)
}

function onDragStart(index) {
  dragIndex.value = index
}

function onDrop(index) {
  if (dragIndex.value === null || dragIndex.value === index) return
  moveCatalog(dragIndex.value, index)
}

function onDragEnd() {
  dragIndex.value = null
}
</script>

<template>
  <q-page class="home-page">
    <div class="home-layout">
      <div class="side-nav-col" :class="{ 'mobile-open': mobileNavOpen }">
        <div class="side-nav-title-row">
          <div class="side-nav-title">Navigation</div>
          <q-btn
            v-if="navCatalogs.length"
            flat
            round
            dense
            size="sm"
            :icon="reorderMode ? 'check' : 'edit'"
            :color="reorderMode ? 'primary' : 'grey-5'"
            :aria-label="reorderMode ? 'Accept new order' : 'Reorder catalogs'"
            :title="reorderMode ? 'Accept new order' : 'Reorder catalogs'"
            @click="toggleReorderMode"
          />
        </div>

        <q-tabs
          v-model="homeTab"
          vertical
          dark
          class="side-nav"
          active-color="primary"
          indicator-color="primary"
          @update:model-value="closeMobileNav"
        >
          <q-tab v-if="showStreamNav" name="stream" aria-label="Stream">
            <span class="stream-nav-label">
              <span class="q-tab__label">Stream</span>
              <svg class="stream-nav-signal" viewBox="0 0 24 24" aria-hidden="true">
                <path class="stream-nav-wave stream-nav-wave--3" d="M3 8.5c5-4.2 13-4.2 18 0" />
                <path class="stream-nav-wave stream-nav-wave--2" d="M6 11.5c3.5-2.9 8.5-2.9 12 0" />
                <path class="stream-nav-wave stream-nav-wave--1" d="M9 14.5c1.8-1.5 4.2-1.5 6 0" />
                <circle class="stream-nav-signal-dot" cx="12" cy="18.5" r="1.25" />
              </svg>
            </span>
          </q-tab>
          <template v-if="!reorderMode">
            <q-tab
              v-for="catalog in navCatalogs"
              :key="catalog.id"
              :name="`catalog:${catalog.name}`"
              :label="catalog.name"
            />
          </template>
        </q-tabs>

        <q-list v-if="!reorderMode && (pluginMainNav.length || canEditSettings)" dense class="plugin-main-nav">
          <q-item
            v-for="entry in pluginMainNav"
            :key="entry.key"
            clickable
            @click="router.push({ name: 'plugin', params: { pluginId: entry.pluginId, pathMatch: entry.path.split('/').filter(Boolean) } })"
          >
            <q-item-section avatar><q-icon :name="entry.icon || 'extension'" /></q-item-section>
            <q-item-section>{{ entry.label }}</q-item-section>
          </q-item>
          <q-item v-if="canEditSettings" clickable @click="docToolsDialogOpen = true; closeMobileNav()">
            <q-item-section avatar><q-icon name="build" /></q-item-section>
            <q-item-section>Doc Tools</q-item-section>
          </q-item>
        </q-list>

        <div v-if="reorderMode" class="nav-reorder-list">
          <div
            v-for="(catalog, index) in navCatalogs"
            :key="catalog.id"
            class="nav-reorder-item"
            :class="{ dragging: dragIndex === index }"
            draggable="true"
            @dragstart="onDragStart(index)"
            @dragover.prevent
            @drop="onDrop(index)"
            @dragend="onDragEnd"
          >
            <q-icon name="drag_indicator" size="16px" class="nav-reorder-handle" />
            <span class="nav-reorder-name">{{ catalog.name }}</span>
            <q-btn
              flat
              round
              dense
              size="sm"
              icon="arrow_upward"
              color="grey-5"
              aria-label="Move up"
              @click.stop="moveUp(index)"
            />
            <q-btn
              flat
              round
              dense
              size="sm"
              icon="arrow_downward"
              color="grey-5"
              aria-label="Move down"
              @click.stop="moveDown(index)"
            />
          </div>
          <div v-if="reorderError" class="nav-reorder-error">{{ reorderError }}</div>
          <div v-else class="nav-reorder-hint">drag or use the arrows, then tap the check to accept</div>
        </div>
      </div>
      <div
        v-if="mobileNavOpen"
        class="mobile-nav-backdrop"
        @click="mobileNavOpen = false"
      />

      <div
        class="home-panel"
        :class="{
          'home-panel--with-tabs': homeTab === 'stream',
          'home-panel--catalog': homeTab.startsWith('catalog:'),
        }"
        @scroll.passive="onCatalogPanelScroll"
      >
        <NoCatalogsScreen v-if="noCatalogsScreen" />
        <NotFoundPage v-else-if="streamTabNotFound || catalogNotFound" />
        <template v-else>
          <div v-if="homeTab === 'stream'" class="stream-tabs">
            <button
              v-for="tab in streamTabs"
              :key="tab.key"
              class="stream-tab"
              :class="{ active: activeMediaTabKey === tab.key }"
              :disabled="!mediaTabEnabled(tab.key)"
              type="button"
              @click="selectMediaTab(tab.key)"
            >
              <q-icon :name="tab.icon" size="15px" />
              <span>{{ tab.label }}</span>
            </button>
          </div>

          <template v-if="homeTab === 'stream'">
          <template v-if="streamTab === 'movies'">
            <div class="stream-filter-toolbar q-mb-md">
              <q-select class="stream-filter-field stream-filter-field--genre"
                v-model="movieGenreId" dark outlined dense clearable emit-value map-options
                :options="movieGenres" option-label="name" option-value="id" label="Genre"
                @update:model-value="applyMovieFilters">
                <template #prepend><q-icon name="category" /></template>
              </q-select>
              <q-select class="stream-filter-field stream-filter-field--year"
                v-model="movieYear" dark outlined dense clearable emit-value map-options
                :options="filterYears" label="Release year" @update:model-value="applyMovieFilters">
                <template #prepend><q-icon name="event" /></template>
              </q-select>
              <q-select class="stream-filter-field stream-filter-field--rating"
                v-model="movieMinRating" dark outlined dense emit-value map-options
                :options="ratingFilters" label="TMDB rating" @update:model-value="applyMovieFilters">
                <template #prepend><q-icon name="star" /></template>
              </q-select>
              <q-select class="stream-filter-field stream-filter-field--votes"
                v-model="movieMinVoteCount" dark outlined dense emit-value map-options
                :options="voteCountFilters" label="Minimum votes" @update:model-value="applyMovieFilters">
                <template #prepend><q-icon name="groups" /></template>
              </q-select>
              <q-select class="stream-filter-field stream-filter-field--language"
                v-model="movieLanguage" dark outlined dense emit-value map-options
                :options="languageFilters" label="Original language" @update:model-value="applyMovieFilters">
                <template #prepend><q-icon name="translate" /></template>
              </q-select>
              <q-select class="stream-filter-field stream-filter-field--sort"
                v-model="movieSortBy" dark outlined dense emit-value map-options
                :options="movieSortFilters" label="Sort by" @update:model-value="applyMovieFilters">
                <template #prepend><q-icon name="sort" /></template>
              </q-select>
              <q-btn class="stream-filter-clear" flat round dense color="grey-5" icon="filter_alt_off"
                aria-label="Clear filters" title="Clear filters" :disable="!hasMovieFilters" @click="clearMovieFilters" />
            </div>

            <q-banner v-if="error" dense class="error q-mb-md" rounded>
              <template #avatar>
                <q-icon name="error" color="negative" />
              </template>
              {{ error }}
            </q-banner>

          <div class="movie-grid">
            <div
              v-for="movie in movies"
              :key="movie.id"
              class="movie-grid-item"
            >
              <q-card
                dark
                class="movie-card full-height column"
                  @click="isTouchDevice ? onPlay(localItemFor(movie.id) ?? movie) : openDetails(movie)"
              >
                <div class="poster-wrap">
                  <q-img
                    :src="movie.posterUrl ?? undefined"
                    fit="cover"
                    class="poster"
                  >
                    <template #error>
                      <div class="poster-fallback absolute-full flex flex-center">
                        <q-icon name="movie" size="2rem" color="grey-7" />
                      </div>
                    </template>
                  </q-img>
                  <PluginActionButtons
                    surface="PosterCard"
                    kind="movie"
                    :context="{
                      kind: 'Movie', catalogItemId: localItemFor(movie.id)?.id ?? null,
                      catalogTypeId: localItemFor(movie.id)?.catalogTypeId ?? null,
                      externalId: String(movie.id), title: movie.title,
                      imageUrl: movie.posterUrl, backdropUrl: movie.backdropUrl,
                      overview: movie.overview, year: Number(movie.year) || null,
                    }"
                  />
                  <div class="rating absolute-bottom-right q-ma-xs">
                    <q-icon name="star" color="secondary" size="16px" />
                    {{ movie.voteAverage.toFixed(1) }}
                  </div>
                  <div class="play-overlay absolute-full flex flex-center">
                    <q-btn
                      round
                      unelevated
                      color="primary"
                      text-color="dark"
                      icon="play_arrow"
                      size="lg"
                      :aria-label="`Play ${movie.title}`"
                      @click.stop="onPlay(localItemFor(movie.id) ?? movie)"
                    />
                    <div class="movie-overview">
                      {{ movie.overview || 'No description available.' }}
                    </div>
                  </div>
                </div>

                <q-card-section class="col q-pa-sm">
                  <div class="movie-title">{{ movie.title }}</div>
                  <div class="movie-year text-primary">{{ movie.year ?? '—' }}</div>
                </q-card-section>
              </q-card>
            </div>
          </div>

          <div v-if="loading" class="flex flex-center q-my-xl">
            <q-spinner-dots color="primary" size="3rem" />
          </div>

          <div v-if="!loading && !error && movies.length === 0" class="text-grey-6 text-center q-my-xl">
            no results
          </div>

          <div class="flex flex-center q-my-lg">
            <q-pagination
              :model-value="page"
              :max="totalPages"
              :max-pages="isTouchDevice ? 3 : 7"
              :direction-links="true"
              :boundary-links="!isTouchDevice"
              :size="isTouchDevice ? 'sm' : 'md'"
              color="primary"
              text-color="grey-5"
              active-color="primary"
              active-text-color="dark"
              @update:model-value="goToPage"
            />
          </div>
          </template>

          <template v-else-if="streamTab === 'tv'">
            <div class="stream-filter-toolbar q-mb-md">
              <q-select class="stream-filter-field stream-filter-field--genre"
                v-model="tvGenreId" dark outlined dense clearable emit-value map-options
                :options="tvGenres" option-label="name" option-value="id" label="Genre"
                @update:model-value="applyTvFilters">
                <template #prepend><q-icon name="category" /></template>
              </q-select>
              <q-select class="stream-filter-field stream-filter-field--year"
                v-model="tvYear" dark outlined dense clearable emit-value map-options
                :options="filterYears" label="First air year" @update:model-value="applyTvFilters">
                <template #prepend><q-icon name="event" /></template>
              </q-select>
              <q-select class="stream-filter-field stream-filter-field--rating"
                v-model="tvMinRating" dark outlined dense emit-value map-options
                :options="ratingFilters" label="TMDB rating" @update:model-value="applyTvFilters">
                <template #prepend><q-icon name="star" /></template>
              </q-select>
              <q-select class="stream-filter-field stream-filter-field--votes"
                v-model="tvMinVoteCount" dark outlined dense emit-value map-options
                :options="voteCountFilters" label="Minimum votes" @update:model-value="applyTvFilters">
                <template #prepend><q-icon name="groups" /></template>
              </q-select>
              <q-select class="stream-filter-field stream-filter-field--language"
                v-model="tvLanguage" dark outlined dense emit-value map-options
                :options="languageFilters" label="Original language" @update:model-value="applyTvFilters">
                <template #prepend><q-icon name="translate" /></template>
              </q-select>
              <q-select class="stream-filter-field stream-filter-field--sort"
                v-model="tvSortBy" dark outlined dense emit-value map-options
                :options="tvSortFilters" label="Sort by" @update:model-value="applyTvFilters">
                <template #prepend><q-icon name="sort" /></template>
              </q-select>
              <q-btn class="stream-filter-clear" flat round dense color="grey-5" icon="filter_alt_off"
                aria-label="Clear filters" title="Clear filters" :disable="!hasTvFilters" @click="clearTvFilters" />
            </div>

            <q-banner v-if="tvError" dense class="error q-mb-md" rounded>
              <template #avatar>
                <q-icon name="error" color="negative" />
              </template>
              {{ tvError }}
            </q-banner>

            <div class="movie-grid">
              <div v-for="show in tvShows" :key="show.id" class="movie-grid-item">
                <q-card
                  dark
                  class="movie-card full-height column"
                  @click="openTvDetails(show)"
                >
                  <div class="poster-wrap">
                    <q-img
                      :src="show.posterUrl ?? undefined"
                      fit="cover"
                      class="poster"
                    >
                      <template #error>
                        <div class="poster-fallback absolute-full flex flex-center">
                          <q-icon name="live_tv" size="2rem" color="grey-7" />
                        </div>
                      </template>
                    </q-img>
                    <q-btn
                      round
                      unelevated
                      color="dark"
                      text-color="primary"
                      icon="info"
                      size="sm"
                      class="poster-info-button"
                      :aria-label="`Browse ${show.title}`"
                      @click.stop="openTvDetails(show)"
                    />
                    <PluginActionButtons
                      surface="PosterCard"
                      kind="tv"
                      :context="{
                        kind: 'Tv', catalogItemId: localItemFor(show.id)?.id ?? null,
                        catalogTypeId: localItemFor(show.id)?.catalogTypeId ?? null,
                        externalId: String(show.id), title: show.title,
                        imageUrl: show.posterUrl, backdropUrl: show.backdropUrl,
                        overview: show.overview, year: Number(show.year) || null,
                      }"
                    />
                    <div class="rating absolute-bottom-right q-ma-xs">
                      <q-icon name="star" color="secondary" size="16px" />
                      {{ show.voteAverage.toFixed(1) }}
                    </div>
                    <div class="play-overlay absolute-full flex flex-center">
                      <div class="movie-overview">
                        {{ show.overview || 'No description available.' }}
                      </div>
                    </div>
                  </div>

                  <q-card-section class="col q-pa-sm">
                    <div class="movie-title">{{ show.title }}</div>
                    <div class="movie-year text-primary">{{ show.year ?? '—' }}</div>
                  </q-card-section>
                </q-card>
              </div>
            </div>

            <div v-if="tvLoading" class="flex flex-center q-my-xl">
              <q-spinner-dots color="primary" size="3rem" />
            </div>

            <div v-if="!tvLoading && !tvError && tvShows.length === 0" class="text-grey-6 text-center q-my-xl">
              no results
            </div>

            <div class="flex flex-center q-my-lg">
              <q-pagination
                :model-value="tvPage"
                :max="tvTotalPages"
                :max-pages="isTouchDevice ? 3 : 7"
                :direction-links="true"
                :boundary-links="!isTouchDevice"
                :size="isTouchDevice ? 'sm' : 'md'"
                color="primary"
                text-color="grey-5"
                active-color="primary"
                active-text-color="dark"
                @update:model-value="goToTvPage"
              />
            </div>
          </template>

          <template v-else-if="activeSourceTab">
            <PluginCustomUiFrame
              v-if="activeSourceTab.customUi"
              :key="activeSourceTab.sourceKey"
              :plugin-key="activeSourceTab.pluginId ?? activeSourceTab.sourceKey"
              :ui-url="activeSourceTab.uiUrl"
            />
            <SourceBrowseGrid
              v-else
              :key="activeSourceTab.sourceKey"
              :source-key="activeSourceTab.sourceKey"
              :icon="activeSourceTab.icon"
              :kind="activeSourceTab.kind"
            />
          </template>

          <div v-else class="coming-soon flex flex-center">
            <div class="text-center">
              <q-icon :name="activeStreamTab?.icon ?? 'construction'" size="3rem" color="grey-7" />
              <div class="coming-soon-text">{{ activeStreamTab?.label ?? 'More' }} — coming soon</div>
            </div>
          </div>
        </template>

        <template v-else-if="homeTab.startsWith('catalog:')">
          <div v-if="selectedCatalog" class="catalog-panel">
            <div
              class="catalog-toolbar row items-center full-width"
              :class="selectedCatalog.catalogType.slug === 'music' ? 'q-mb-lg' : 'catalog-toolbar--items'"
            >
              <div class="catalog-toolbar-icon flex flex-center">
                <q-icon
                  :name="selectedCatalog.catalogType.mediaType.slug === 'video' ? 'movie'
                    : selectedCatalog.catalogType.mediaType.slug === 'audio' ? 'headphones'
                    : selectedCatalog.catalogType.mediaType.slug === 'documents' ? 'description'
                    : 'menu_book'"
                  size="1.5rem"
                  color="primary"
                />
              </div>
              <div class="catalog-toolbar-copy">
                <div class="row items-center q-gutter-sm">
                  <div class="catalog-panel-name">{{ selectedCatalog.name }}</div>
                  <q-badge outline color="primary">{{ selectedCatalog.catalogType.name }}</q-badge>
                  <q-badge outline color="grey-5">{{ selectedCatalog.catalogType.mediaType.name }}</q-badge>
                </div>
                <div class="catalog-toolbar-subtitle">
                  <span v-if="selectedCatalog.description">{{ selectedCatalog.description }}</span>
                  <span v-if="selectedCatalog.path"><q-icon name="folder" size="13px" /> {{ selectedCatalog.path }}</span>
                </div>
              </div>
              <q-space />
              <q-btn
                v-if="canEditCatalogs && selectedCatalog.catalogType.slug !== 'docs'"
                unelevated
                color="primary"
                text-color="dark"
                icon="upload_file"
                :label="selectedCatalog.catalogType.slug === 'docs' ? 'Add document' : 'Add media'"
                :disable="!selectedCatalog.path"
                :title="selectedCatalog.path ? 'Upload media into this catalog' : 'Set a folder path for this catalog first'"
                @click="catalogUploadOpen = true"
              />
            </div>

            <q-banner v-if="itemsError && selectedCatalog.catalogType.slug !== 'music'" dense class="error q-mb-md" rounded>
              <template #avatar>
                <q-icon name="error" color="negative" />
              </template>
              {{ itemsError }}
            </q-banner>

            <DocsExplorer
              v-if="selectedCatalog.catalogType.slug === 'docs'"
              :key="selectedCatalog.id"
              :catalog="selectedCatalog"
              :can-edit-catalogs="canEditCatalogs"
              @add-document="onCatalogItemCreated"
              @open-document="openDocEditor"
            />

            <MusicCatalogBrowser
              v-else-if="selectedCatalog.catalogType.slug === 'music'"
              :key="selectedCatalog.id"
              :catalog="selectedCatalog"
              :can-edit-catalogs="canEditCatalogs"
              :refresh-token="musicRefreshToken"
              @play="onPlay"
              @edit="openItemEditor"
              @changed="onCatalogItemChanged"
            />

            <template v-else>
            <div class="catalog-items-layout" :class="{ 'catalog-items-layout--indexed': showCatalogAlphabetIndex }">
            <div class="movie-grid catalog-items-grid">
              <div
                v-for="item in catalogDisplayItems"
                :key="item.id"
                :ref="(element) => setCatalogItemElement(item.id, element)"
                class="movie-grid-item catalog-index-target"
                :data-catalog-initial="catalogInitial(item.title)"
              >
                <q-card
                  dark
                  class="movie-card full-height column"
                  @click="openCatalogItemDetails(item)"
                >
                  <div class="poster-wrap">
                    <q-img
                      :src="item.imageUrl ?? undefined"
                      fit="cover"
                      class="poster"
                    >
                      <template #error>
                        <div class="poster-fallback absolute-full flex flex-center">
                        <q-icon :name="selectedCatalog.catalogType.slug === 'docs' ? 'description' : 'local_movies'" size="2rem" color="grey-7" />
                        </div>
                      </template>
                    </q-img>
                    <PluginActionButtons
                      surface="PosterCard"
                      :kind="item.kind"
                      :context="{
                        catalogItemId: item.id, catalogTypeId: item.catalogTypeId,
                        kind: item.kind, title: item.title, externalId: item.externalId,
                        imageUrl: item.imageUrl, backdropUrl: item.backdropUrl,
                        overview: item.overview, year: item.year,
                      }"
                    />
                    <div
                      v-if="item.rating != null && !isTouchDevice"
                      class="rating absolute-bottom-right q-ma-xs"
                      title="Official rating"
                    >
                      <q-icon name="star" color="secondary" size="16px" />
                      {{ item.rating.toFixed(1) }}
                    </div>
                    <div v-if="!isTouchDevice" class="absolute-bottom-left q-ma-xs">
                      <item-rating-menu :item="item" size="sm" />
                    </div>
                    <div v-if="selectedCatalog.catalogType.slug !== 'docs'" class="play-overlay absolute-full flex flex-center">
                      <q-btn
                        round
                        unelevated
                        color="primary"
                        text-color="dark"
                        icon="play_arrow"
                        size="lg"
                        :aria-label="`Play ${item.title}`"
                        @click.stop="onPlay(item)"
                      />
                      <div class="movie-overview">
                        {{ item.overview || 'No description available.' }}
                      </div>
                    </div>
                  </div>

                  <q-card-section class="col q-pa-sm">
                    <div class="movie-title">{{ item.title }}</div>
                    <div class="movie-year text-primary">{{ item.year ?? '—' }}</div>
                  </q-card-section>
                </q-card>
              </div>
            </div>

            <nav
              v-if="showCatalogAlphabetIndex && catalogDisplayItems.length"
              ref="catalogAlphaIndexElement"
              class="catalog-alpha-index"
              :style="{
                '--catalog-alpha-count': catalogAlphabetIndex.length,
                '--catalog-alpha-height': catalogAlphaHeight ? `${catalogAlphaHeight}px` : undefined,
                '--catalog-alpha-font-size': `${catalogAlphaFontSize}px`,
              }"
              aria-label="Jump to title initial"
            >
              <button
                v-for="entry in catalogAlphabetIndex"
                :key="entry.letter"
                type="button"
                :disabled="!entry.available"
                :class="{ 'catalog-alpha-index__button--current': !catalogAlphaScrolling && catalogAlphaActiveLetter === entry.letter }"
                :style="{ '--catalog-alpha-scale': catalogAlphaScale(entry.letter) }"
                :aria-label="`Jump to ${entry.letter === '#' ? 'numbered titles' : entry.letter}`"
                @click="jumpToCatalogInitial(entry.letter)"
              >{{ entry.letter }}</button>
            </nav>
            </div>

            <div v-if="itemsLoading" class="flex flex-center q-my-xl">
              <q-spinner-dots color="primary" size="3rem" />
            </div>

            <div v-if="!itemsLoading && !itemsError && catalogDisplayItems.length === 0" class="text-grey-6 text-center q-mt-lg">
              nothing in this library yet
            </div>
            </template>
          </div>
          <div v-else class="coming-soon flex flex-center">
            <div class="text-center">
              <q-icon name="library_books" size="3rem" color="grey-7" />
              <div class="coming-soon-text">catalog not found</div>
            </div>
          </div>
        </template>
        </template>
      </div>
    </div>

    <CatalogItemEditDialog
      v-model:open="itemEditOpen"
      v-model:item="itemEditTarget"
      @saved="onCatalogItemChanged"
      @deleted="onCatalogItemChanged"
    />
    <CatalogUploadDialog
      v-model:open="catalogUploadOpen"
      :catalog="selectedCatalog"
      @created="onCatalogItemCreated"
    />
    <DocToolsDialog v-model:open="docToolsDialogOpen" :can-manage="canEditSettings" />
    <DocEditorDialog
      v-model:open="docEditorOpen"
      :catalog="docEditorCatalog"
      :entry="docEditorEntry"
      :tool="docEditorTool"
    />
  </q-page>
</template>
