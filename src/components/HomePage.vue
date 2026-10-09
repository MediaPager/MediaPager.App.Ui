<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMovies } from '../composables/useMovies'
import { useTvShows } from '../composables/useTvShows'
import { useStreamTabs } from '../composables/useStreamTabs'
import { usePlayback } from '../composables/usePlayback'
import { useCatalogs } from '../composables/useCatalogs'
import { useCatalogItems } from '../composables/useCatalogItems'
import { useSources } from '../composables/useSources'
import { usePluginActivity } from '../composables/usePluginActivity'
import { useAuth } from '../composables/useAuth'
import MovieDetailSheet from './MovieDetailSheet.vue'
import TvShowDetailSheet from './TvShowDetailSheet.vue'
import SourceBrowseGrid from './SourceBrowseGrid.vue'
import PluginCustomUiFrame from './PluginCustomUiFrame.vue'
import NotFoundPage from './NotFoundPage.vue'
import NoCatalogsScreen from './NoCatalogsScreen.vue'
import CatalogItemEditDialog from './CatalogItemEditDialog.vue'
import CatalogUploadDialog from './CatalogUploadDialog.vue'
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
  openDetails,
  openLocalDetails,
  goToPage,
  isTouchDevice,
} = useMovies()
const {
  tvShows,
  tvPage,
  tvTotalPages,
  tvLoading,
  tvError,
  openTvDetails,
  goToTvPage,
  fetchTvShows,
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
const { canEditCatalogs } = useAuth()
const seenCompletedJobIds = new Set()

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

const activeSourceTab = computed(() =>
  isSourceTab(streamTab.value)
    ? sourceTabs.value.find((tab) => `source:${tab.sourceKey}` === streamTab.value) ?? null
    : null)

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
  [sourcesLoaded, () => route.name, navCatalogs],
  () => {
    if (route.name !== 'stream' || !sourcesLoaded.value) return
    if (hasOnlineStreamProvider.value) return
    const first = navCatalogs.value[0]
    if (first) router.replace({ name: 'catalog', params: { name: first.name } })
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
watch(selectedCatalog, (catalog) => {
  if (catalog) fetchItems(catalog.id)
}, { immediate: true })

function openItemEditor(item) {
  itemEditTarget.value = item
  itemEditOpen.value = true
}

async function onCatalogItemCreated() {
  if (selectedCatalog.value) await fetchItems(selectedCatalog.value.id)
  await refreshLocalMap()
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
          <q-tab v-if="showStreamNav" name="stream" label="Stream" />
          <template v-if="!reorderMode">
            <q-tab
              v-for="catalog in navCatalogs"
              :key="catalog.id"
              :name="`catalog:${catalog.name}`"
              :label="catalog.name"
            />
          </template>
        </q-tabs>

        <q-list v-if="!reorderMode && pluginMainNav.length" dense class="plugin-main-nav">
          <q-item
            v-for="entry in pluginMainNav"
            :key="entry.key"
            clickable
            @click="router.push({ name: 'plugin', params: { pluginId: entry.pluginId, pathMatch: entry.path.split('/').filter(Boolean) } })"
          >
            <q-item-section avatar><q-icon :name="entry.icon || 'extension'" /></q-item-section>
            <q-item-section>{{ entry.label }}</q-item-section>
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

      <div class="home-panel">
        <NoCatalogsScreen v-if="noCatalogsScreen" />
        <NotFoundPage v-else-if="streamTabNotFound || catalogNotFound" />
        <template v-else>
          <div v-if="homeTab === 'stream' || homeTab.startsWith('catalog:')" class="stream-tabs">
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
                      <q-btn
                        round
                        unelevated
                        color="primary"
                        text-color="dark"
                        icon="info"
                        size="lg"
                        :aria-label="`Browse ${show.title}`"
                        @click.stop="openTvDetails(show)"
                      />
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
            <div v-if="canEditCatalogs" class="row justify-end full-width q-mb-md">
              <q-btn
                unelevated
                color="primary"
                text-color="dark"
                icon="upload_file"
                label="Add media"
                :disable="!selectedCatalog.path"
                :title="selectedCatalog.path ? 'Upload media into this catalog' : 'Set a folder path for this catalog first'"
                @click="catalogUploadOpen = true"
              />
            </div>
            <div v-if="!itemsLoading && !itemsError && items.length === 0" class="catalog-header">
              <div class="catalog-panel-icon flex flex-center">
                <q-icon
                  :name="selectedCatalog.catalogType.mediaType.slug === 'video' ? 'movie'
                    : selectedCatalog.catalogType.mediaType.slug === 'audio' ? 'headphones'
                    : 'menu_book'"
                  size="3rem"
                  color="primary"
                />
              </div>
              <div class="catalog-panel-name">{{ selectedCatalog.name }}</div>
              <div class="catalog-panel-meta">
                {{ selectedCatalog.catalogType.name }}
                · {{ selectedCatalog.catalogType.mediaType.name }}
              </div>
              <div v-if="selectedCatalog.description" class="catalog-panel-desc">
                {{ selectedCatalog.description }}
              </div>
              <div v-if="selectedCatalog.path" class="catalog-panel-path">
                <q-icon name="folder" size="14px" /> {{ selectedCatalog.path }}
              </div>
            </div>
            <div v-else-if="items.length > 0" class="catalog-compact-title">
              {{ selectedCatalog.name }}
            </div>

            <q-banner v-if="itemsError" dense class="error q-mb-md" rounded>
              <template #avatar>
                <q-icon name="error" color="negative" />
              </template>
              {{ itemsError }}
            </q-banner>

            <div class="movie-grid catalog-items-grid">
              <div v-for="item in items" :key="item.id" class="movie-grid-item">
                <q-card
                  dark
                  class="movie-card full-height column"
                  @click="openLocalDetails(item)"
                >
                  <div class="poster-wrap">
                    <q-img
                      :src="item.imageUrl ?? undefined"
                      fit="cover"
                      class="poster"
                    >
                      <template #error>
                        <div class="poster-fallback absolute-full flex flex-center">
                          <q-icon name="local_movies" size="2rem" color="grey-7" />
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
                    <div class="play-overlay absolute-full flex flex-center">
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

            <div v-if="itemsLoading" class="flex flex-center q-my-xl">
              <q-spinner-dots color="primary" size="3rem" />
            </div>

            <div v-if="!itemsLoading && !itemsError && items.length === 0" class="text-grey-6 text-center q-mt-lg">
              nothing in this library yet
            </div>
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

    <MovieDetailSheet />
    <TvShowDetailSheet />
    <CatalogItemEditDialog
      v-model:open="itemEditOpen"
      v-model:item="itemEditTarget"
      @saved="refreshLocalMap"
      @deleted="refreshLocalMap"
    />
    <CatalogUploadDialog
      v-model:open="catalogUploadOpen"
      :catalog="selectedCatalog"
      @created="onCatalogItemCreated"
    />
  </q-page>
</template>
