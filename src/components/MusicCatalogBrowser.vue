<script setup>
import { computed, ref, watch } from 'vue'
import { api } from '../composables/useApi'
import { useCatalogItems } from '../composables/useCatalogItems'

const props = defineProps({
  catalog: { type: Object, required: true },
  canEditCatalogs: { type: Boolean, default: false },
  refreshToken: { type: Number, default: 0 },
})
const emit = defineEmits(['play', 'edit', 'changed'])
const { deleteItem } = useCatalogItems()

const tabs = [
  { name: 'songs', label: 'Songs', icon: 'queue_music' },
  { name: 'artists', label: 'Artists', icon: 'people' },
  { name: 'albums', label: 'Albums', icon: 'album' },
  { name: 'unorganized', label: 'Needs organization', icon: 'playlist_remove' },
]
const trackSortOptions = [
  { label: 'Title', value: 'title' },
  { label: 'Artist', value: 'artist' },
  { label: 'Album', value: 'album' },
  { label: 'Year', value: 'year' },
  { label: 'Recently added', value: 'recent' },
]
const albumSortOptions = [
  { label: 'Artist', value: 'artist' },
  { label: 'Recently added', value: 'recent' },
]
const artistSortOptions = [{ label: 'Recently added', value: 'recent' }]

const libraryTab = ref('songs')
const artist = ref(null)
const album = ref(null)
const searchText = ref('')
const search = ref('')
const genre = ref(null)
const year = ref(null)
const sort = ref('title')
const songViewMode = ref('songs')
const page = ref(1)
const pageSize = 75
const totalPages = ref(1)
const totalItems = ref(0)
const items = ref([])
const selectedIds = ref([])
const stats = ref({ artists: 0, albums: 0, tracks: 0, unorganizedTracks: 0, genres: [], years: [] })
const loading = ref(false)
const statsLoading = ref(false)
const error = ref('')
let activeRequest = 0
let searchTimer

const level = computed(() => {
  if (album.value) return 'track'
  if (artist.value) return 'album'
  if (libraryTab.value === 'artists') return 'artist'
  if (libraryTab.value === 'albums') return 'album'
  if (libraryTab.value === 'unorganized') return 'unorganized'
  return 'track'
})
const parentId = computed(() => album.value?.id ?? artist.value?.id ?? null)
const isTrackView = computed(() => level.value === 'track' || level.value === 'unorganized')
const sortOptions = computed(() => level.value === 'artist'
  ? artistSortOptions
  : level.value === 'album' ? albumSortOptions : trackSortOptions)
const visibleSelectedCount = computed(() => items.value.filter(item => selectedIds.value.includes(item.id)).length)
const allVisibleSelected = computed(() => items.value.length > 0 && visibleSelectedCount.value === items.value.length)
const genreOptions = computed(() => (stats.value.genres ?? []).map(item => ({ label: `${item.name} (${item.count})`, value: item.name })))
const yearOptions = computed(() => (stats.value.years ?? []).map(value => ({ label: String(value), value })))
const tabLabel = (tab) => {
  const count = tab.name === 'songs' ? stats.value.tracks
    : tab.name === 'artists' ? stats.value.artists
      : tab.name === 'albums' ? stats.value.albums
        : stats.value.unorganizedTracks
  return `${tab.label} · ${count ?? 0}`
}
const viewByOptions = computed(() => tabs.map(tab => ({ label: tabLabel(tab), value: tab.name })))

watch(searchText, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    search.value = value.trim()
    page.value = 1
    selectedIds.value = []
  }, 250)
})
watch([genre, year, sort], () => {
  page.value = 1
  selectedIds.value = []
})
watch(songViewMode, () => { selectedIds.value = [] })
watch(level, (currentLevel) => {
  const defaultSort = currentLevel === 'artist' ? 'recent' : currentLevel === 'album' ? 'artist' : 'title'
  if (!sortOptions.value.some(option => option.value === sort.value)) sort.value = defaultSort
  page.value = 1
})

