import { computed, ref } from 'vue'

const QUEUE_KEY = 'mediapager.playlist.queue.v1'
const SAVED_KEY = 'mediapager.playlist.saved.v1'
const ACTIVE_KEY = 'mediapager.playlist.active.v1'

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null')
    return value ?? fallback
  } catch {
    return fallback
  }
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function normalizeKind(kind) {
  const normalized = String(kind ?? 'movie').toLowerCase()
  if (normalized === 'tvshow' || normalized === 'tv-show' || normalized === 'tv-shows') return 'tv'
  if (normalized === 'movies') return 'movie'
  return normalized
}

function normalizeItem(item, reuseId = false) {
  const externalId = String(item?.externalId ?? item?.id ?? '').trim()
  if (!externalId) return null
  return {
    queueEntryId: reuseId && item.queueEntryId ? item.queueEntryId : makeId(),
    kind: normalizeKind(item.kind),
    sourceKey: item.sourceKey ?? null,
    externalId,
    id: item.catalogItemId ?? item.localItem?.id ?? item.id ?? externalId,
    catalogItemId: item.catalogItemId ?? item.localItem?.id ?? null,
    storagePath: item.storagePath ?? item.localItem?.storagePath ?? null,
    title: item.title ?? externalId,
    year: item.year ?? null,
    overview: item.overview ?? '',
    posterUrl: item.posterUrl ?? item.artworkUrl ?? item.imageUrl ?? null,
    artworkUrl: item.artworkUrl ?? item.posterUrl ?? item.imageUrl ?? null,
    backdropUrl: item.backdropUrl ?? null,
    metadata: Array.isArray(item.metadata) ? item.metadata : [],
    season: item.season ?? null,
    episode: item.episode ?? null,
    isEpisode: item.isEpisode === true,
    show: item.show ?? null,
    episodeInfo: item.episodeInfo ?? null,
  }
}

const initialQueue = readJson(QUEUE_KEY, [])
const initialSaved = readJson(SAVED_KEY, [])
const queue = ref(Array.isArray(initialQueue) ? initialQueue.map(item => normalizeItem(item, true)).filter(Boolean) : [])
const savedPlaylists = ref(Array.isArray(initialSaved) ? initialSaved.filter(list => list && Array.isArray(list.items)) : [])
const savedActiveId = localStorage.getItem(ACTIVE_KEY)
const activePlaylistId = ref(savedPlaylists.value.some(list => list.id === savedActiveId) ? savedActiveId : null)
const savedIndex = Number(localStorage.getItem(`${QUEUE_KEY}.index`))
const currentIndex = ref(queue.value.length ? Math.min(Math.max(Number.isInteger(savedIndex) ? savedIndex : 0, 0), queue.value.length - 1) : -1)
const playlistDrawerOpen = ref(false)

const currentItem = computed(() => queue.value[currentIndex.value] ?? null)
const hasNext = computed(() => currentIndex.value >= 0 && currentIndex.value + 1 < queue.value.length)
const hasPrevious = computed(() => currentIndex.value > 0)
const activePlaylist = computed(() => savedPlaylists.value.find(list => list.id === activePlaylistId.value) ?? null)
const currentPlaylistName = computed(() => activePlaylist.value?.name ?? 'Queue')

function persistQueue() {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.value))
  localStorage.setItem(`${QUEUE_KEY}.index`, String(currentIndex.value))
  if (activePlaylistId.value) localStorage.setItem(ACTIVE_KEY, activePlaylistId.value)
  else localStorage.removeItem(ACTIVE_KEY)
}

function persistSaved() {
  localStorage.setItem(SAVED_KEY, JSON.stringify(savedPlaylists.value))
}

function replaceQueue(items, index = 0, playlistId = null) {
  queue.value = (items ?? []).map(item => normalizeItem(item, true)).filter(Boolean)
  currentIndex.value = queue.value.length ? Math.min(Math.max(index, 0), queue.value.length - 1) : -1
  activePlaylistId.value = playlistId
  persistQueue()
}

function replaceQueueWithItem(item) {
  const normalized = normalizeItem(item)
  if (!normalized) return null
  replaceQueue([normalized], 0)
  return normalized
}

function updateActiveSavedPlaylist() {
  if (!activePlaylistId.value) return
  const index = savedPlaylists.value.findIndex(list => list.id === activePlaylistId.value)
  if (index < 0) {
    activePlaylistId.value = null
    persistQueue()
    return
  }
  savedPlaylists.value[index] = {
    ...savedPlaylists.value[index],
    items: queue.value.map(item => ({ ...item })),
    updatedAt: new Date().toISOString(),
  }
  persistSaved()
}

