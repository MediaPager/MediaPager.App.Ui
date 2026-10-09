import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import videojs from 'video.js'
import '@videojs/http-streaming'
import 'video.js/dist/video-js.css'
import { api, apiOrigin } from './useApi'
import { useMovies } from './useMovies'
import { useSources } from './useSources'
import { useCatalogItems } from './useCatalogItems'

// Player + subtitles share the single video.js player instance, so they live in
// one composable. State is module-level so the player dialog and any triggers stay in sync.

const playLoading = ref(false)
const playerOpen = ref(false)
const currentMovie = ref(null)
const streamUrl = ref('')
const streamType = ref('hls') // 'hls' via the proxy, or 'mp4' from a local library file
const playingLocal = ref(false)
const videoEl = ref(null)
let player = null

// Set by the TV detail sheet while an episode plays: called when the video ends so
// the next episode (if any) can start automatically when autoplay is enabled.
const tvNextHandler = ref(null)

const subtitles = ref([])
const subsLoading = ref(false)
const subtitlePanelOpen = ref(false)
const subtitleQuery = ref('')
const subtitleTitleSearchActive = ref(false)
const subLang = ref('en')
const activeSub = ref(null)
const subtitleError = ref('')
const subtitlesVisible = ref(true)
const subtitlePanelTab = ref('list')
let subtitleObjectUrl = null

const subtitleStyleDefaults = {
  size: 1,
  position: 0,
  fontFamily: 'inherit',
  color: 'rgba(255, 255, 255, 1)',
  background: 'rgba(0, 0, 0, 0.55)',
  fontWeight: 'normal',
}
const savedSubtitleStyle = (() => {
  try {
    return JSON.parse(localStorage.getItem('mediapager.subtitleStyle') ?? '{}')
  } catch {
    return {}
  }
})()
export const subtitleStyle = ref({ ...subtitleStyleDefaults, ...savedSubtitleStyle })
export const subtitleStyleReset = () => { subtitleStyle.value = { ...subtitleStyleDefaults } }

export const fontFamilyOptions = [
  { label: 'Default', value: 'inherit' },
  { label: 'Sans-serif', value: 'sans-serif' },
  { label: 'Serif', value: 'serif' },
  { label: 'Monospace', value: 'monospace' },
  { label: 'JetBrains Mono', value: "'JetBrains Mono', monospace" },
  { label: 'Plus Jakarta Sans', value: "'Plus Jakarta Sans', sans-serif" },
]
export const fontWeightOptions = [
  { label: 'Normal', value: 'normal' },
  { label: 'Bold', value: 'bold' },
  { label: 'Light', value: '300' },
  { label: 'Semi-bold', value: '600' },
]
export const languages = [
  { label: 'English', value: 'en' },
  { label: 'Spanish', value: 'es' },
  { label: 'French', value: 'fr' },
  { label: 'German', value: 'de' },
  { label: 'Italian', value: 'it' },
  { label: 'Portuguese', value: 'pt' },
  { label: 'Dutch', value: 'nl' },
]

const storedSubLang = localStorage.getItem('mediapager.subLang')
if (storedSubLang && languages.some((option) => option.value === storedSubLang)) {
  subLang.value = storedSubLang
}
watch(subLang, (value) => {
  localStorage.setItem('mediapager.subLang', value)
})

watch(subtitleStyle, (value) => {
  localStorage.setItem('mediapager.subtitleStyle', JSON.stringify(value))
}, { deep: true })