watch([() => props.catalog.id, level, parentId, search, genre, year, sort, page, () => props.refreshToken], load, { immediate: true })
watch([() => props.catalog.id, () => props.refreshToken], loadStats, { immediate: true })

async function load() {
  const requestId = ++activeRequest
  loading.value = true
  error.value = ''
  try {
    const params = {
      catalogId: props.catalog.id,
      level: level.value,
      page: page.value,
      pageSize,
      sort: sort.value,
    }
    if (parentId.value != null) params.parentId = parentId.value
    if (search.value) params.queryText = search.value
    if (genre.value) params.genre = genre.value
    if (year.value) params.year = year.value
    const { data } = await api.get('/catalog-items/music', { params })
    if (requestId !== activeRequest) return
    items.value = data.items ?? []
    totalPages.value = data.totalPages ?? 1
    totalItems.value = data.totalItems ?? items.value.length
  } catch (failure) {
    if (requestId !== activeRequest) return
    items.value = []
    error.value = failure.response?.data?.detail ?? failure.response?.data?.error ?? failure.message
  } finally {
    if (requestId === activeRequest) loading.value = false
  }
}

async function loadStats() {
  statsLoading.value = true
  try {
    const { data } = await api.get('/catalog-items/music/stats', { params: { catalogId: props.catalog.id } })
    stats.value = data
  } catch {
    // The catalog itself remains browsable if aggregate statistics are unavailable.
  } finally {
    statsLoading.value = false
  }
}

function changeTab(tab) {
  libraryTab.value = tab
  artist.value = null
  album.value = null
  page.value = 1
  selectedIds.value = []
}

function openArtist(item) {
  libraryTab.value = 'artists'
  artist.value = item
  album.value = null
  page.value = 1
  selectedIds.value = []
}

function openAlbum(item) {
  album.value = item
  artist.value = item.parentId != null
    ? { id: item.parentId, title: item.parentTitle ?? 'Artist' }
    : null
  page.value = 1
  selectedIds.value = []
}

function resetToRoot(tab = libraryTab.value) {
  artist.value = null
  album.value = null
  changeTab(tab)
}

function resetToAlbums() {
  album.value = null
  page.value = 1
}

function toggleSelected(id, selected) {
  selectedIds.value = selected
    ? [...new Set([...selectedIds.value, id])]
    : selectedIds.value.filter(value => value !== id)
}

function toggleAllVisible(selected) {
  const visibleIds = items.value.map(item => item.id)
  selectedIds.value = selected
    ? [...new Set([...selectedIds.value, ...visibleIds])]
    : selectedIds.value.filter(id => !visibleIds.includes(id))
}

async function removeTrack(track) {
  if (!props.canEditCatalogs || !window.confirm(`Remove “${track.title}” from this catalog? The media file itself will remain on disk.`)) return
  try {
    await deleteItem(track.id)
    selectedIds.value = selectedIds.value.filter(id => id !== track.id)
    emit('changed')
    await Promise.all([load(), loadStats()])
  } catch (failure) {
    error.value = failure.response?.data?.detail ?? failure.response?.data?.error ?? failure.message
  }
}

async function removeSelected() {
  if (!props.canEditCatalogs || selectedIds.value.length === 0) return
  const count = selectedIds.value.length
  if (!window.confirm(`Remove ${count} selected ${count === 1 ? 'track' : 'tracks'} from this catalog? The media files themselves will remain on disk.`)) return
  try {
    for (const id of [...selectedIds.value]) await deleteItem(id)
    selectedIds.value = []
    emit('changed')
    await Promise.all([load(), loadStats()])
  } catch (failure) {
    error.value = failure.response?.data?.detail ?? failure.response?.data?.error ?? failure.message
  }
}

function artistsFor(track) {
  return track.musicArtistCredits?.filter(credit => credit.role === 'artist').map(credit => credit.name).join(', ') || 'Unknown artist'
}

function needsMetadata(track) {
  return !track.musicBrainzId || !track.parentId || !(track.musicArtistCredits?.some(credit => credit.role === 'artist'))
}