function addToQueue(item) {
  const normalized = normalizeItem(item)
  if (!normalized) return false
  queue.value = [...queue.value, normalized]
  if (currentIndex.value < 0) currentIndex.value = 0
  updateActiveSavedPlaylist()
  persistQueue()
  return true
}

function setCurrentIndex(index) {
  if (index < 0 || index >= queue.value.length) return null
  currentIndex.value = index
  persistQueue()
  return currentItem.value
}

function nextItem() {
  return hasNext.value ? setCurrentIndex(currentIndex.value + 1) : null
}

function previousItem() {
  return hasPrevious.value ? setCurrentIndex(currentIndex.value - 1) : null
}

function removeQueueItem(queueEntryId) {
  const index = queue.value.findIndex(item => item.queueEntryId === queueEntryId)
  if (index < 0) return false
  queue.value = queue.value.filter(item => item.queueEntryId !== queueEntryId)
  if (queue.value.length === 0) currentIndex.value = -1
  else if (index < currentIndex.value) currentIndex.value--
  else if (currentIndex.value >= queue.value.length) currentIndex.value = queue.value.length - 1
  updateActiveSavedPlaylist()
  persistQueue()
  return true
}

function clearQueue() {
  queue.value = []
  currentIndex.value = -1
  activePlaylistId.value = null
  persistQueue()
}

function createPlaylist(name, items = []) {
  const normalizedName = String(name ?? '').trim()
  if (!normalizedName) return null
  const playlist = {
    id: makeId(),
    name: normalizedName,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    items: items.map(item => normalizeItem(item)).filter(Boolean),
  }
  savedPlaylists.value = [...savedPlaylists.value, playlist]
  persistSaved()
  return playlist
}

function saveCurrentQueue(name) {
  if (queue.value.length === 0) return null
  const normalizedName = String(name ?? '').trim()
  if (!normalizedName) return null

  if (activePlaylistId.value) {
    const index = savedPlaylists.value.findIndex(list => list.id === activePlaylistId.value)
    if (index >= 0) {
      savedPlaylists.value[index] = {
        ...savedPlaylists.value[index],
        name: normalizedName,
        items: queue.value.map(item => ({ ...item })),
        updatedAt: new Date().toISOString(),
      }
      persistSaved()
      return savedPlaylists.value[index]
    }
  }

  const playlist = createPlaylist(normalizedName, queue.value)
  if (playlist) {
    activePlaylistId.value = playlist.id
    persistQueue()
  }
  return playlist
}

function loadSavedPlaylist(playlistId) {
  const playlist = savedPlaylists.value.find(list => list.id === playlistId)
  if (!playlist) return false
  // Selecting a saved playlist deliberately replaces the transient queue.
  replaceQueue(playlist.items, 0, playlist.id)
  return true
}

function addToSavedPlaylist(playlistId, item) {
  const normalized = normalizeItem(item)
  const index = savedPlaylists.value.findIndex(list => list.id === playlistId)
  if (!normalized || index < 0) return false
  const playlist = savedPlaylists.value[index]
  const updated = {
    ...playlist,
    items: [...playlist.items, normalized],
    updatedAt: new Date().toISOString(),
  }
  savedPlaylists.value = savedPlaylists.value.map((list, listIndex) => listIndex === index ? updated : list)
  if (activePlaylistId.value === playlistId) queue.value = [...queue.value, { ...normalized }]
  persistSaved()
  persistQueue()
  return true
}

function removeSavedPlaylist(playlistId) {
  savedPlaylists.value = savedPlaylists.value.filter(list => list.id !== playlistId)
  persistSaved()
  if (activePlaylistId.value === playlistId) {
    activePlaylistId.value = null
    persistQueue()
  }
}

export function usePlaylist() {
  return {
    queue,
    savedPlaylists,
    activePlaylistId,
    activePlaylist,
    currentIndex,
    currentItem,
    currentPlaylistName,
    hasNext,
    hasPrevious,
    playlistDrawerOpen,
    replaceQueue,
    replaceQueueWithItem,
    addToQueue,
    setCurrentIndex,
    nextItem,
    previousItem,
    removeQueueItem,
    clearQueue,
    createPlaylist,
    saveCurrentQueue,
    loadSavedPlaylist,
    addToSavedPlaylist,
    removeSavedPlaylist,
  }
}