export function usePlayback() {
  const { error, isTouchDevice } = useMovies()
  const { loaded: sourcesLoaded, fetchSources, defaultSourceKey } = useSources()
  const { localItemFor, findLocalItemByExternalId } = useCatalogItems()

  // Resolve a title to a proxied HLS URL through the installed stream provider.
  // Which provider that is depends entirely on what the host has loaded — the UI
  // never names one. Throws when no provider is installed or it can't resolve.
  async function resolveProviderStream(externalId, { season = null, episode = null } = {}) {
    if (!sourcesLoaded.value) await fetchSources()
    const sourceKey = defaultSourceKey.value
    if (!sourceKey) {
      throw new Error('No stream provider is installed, so there is nothing to play from.')
    }
    const params = {}
    if (season != null) { params.season = season; params.episode = episode }
    const { data } = await api.get(
      `/sources/${encodeURIComponent(sourceKey)}/resolve/${encodeURIComponent(externalId)}`,
      { params })
    // The stream must come from the API origin; the UI host would otherwise
    // serve the SPA's index.html for this path and the player can't parse it.
    return new URL(`/stream/${data.streamId}/root`, apiOrigin()).toString()
  }

  // Provider round-trips (and autoplay-next) can resolve in a single quick round
  // trip, which would flash the resolving-screen before the browser paints it.
  // Hold it for at least this long so play transitions are always visible.
  const MIN_PLAY_LOADING_MS = 1200
  let playLoadingTimer = null

  function beginPlayLoading() {
    if (playLoadingTimer) { clearTimeout(playLoadingTimer); playLoadingTimer = null }
    playLoading.value = true
  }

  function endPlayLoading() {
    if (playLoadingTimer) { clearTimeout(playLoadingTimer); playLoadingTimer = null }
    playLoadingTimer = setTimeout(() => {
      playLoading.value = false
      playLoadingTimer = null
    }, MIN_PLAY_LOADING_MS)
  }

  async function onPlay(movie) {
    beginPlayLoading()
    error.value = ''
    try {
      const externalId = movie.externalId ? String(movie.externalId) : String(movie.id)
      let localItem = movie.storagePath ? movie : localItemFor(externalId)
      if (!localItem?.storagePath) {
        localItem = await findLocalItemByExternalId(externalId)
      }

      if (localItem?.storagePath) {
        // Catalog item that lives on disk → play the local file directly.
        const { data } = await api.post(`/catalog-items/${localItem.id}/local`)
        streamUrl.value = data.url
        streamType.value = 'mp4'
        playingLocal.value = true
      } else {
        // Catalog items use their TMDB `externalId`; plain TMDB movies use their own `id`.
        const tmdbId = movie.externalId ? String(movie.externalId) : String(movie.id)
        streamUrl.value = await resolveProviderStream(tmdbId)
        streamType.value = 'hls'
        playingLocal.value = false
      }
      const tmdbId = Number(localItem?.externalId ?? movie.externalId ?? movie.id)
      currentMovie.value = localItem
        ? {
            ...movie,
            id: Number.isFinite(tmdbId) && tmdbId > 0 ? tmdbId : movie.id,
            title: localItem.title ?? movie.title,
            year: localItem.year ?? movie.year,
            overview: localItem.overview ?? movie.overview,
          }
        : movie
      subtitleQuery.value = currentMovie.value.title
      playerOpen.value = true
      if (player) loadCurrentSource()
      loadSubtitles()
    } catch (e) {
      error.value = e.response?.data?.detail ?? e.response?.data?.error ?? e.message
    } finally {
      endPlayLoading()
    }
  }

  async function onPlayEpisode(show, season, episode, ep) {
    beginPlayLoading()
    error.value = ''
    try {
      // TV episodes resolve through the stream provider — there's no per-episode
      // local catalog match, so no local-file path to try first.
      streamUrl.value = await resolveProviderStream(show.id, { season, episode })
      streamType.value = 'hls'
      playingLocal.value = false
      currentMovie.value = {
        id: show.id,
        isEpisode: true,
        season,
        episode,
        title: `${show.title} – S${season}E${episode}${ep?.title ? ` · ${ep.title}` : ''}`,
        overview: ep?.overview ?? show.overview ?? '',
        year: ep?.airDate ? String(ep.airDate).slice(0, 4) : (show.year ?? null),
      }
      playerOpen.value = true
      if (player) loadCurrentSource()
      loadSubtitles()
    } catch (e) {
      error.value = e.response?.data?.detail ?? e.response?.data?.error ?? e.message
    } finally {
      endPlayLoading()
    }
  }

  async function initPlayer() {
    await nextTick()
    player = videojs(videoEl.value, {
      controls: true,
      fill: true,
      playbackRates: [0.5, 1, 1.25, 1.5, 2],
      html5: { vhs: { overrideNative: true } },
    })
    player.on('ended', () => {
      if (currentMovie.value?.isEpisode) tvNextHandler.value?.()
    })
    window.removeEventListener('keydown', onPlayerKeydown)
    window.addEventListener('keydown', onPlayerKeydown)
    // Autoplay: the click that opened the player counts as a user gesture, so try
    // with sound first and fall back to muted if the browser blocks it.
    player.ready(() => {
      loadCurrentSource()
      if (isTouchDevice) player.requestFullscreen?.()
    })
  }

  // Seconds skipped per ArrowLeft / ArrowRight press.
  const SEEK_STEP = 10

  function clearAppliedSubtitleTracks() {
    if (!player) return
    const tracks = player.remoteTextTracks()
    for (let i = tracks.length - 1; i >= 0; i--) player.removeRemoteTextTrack(tracks[i])
    if (subtitleObjectUrl) URL.revokeObjectURL(subtitleObjectUrl)
    subtitleObjectUrl = null
  }

  function attemptPlay() {
    const attempt = player.play()
    if (attempt?.catch) {
      attempt.catch(() => {
        player.muted(true)
        player.play()?.catch?.(() => { /* give up; user can press play */ })
      })
    }
  }

  // Load whatever streamUrl/streamType currently hold into the live player. Called
  // both on first open (from initPlayer's ready) and when a next episode takes over
  // an already-open player (autoplay — @show never re-fires in that case).
  function loadCurrentSource() {
    if (!player) return
    clearAppliedSubtitleTracks()
    player.src({ src: streamUrl.value, type: streamType.value === 'mp4' ? 'video/mp4' : 'application/vnd.apple.mpegurl' })
    attemptPlay()
  }

  // ← / → seek and Space toggles play/pause whenever the player is open. Keys are
  // ignored while the focus sits in an editable, a button, a slider, or another
  // interactive role, so subtitle search and the player's own controls keep working.
  function onPlayerKeydown(event) {
    if (!player || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
    const target = event.target
    if (target?.isContentEditable) return
    const tag = target?.tagName?.toUpperCase()
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A') return
    const role = target?.getAttribute?.('role')
    if (role && ['button', 'slider', 'switch', 'checkbox', 'radio', 'combobox', 'menuitem', 'menu'].includes(role)) return
    switch (event.key) {
      case ' ':
      case 'Spacebar':
        event.preventDefault()
        if (player.paused()) { player.play()?.catch?.(() => {}) } else { player.pause() }
        break
      case 'ArrowLeft': {
        event.preventDefault()
        player.currentTime(Math.max(0, player.currentTime() - SEEK_STEP))
        break
      }
      case 'ArrowRight': {
        event.preventDefault()
        const nextTime = player.currentTime() + SEEK_STEP
        const duration = player.duration()
        player.currentTime(Number.isFinite(duration) ? Math.min(duration, nextTime) : nextTime)
        break
      }
    }
  }

  function destroyPlayer() {
    window.removeEventListener('keydown', onPlayerKeydown)
    if (playLoadingTimer) { clearTimeout(playLoadingTimer); playLoadingTimer = null }
    playLoading.value = false
    player?.dispose()
    player = null
    subtitlePanelOpen.value = false
    if (subtitleObjectUrl) URL.revokeObjectURL(subtitleObjectUrl)
    subtitleObjectUrl = null
  }

  async function loadSubtitles() {
    if (!currentMovie.value) return
    subtitleTitleSearchActive.value = false
    subsLoading.value = true
    subtitles.value = []
    activeSub.value = null
    subtitleError.value = ''
    try {
      // Episode identifiers are forwarded to whichever provider is currently selected.
      const params = { tmdb: currentMovie.value.id, lang: subLang.value }
      if (currentMovie.value.isEpisode) {
        params.season = currentMovie.value.season
        params.episode = currentMovie.value.episode
      }
      const { data } = await api.get('/subtitles', { params })
      subtitles.value = data
    } catch (e) {
      subtitles.value = []
      subtitleError.value = e.response?.data?.detail ?? e.response?.data?.error ?? e.message
    } finally {
      subsLoading.value = false
    }
  }

  function setTvNextHandler(fn) {
    tvNextHandler.value = fn ?? null
  }

  async function searchSubtitles() {
    const title = subtitleQuery.value.trim()
    if (!title) return
    subtitleTitleSearchActive.value = true
    subsLoading.value = true
    subtitles.value = []
    activeSub.value = null
    subtitleError.value = ''
    try {
      const { data } = await api.get('/subtitles', {
        params: { query: title, lang: subLang.value },
      })
      subtitles.value = data
    } catch (e) {
      subtitles.value = []
      subtitleError.value = e.response?.data?.detail ?? e.response?.data?.error ?? e.message
    } finally {
      subsLoading.value = false
    }
  }

  function refreshSubtitles() {
    return subtitleTitleSearchActive.value ? searchSubtitles() : loadSubtitles()
  }

  function toggleSubtitles() {
    subtitlesVisible.value = !subtitlesVisible.value
    if (!player) return
    const tracks = player.remoteTextTracks()
    for (let i = 0; i < tracks.length; i++) {
      tracks[i].mode = subtitlesVisible.value ? 'showing' : 'disabled'
    }
  }

  function clearSubtitle() {
    activeSub.value = null
    subtitlesVisible.value = true
    if (!player) return
    const tracks = player.remoteTextTracks()
    for (let i = tracks.length - 1; i >= 0; i--) player.removeRemoteTextTrack(tracks[i])
    if (subtitleObjectUrl) URL.revokeObjectURL(subtitleObjectUrl)
    subtitleObjectUrl = null
  }

  async function selectSubtitle(sub) {
    activeSub.value = sub.fileId
    subtitleError.value = ''
    if (!player) return
    const tracks = player.remoteTextTracks()
    for (let i = tracks.length - 1; i >= 0; i--) player.removeRemoteTextTrack(tracks[i])
    if (subtitleObjectUrl) URL.revokeObjectURL(subtitleObjectUrl)
    try {
      const { data } = await api.get('/subtitles/file', {
        params: { id: sub.fileId },
        responseType: 'blob',
      })
      subtitleObjectUrl = URL.createObjectURL(data)
      const track = player.addRemoteTextTrack(
        {
          kind: 'subtitles',
          src: subtitleObjectUrl,
          srclang: sub.language ?? 'en',
          label: sub.release ?? sub.fileName ?? 'subtitle',
          default: true,
        },
        true,
      )
      if (track?.track) track.track.mode = subtitlesVisible.value ? 'showing' : 'disabled'
    } catch (e) {
      activeSub.value = null
      subtitleError.value = e.response?.data?.detail ?? e.response?.data?.error ?? 'Could not fetch this subtitle.'
    }
  }

  function resetSubtitleStyle() {
    subtitleStyle.value = { ...subtitleStyleDefaults }
  }

  // Dynamic cue styling, driven by the persisted subtitleStyle settings.
  const cueStyle = computed(() => `
  .video-js .vjs-text-track-cue > div {
    font-size: ${subtitleStyle.value.size}em !important;
    font-family: ${subtitleStyle.value.fontFamily} !important;
    color: ${subtitleStyle.value.color} !important;
    background: ${subtitleStyle.value.background} !important;
    font-weight: ${subtitleStyle.value.fontWeight} !important;
  }
  .video-js .vjs-text-track-display {
    transform: translateY(-${subtitleStyle.value.position}px) !important;
  }
`)

  onBeforeUnmount(destroyPlayer)

  return {
    playLoading,
    playerOpen,
    currentMovie,
    streamUrl,
    streamType,
    playingLocal,
    videoEl,
    subtitles,
    subsLoading,
    subtitlePanelOpen,
    subtitleQuery,
    subLang,
    activeSub,
    subtitleError,
    subtitlesVisible,
    subtitlePanelTab,
    subtitleStyle,
    cueStyle,
    onPlay,
    onPlayEpisode,
    resolveProviderStream,
    setTvNextHandler,
    initPlayer,
    destroyPlayer,
    loadSubtitles,
    searchSubtitles,
    refreshSubtitles,
    toggleSubtitles,
    clearSubtitle,
    selectSubtitle,
    resetSubtitleStyle,
    beginPlayLoading,
    endPlayLoading,
  }
}