function durationLabel(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—'
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

function fileFormat(track) {
  const extension = track.storagePath?.split('.').pop()
  return extension && extension.length <= 5 ? extension.toUpperCase() : '—'
}

function playTrack(track) {
  emit('play', {
    ...track,
    kind: 'music',
    artist: artistsFor(track),
    album: track.parentTitle ?? null,
    artworkUrl: track.imageUrl ?? null,
    localItem: track,
  })
}
</script>

<template>
  <section class="music-library">
    <div class="music-library-stats">
      <div class="music-stat-card"><q-icon name="queue_music" /><strong>{{ stats.tracks }}</strong><span>Songs</span></div>
      <div class="music-stat-card"><q-icon name="album" /><strong>{{ stats.albums }}</strong><span>Albums</span></div>
      <div class="music-stat-card"><q-icon name="people" /><strong>{{ stats.artists }}</strong><span>Artists</span></div>
      <div class="music-stat-card music-stat-attention" :class="{ 'music-stat-clear': !stats.unorganizedTracks }">
        <q-icon :name="stats.unorganizedTracks ? 'playlist_remove' : 'task_alt'" />
        <strong>{{ stats.unorganizedTracks }}</strong><span>{{ stats.unorganizedTracks ? 'Need organization' : 'All organized' }}</span>
      </div>
    </div>

    <q-banner v-if="stats.unorganizedTracks > 0" dense rounded class="music-attention-banner q-mb-md">
      <template #avatar><q-icon name="info" color="warning" /></template>
      {{ stats.unorganizedTracks }} audio {{ stats.unorganizedTracks === 1 ? 'file has' : 'files have' }} no artist/album organization yet. They remain available under Songs and Needs organization.
      <template #action><q-btn flat dense color="warning" label="Review tracks" @click="changeTab('unorganized')" /></template>
    </q-banner>

    <div class="music-library-toolbar row items-center q-col-gutter-sm q-mb-md">
      <div class="col-12 col-lg">
        <q-input v-model="searchText" dark outlined dense clearable label="Search songs, artists, and albums" placeholder="Search this catalog">
          <template #prepend><q-icon name="search" /></template>
        </q-input>
      </div>
      <div class="col-6 col-sm-4 col-lg-2">
        <q-select
          :model-value="libraryTab"
          dark outlined dense emit-value map-options
          :options="viewByOptions"
          label="View by"
          @update:model-value="changeTab"
        >
          <template #prepend><q-icon name="library_music" /></template>
        </q-select>
      </div>
      <div class="col-6 col-sm-4 col-lg-2">
        <q-select v-model="genre" dark outlined dense clearable emit-value map-options :options="genreOptions" label="Genre">
          <template #prepend><q-icon name="sell" /></template>
          <template #no-option><q-item><q-item-section class="text-grey-6">No genres tagged yet</q-item-section></q-item></template>
        </q-select>
      </div>
      <div class="col-6 col-sm-3 col-lg-1">
        <q-select v-model="year" dark outlined dense clearable emit-value map-options :options="yearOptions" label="Year">
          <template #prepend><q-icon name="event" /></template>
        </q-select>
      </div>
      <div class="col-12 col-sm-5 col-lg-2">
        <q-select v-model="sort" dark outlined dense emit-value map-options :options="sortOptions" label="Sort by" />
      </div>
    </div>

    <div class="row items-center q-mb-sm music-results-toolbar">
      <div class="text-caption text-grey-6">
        {{ totalItems }} {{ level === 'artist' ? 'artists' : level === 'album' ? 'albums' : 'songs' }}
        <span v-if="search"> matching “{{ search }}”</span>
      </div>
      <q-space />
      <q-btn-toggle
        v-if="isTrackView"
        v-model="songViewMode"
        dense
        unelevated
        toggle-color="primary"
        color="dark"
        text-color="grey-5"
        :options="[
          { value: 'songs', icon: 'view_list', label: 'List' },
          { value: 'postcards', icon: 'grid_view', label: 'Postcards' },
        ]"
        class="q-ml-sm"
      />
      <q-btn
        v-if="canEditCatalogs && selectedIds.length"
        flat
        dense
        color="negative"
        icon="delete_outline"
        :label="`Remove selected (${selectedIds.length})`"
        class="q-ml-sm"
        @click="removeSelected"
      />
    </div>

    <div v-if="artist || album" class="row items-center q-gutter-xs q-mb-md music-breadcrumbs">
      <q-btn flat dense color="primary" icon="library_music" label="Music library" @click="resetToRoot('songs')" />
      <q-icon name="chevron_right" color="grey-6" />
      <q-btn v-if="artist" flat dense :color="album ? 'primary' : 'white'" :label="artist.title" @click="resetToAlbums" />
      <template v-if="album">
        <q-icon name="chevron_right" color="grey-6" />
        <span class="text-white ellipsis">{{ album.title }}</span>
      </template>
    </div>

    <q-banner v-if="error" dense rounded class="error q-mb-md">
      <template #avatar><q-icon name="error" color="negative" /></template>
      {{ error }}
      <template #action><q-btn flat dense label="Retry" @click="load" /></template>
    </q-banner>

    <div v-if="isTrackView && items.length && songViewMode === 'songs'" class="music-table-scroll">
      <q-markup-table dark flat separator="horizontal" class="music-track-table">
        <thead>
          <tr>
            <th class="text-center music-select-col">
              <q-checkbox
                :model-value="allVisibleSelected"
                dense
                color="primary"
                aria-label="Select all tracks on this page"
                title="Select all tracks on this page"
                @update:model-value="toggleAllVisible"
              />
            </th>
            <th class="text-left music-track-title-col">Track</th>
            <th class="text-left">Artist</th>
            <th class="text-left">Album</th>
            <th class="text-right">Year</th>
            <th class="text-right">Time</th>
            <th class="text-center">Format</th>
            <th class="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="track in items" :key="track.id" class="music-track-table-row">
            <td class="text-center music-select-col">
              <q-checkbox :model-value="selectedIds.includes(track.id)" dense color="primary" :aria-label="`Select ${track.title}`" @update:model-value="value => toggleSelected(track.id, value)" />
            </td>
            <td class="music-track-title-col">
              <div class="row items-center no-wrap q-gutter-sm">
                <q-avatar rounded size="42px" color="grey-9" text-color="grey-5">
                  <q-img v-if="track.imageUrl" :src="track.imageUrl" fit="cover" />
                  <q-icon v-else name="music_note" />
                </q-avatar>
                <div class="music-track-primary">
                  <button class="music-track-title" :disabled="!track.storagePath" @click="playTrack(track)">{{ track.title }}</button>
                  <div class="music-track-subtitle">
                    <span v-if="track.discNumber && track.trackNumber">{{ track.discNumber }}.{{ String(track.trackNumber).padStart(2, '0') }} · </span>
                    <span v-if="track.musicBrainzId" :title="`MusicBrainz ID: ${track.musicBrainzId}`">MBID {{ track.musicBrainzId }}</span>
                    <span v-if="track.isrc">ISRC {{ track.isrc }}</span>
                    <q-badge v-if="needsMetadata(track)" color="warning" text-color="dark" label="Needs metadata" />
                  </div>
                </div>
              </div>
            </td>
            <td class="music-cell-secondary">{{ artistsFor(track) }}</td>
            <td class="music-cell-secondary">{{ track.parentTitle ?? 'Unorganized' }}</td>
            <td class="text-right music-cell-secondary">{{ track.year ?? '—' }}</td>
            <td class="text-right music-cell-secondary">{{ durationLabel(track.durationSeconds) }}</td>
            <td class="text-center"><q-badge outline color="grey-6">{{ fileFormat(track) }}</q-badge></td>
            <td class="text-right">
              <q-btn flat round dense color="primary" icon="play_arrow" :disable="!track.storagePath" title="Play locally" @click="playTrack(track)" />
              <q-btn v-if="canEditCatalogs" flat round dense color="grey-5" icon="edit" title="Edit metadata" @click="emit('edit', track)" />
              <q-btn v-if="canEditCatalogs" flat round dense color="negative" icon="delete_outline" title="Remove from catalog" @click="removeTrack(track)" />
            </td>
          </tr>
        </tbody>
      </q-markup-table>
    </div>

    <div v-else-if="isTrackView && items.length" class="music-postcard-grid">
      <q-card v-for="track in items" :key="track.id" dark class="music-postcard">
        <div class="music-postcard-art-wrap">
          <q-img v-if="track.imageUrl" :src="track.imageUrl" ratio="1" fit="cover" class="music-postcard-art">
            <template #error><div class="absolute-full flex flex-center bg-grey-10 text-grey-7"><q-icon name="music_note" size="2.5rem" /></div></template>
          </q-img>
          <div v-else class="music-postcard-art flex flex-center bg-grey-10 text-grey-7"><q-icon name="music_note" size="2.5rem" /></div>
          <q-badge v-if="needsMetadata(track)" color="warning" text-color="dark" class="music-postcard-status" label="Needs metadata" />
          <q-btn round unelevated color="primary" text-color="dark" icon="play_arrow" class="music-postcard-play" :disable="!track.storagePath" title="Play locally" @click="playTrack(track)" />
        </div>
        <q-card-section class="q-pa-sm">
          <div class="music-postcard-title ellipsis">{{ track.title }}</div>
          <div class="music-postcard-detail ellipsis">{{ artistsFor(track) }}</div>
          <div class="music-postcard-detail ellipsis">{{ track.parentTitle ?? 'Unorganized' }}<span v-if="track.year"> · {{ track.year }}</span></div>
          <div class="row items-center justify-between q-mt-xs">
            <span class="music-postcard-detail">{{ durationLabel(track.durationSeconds) }}</span>
            <div>
              <q-btn v-if="canEditCatalogs" flat round dense color="grey-5" icon="edit" title="Edit metadata" @click="emit('edit', track)" />
              <q-btn v-if="canEditCatalogs" flat round dense color="negative" icon="delete_outline" title="Remove from catalog" @click="removeTrack(track)" />
            </div>
          </div>
        </q-card-section>
      </q-card>
    </div>

    <div v-else-if="items.length" class="music-collection-grid">
      <q-card v-for="item in items" :key="item.id" dark class="music-collection-card cursor-pointer" @click="level === 'artist' ? openArtist(item) : openAlbum(item)">
        <q-img v-if="item.imageUrl" :src="item.imageUrl" ratio="1" fit="cover" class="music-collection-art">
          <template #error><div class="absolute-full flex flex-center bg-grey-10 text-grey-7"><q-icon :name="level === 'artist' ? 'person' : 'album'" size="3rem" /></div></template>
        </q-img>
        <div v-else class="music-collection-art flex flex-center bg-grey-10 text-grey-7"><q-icon :name="level === 'artist' ? 'person' : 'album'" size="3rem" /></div>
        <q-card-section class="q-pa-sm">
          <div class="text-white ellipsis">{{ item.title }}</div>
          <div class="text-caption text-grey-6 ellipsis">
            {{ level === 'artist' ? 'Artist' : [item.parentTitle, item.year].filter(Boolean).join(' · ') || 'Album' }}
          </div>
        </q-card-section>
      </q-card>
    </div>

    <div v-else-if="!loading && !error" class="music-empty-state text-center q-pa-xl">
      <q-icon :name="level === 'artist' ? 'people' : level === 'album' ? 'album' : 'queue_music'" size="2.5rem" />
      <div class="q-mt-sm">{{ search ? 'No music matches these filters.' : level === 'artist' ? 'No artists have been identified yet.' : level === 'album' ? 'No albums in this view yet.' : 'No audio files are in this catalog yet. Use Add media to import files.' }}</div>
      <q-btn v-if="level === 'artist' && stats.tracks" flat color="primary" label="Browse all songs" class="q-mt-sm" @click="changeTab('songs')" />
    </div>

    <div v-if="loading || statsLoading" class="flex flex-center q-pa-md"><q-spinner-dots color="primary" size="2rem" /></div>
    <div v-if="totalPages > 1" class="row justify-center q-mt-md">
      <q-pagination v-model="page" :max="totalPages" max-pages="7" direction-links boundary-links color="primary" />
    </div>
  </section>
</template>

<style scoped>
.music-library {
  width: 100%;
  min-width: 0;
}
.music-library-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 18px;
}
.music-stat-card {
  display: grid;
  grid-template-columns: 28px 1fr;
  grid-template-rows: auto auto;
  align-items: center;
  column-gap: 8px;
  padding: 12px 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: linear-gradient(120deg, rgba(20, 28, 41, 0.9), rgba(13, 18, 27, 0.85));
  color: #9aa8ba;
}
.music-stat-card > .q-icon {
  grid-row: 1 / 3;
  color: #86d411;
  font-size: 1.35rem;
}
.music-stat-card strong {
  color: #f3f6fa;
  font-size: 1.25rem;
  line-height: 1.2;
}
.music-stat-card span {
  font-size: 0.72rem;
}
.music-stat-attention > .q-icon,
.music-stat-attention strong {
  color: #ffc857;
}
.music-stat-clear > .q-icon,
.music-stat-clear strong {
  color: #86d411;
}
.music-attention-banner {
  border: 1px solid rgba(255, 200, 87, 0.2);
  background: rgba(104, 76, 25, 0.18);
  color: #d9c79d;
}
.music-library-tabs {
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.music-library-toolbar {
  width: 100%;
}
.music-results-toolbar {
  min-height: 38px;
}
.music-breadcrumbs {
  min-height: 36px;
}
.music-table-scroll {
  overflow-x: auto;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
}
.music-track-table {
  min-width: 820px;
  background: rgba(16, 21, 29, 0.82);
}
.music-track-table thead tr {
  color: #8d9bae;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.music-track-table th {
  height: 40px;
  font-weight: 600;
}
.music-track-table td {
  height: 60px;
}
.music-track-table-row:hover {
  background: rgba(255, 255, 255, 0.035);
}
.music-track-title-col {
  min-width: 290px;
  max-width: 440px;
}
.music-select-col {
  width: 44px;
  min-width: 44px;
  max-width: 44px;
  padding-left: 6px !important;
  padding-right: 6px !important;
}
.music-track-primary {
  min-width: 0;
}
.music-track-title {
  display: block;
  max-width: 100%;
  overflow: hidden;
  padding: 0;
  border: 0;
  background: transparent;
  color: #eef2f8;
  font: inherit;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.music-track-title:not(:disabled) {
  cursor: pointer;
}
.music-track-title:not(:disabled):hover {
  color: #a6e84d;
}
.music-track-title:disabled {
  color: #cbd2dc;
}
.music-track-subtitle {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
  color: #748197;
  font-size: 0.68rem;
}
.music-cell-secondary {
  color: #a9b4c3;
  font-size: 0.82rem;
}
.music-collection-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(145px, 1fr));
  gap: 1rem;
}
.music-postcard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 14px;
}
.music-postcard {
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.07);
  background: #151a21;
}
.music-postcard-art-wrap {
  position: relative;
  overflow: hidden;
  background: #10141a;
}
.music-postcard-art {
  width: 100%;
  aspect-ratio: 1;
}
.music-postcard-status {
  position: absolute;
  top: 8px;
  left: 8px;
}
.music-postcard-play {
  position: absolute;
  right: 9px;
  bottom: 9px;
}
.music-postcard-title {
  color: #eef2f8;
  font-size: 0.88rem;
  font-weight: 600;
}
.music-postcard-detail {
  color: #8491a4;
  font-size: 0.72rem;
}
.music-collection-card {
  overflow: hidden;
  background: #151a21;
  transition: transform 120ms ease, background-color 120ms ease;
}
.music-collection-card:hover {
  transform: translateY(-2px);
  background: #202833;
}
.music-collection-art {
  width: 100%;
  aspect-ratio: 1;
  background: #10141a;
}
.music-empty-state {
  color: #8895a7;
}
@media (max-width: 700px) {
  .music-library-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .music-library-tabs :deep(.q-tab__label) {
    font-size: 0.68rem;
  }
  .music-library-toolbar .col-6 {
    min-width: 50%;
  }
}
</style>
