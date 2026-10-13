import { computed, nextTick, ref, watch } from 'vue'
import videojs from 'video.js'
import { Notify } from 'quasar'
import '@videojs/http-streaming'
import 'video.js/dist/video-js.css'
import { api, apiOrigin } from './useApi'
import { useMovies } from './useMovies'
import { useSources } from './useSources'
import { useCatalogItems } from './useCatalogItems'
import { formatPluginError } from './pluginErrors'
import { usePlaylist } from './usePlaylist'
import { useUserSettings } from './useUserSettings'

// Player + subtitles share the single video.js player instance, so they live in
// one composable. State is module-level so the player dialog and any triggers stay in sync.

const playLoading = ref(false)
const playerOpen = ref(false)
const playerMinimized = ref(false)
const currentMovie = ref(null)
const playbackError = ref('')
const streamUrl = ref('')
const streamType = ref('application/vnd.apple.mpegurl')
const playingLocal = ref(false)
const videoEl = ref(null)
const playerPaused = ref(true)
const playbackCurrentTime = ref(0)
const playbackDuration = ref(0)
const playbackVolume = ref(1)
const playbackMuted = ref(false)
const playbackRate = ref(1)
let player = null
let volumeAudioContext = null
let volumeSourceNode = null
let volumeGainNode = null
let volumeGainElement = null
let proxyUpgradePending = false
let retryCurrentPlayback = null
let playbackGeneration = 0

// Set by the TV detail sheet while an episode plays: called when the video ends so
// the next episode (if any) can start automatically when autoplay is enabled.
const tvNextHandler = ref(null)
const tvNextShowId = ref(null)

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
  const { loaded: sourcesLoaded, fetchSources, defaultSourceKey, defaultTvSourceKey } = useSources()
  const { localItemFor, findLocalItemByExternalId, findLocalItemById } = useCatalogItems()
  const { autoplay } = useUserSettings()
  const playlist = usePlaylist()

  // Resolve a title to a proxied media URL through the selected stream provider.
  // Which provider that is depends entirely on the source key supplied by the caller
  // or the first loaded source — the UI does not hard-code provider implementations.
  async function resolveProviderStream(externalId, { season = null, episode = null, sourceKey: requestedSourceKey = null } = {}) {
    if (!sourcesLoaded.value) await fetchSources()
    const sourceKey = requestedSourceKey ?? defaultSourceKey.value
    if (!sourceKey) {
      throw new Error('No stream provider is installed, so there is nothing to play from.')
    }
    const params = {}
    if (season != null) { params.season = season; params.episode = episode }
    if (playbackVolume.value > 1 || volumeGainNode) params.forceProxy = true
    let data
    try {
      ({ data } = await api.get(
        `/sources/${encodeURIComponent(sourceKey)}/resolve/${encodeURIComponent(externalId)}`,
        { params }))
    } catch (requestError) {
      if (requestError.response?.status === 404) {
        const error = new Error('Stream not found.')
        error.code = 'STREAM_NOT_FOUND'
        throw error
      }
      throw requestError
    }
    // The stream must come from the API origin; the UI host would otherwise
    // serve the SPA's index.html for this path and the player can't parse it.
    return {
      url: data.directPlayback
        ? data.streamUrl
        : new URL(`/stream/${data.streamId}/root`, apiOrigin()).toString(),
      contentType: data.contentType ?? 'application/vnd.apple.mpegurl',
      directPlayback: data.directPlayback === true,
    }
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

  async function onPlay(movie, { preserveQueue = false } = {}) {
    const generation = ++playbackGeneration
    beginPlayLoading()
    error.value = ''
    playbackError.value = ''
    retryCurrentPlayback = () => onPlay(movie, { preserveQueue: true })
    try {
      const externalId = movie.externalId ? String(movie.externalId) : String(movie.id)
      let localItem = movie.storagePath ? movie : movie.localItem?.storagePath ? movie.localItem : localItemFor(externalId)
      let directPlayback = false
      if (!localItem?.storagePath && movie.catalogItemId != null) {
        localItem = await findLocalItemById(movie.catalogItemId)
        if (generation !== playbackGeneration) return
      }
      if (!localItem?.storagePath) {
        localItem = await findLocalItemByExternalId(externalId)
        if (generation !== playbackGeneration) return
      }
      if (movie.localOnly && !localItem?.storagePath)
        throw new Error('This catalog item has no available local media file.')
      if (!preserveQueue) {
        playlist.replaceQueueWithItem({
          ...movie,
          externalId,
          id: localItem?.id ?? movie.id,
          catalogItemId: localItem?.id ?? movie.catalogItemId ?? null,
          kind: movie.kind ?? 'movie',
          sourceKey: movie.sourceKey ?? null,
          localItem,
        })
        playerMinimized.value = String(movie.kind ?? 'movie').toLowerCase() === 'music'
      }

      if (localItem?.storagePath) {
        // Catalog item that lives on disk → play the local file directly.
        const { data } = await api.post(`/catalog-items/${localItem.id}/local`)
        if (generation !== playbackGeneration) return
        streamUrl.value = data.url
        streamType.value = data.mime ?? 'application/octet-stream'
        playingLocal.value = true
      } else {
        // Catalog items use their TMDB `externalId`; plain TMDB movies use their own `id`.
        const tmdbId = movie.externalId ? String(movie.externalId) : String(movie.id)
        const resolved = await resolveProviderStream(tmdbId, { sourceKey: movie.sourceKey ?? null })
        if (generation !== playbackGeneration) return
        streamUrl.value = resolved.url
        streamType.value = resolved.contentType
        directPlayback = resolved.directPlayback
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
            posterUrl: localItem.imageUrl ?? movie.posterUrl ?? movie.artworkUrl ?? null,
            artworkUrl: localItem.imageUrl ?? movie.artworkUrl ?? movie.posterUrl ?? null,
            artist: localItem.musicArtistCredits
              ?.filter(credit => credit.role === 'artist')
              .map(credit => credit.name)
              .join(', ') || movie.artist,
            album: localItem.parentTitle ?? movie.album,
          }
        : { ...movie, directPlayback }
      subtitleQuery.value = currentMovie.value.title
      playerOpen.value = true
      if (player) { await nextTick(); await applyPlaybackVolume(); loadCurrentSource() }
      if (String(currentMovie.value.kind ?? '').toLowerCase() === 'music') {
        subtitles.value = []
        activeSub.value = null
        subtitlePanelOpen.value = false
      } else {
        loadSubtitles()
      }
    } catch (e) {
      if (generation !== playbackGeneration) return
      const message = formatPluginError(e)
      error.value = message
      Notify.create({ type: 'negative', icon: 'error', message })
    } finally {
      if (generation === playbackGeneration) endPlayLoading()
    }
  }

  async function onPlayEpisode(show, season, episode, ep, { preserveQueue = false } = {}) {
    const generation = ++playbackGeneration
    beginPlayLoading()
    error.value = ''
    playbackError.value = ''
    retryCurrentPlayback = () => onPlayEpisode(show, season, episode, ep, { preserveQueue: true })
    try {
      if (!sourcesLoaded.value) await fetchSources()
      if (generation !== playbackGeneration) return
      const sourceKey = show?.sourceKey ?? defaultTvSourceKey.value
      if (!preserveQueue) {
        playlist.replaceQueueWithItem({
          kind: 'tv',
          externalId: String(show.id),
          title: `${show.title} – S${season}E${episode}${ep?.title ? ` · ${ep.title}` : ''}`,
          overview: ep?.overview ?? show.overview ?? '',
          artworkUrl: ep?.stillUrl ?? show.posterUrl ?? null,
          sourceKey,
          isEpisode: true,
          show: { ...show, sourceKey },
          season,
          episode,
          episodeInfo: ep,
        })
        playerMinimized.value = false
      }
      // TV episodes resolve through the stream provider — there's no per-episode
      // local catalog match, so no local-file path to try first.
      const resolved = await resolveProviderStream(show.id, {
        season,
        episode,
        sourceKey,
      })
      if (generation !== playbackGeneration) return
      streamUrl.value = resolved.url
      streamType.value = resolved.contentType
      playingLocal.value = false
      currentMovie.value = {
        id: show.id,
        kind: 'tv',
        isEpisode: true,
        directPlayback: resolved.directPlayback,
        show,
        sourceKey,
        season,
        episode,
        title: `${show.title} – S${season}E${episode}${ep?.title ? ` · ${ep.title}` : ''}`,
        overview: ep?.overview ?? show.overview ?? '',
        year: ep?.airDate ? String(ep.airDate).slice(0, 4) : (show.year ?? null),
      }
      playerOpen.value = true
      if (player) { await nextTick(); await applyPlaybackVolume(); loadCurrentSource() }
      loadSubtitles()
    } catch (e) {
      if (generation !== playbackGeneration) return
      const message = formatPluginError(e)
      error.value = message
      Notify.create({ type: 'negative', icon: 'error', message })
    } finally {
      if (generation === playbackGeneration) endPlayLoading()
    }
  }

  async function onPlaySourceItem(item, sourceKey, { preserveQueue = false } = {}) {
    const generation = ++playbackGeneration
    beginPlayLoading()
    error.value = ''
    playbackError.value = ''
    retryCurrentPlayback = () => onPlaySourceItem(item, sourceKey, { preserveQueue: true })
    try {
      const externalId = String(item.externalId ?? item.id ?? '')
      if (!externalId) throw new Error('This source item has no provider ID.')
      let localItem = item.storagePath
        ? item
        : item.localItem?.storagePath
          ? item.localItem
          : localItemFor(externalId)
      if (!localItem?.storagePath && item.catalogItemId != null)
        localItem = await findLocalItemById(item.catalogItemId)
      if (generation !== playbackGeneration) return
      if (!localItem?.storagePath)
      {
        try {
          localItem = await findLocalItemByExternalId(externalId)
        } catch {
          // A failed local lookup should not prevent a source-backed result from streaming.
        }
      }
      if (generation !== playbackGeneration) return
      if (item.localOnly && !localItem?.storagePath)
        throw new Error('This catalog item has no available local media file.')

      if (!preserveQueue) {
        playlist.replaceQueueWithItem({
          ...item,
          externalId,
          id: localItem?.id ?? item.id ?? externalId,
          catalogItemId: localItem?.id ?? item.catalogItemId ?? null,
          localItem,
          sourceKey,
          kind: item.kind ?? 'music',
        })
        playerMinimized.value = String(item.kind ?? 'music').toLowerCase() === 'music'
      }

      let directPlayback = false
      if (localItem?.storagePath) {
        const { data } = await api.post(`/catalog-items/${localItem.id}/local`)
        if (generation !== playbackGeneration) return
        streamUrl.value = data.url
        streamType.value = data.mime ?? 'application/octet-stream'
        playingLocal.value = true
        directPlayback = true
      } else {
        const resolved = await resolveProviderStream(externalId, { sourceKey })
        if (generation !== playbackGeneration) return
        streamUrl.value = resolved.url
        streamType.value = resolved.contentType
        playingLocal.value = false
        directPlayback = resolved.directPlayback
      }
      currentMovie.value = {
        ...item,
        id: localItem?.id ?? externalId,
        catalogItemId: localItem?.id ?? item.catalogItemId ?? null,
        externalId,
        kind: item.kind,
        directPlayback,
        title: localItem?.title ?? item.title ?? externalId,
        year: localItem?.year ?? item.year,
        overview: localItem?.overview ?? item.overview,
        posterUrl: localItem?.imageUrl ?? item.posterUrl ?? item.artworkUrl ?? null,
        artworkUrl: localItem?.imageUrl ?? item.artworkUrl ?? null,
        artist: localItem?.musicArtistCredits
          ?.filter(credit => credit.role === 'artist')
          .map(credit => credit.name)
          .join(', ') || item.artist,
        album: localItem?.parentTitle ?? item.album,
      }
      subtitleQuery.value = currentMovie.value.title
      if (String(item.kind ?? '').toLowerCase() === 'music') {
        subtitles.value = []
        activeSub.value = null
        subtitlePanelOpen.value = false
      }
      playerOpen.value = true
      if (player) { await nextTick(); await applyPlaybackVolume(); loadCurrentSource() }
      if (String(item.kind ?? '').toLowerCase() !== 'music') loadSubtitles()
    } catch (requestError) {
      if (generation !== playbackGeneration) return
      const message = formatPluginError(requestError)
      error.value = message
      Notify.create({ type: 'negative', icon: 'error', message })
    } finally {
      if (generation === playbackGeneration) endPlayLoading()
    }
  }

  async function initPlayer() {
    await nextTick()
    player = videojs(videoEl.value, {
      controls: false,
      fill: true,
      html5: { vhs: { overrideNative: true } },
    })
    player.on('ended', () => {
      if (playlist.hasNext.value) void playQueueItem(playlist.currentIndex.value + 1)
      else if (currentMovie.value?.isEpisode) {
        if (tvNextHandler.value && String(tvNextShowId.value) === String(currentMovie.value.id)) {
          tvNextHandler.value()
        } else {
          void advanceTvEpisodeAutomatically()
        }
      }
    })
    player.on('error', () => {
      if (player?.error())
        playbackError.value = 'Playback could not continue. The stream may have expired or become unavailable.'
    })
    player.on('play', () => { playerPaused.value = false })
    player.on('pause', () => { playerPaused.value = true })
    player.on('volumechange', () => {
      playbackVolume.value = volumeGainNode && volumeGainElement === videoEl.value
        ? volumeGainNode.gain.value
        : player?.volume?.() ?? playbackVolume.value
      playbackMuted.value = player?.muted?.() ?? playbackMuted.value
    })
    player.on('ratechange', () => {
      playbackRate.value = player?.playbackRate?.() ?? playbackRate.value
    })
    player.on('timeupdate', updatePlaybackMetrics)
    player.on('durationchange', updatePlaybackMetrics)
    window.removeEventListener('keydown', onPlayerKeydown)
    window.addEventListener('keydown', onPlayerKeydown)
    // Autoplay: the click that opened the player counts as a user gesture, so try
    // with sound first and fall back to muted if the browser blocks it.
    player.ready(() => {
      player.muted(playbackMuted.value)
      player.playbackRate(playbackRate.value)
      void applyPlaybackVolume().finally(() => {
        if (!player) return
        loadCurrentSource()
        if (isTouchDevice && !streamType.value.startsWith('audio/')) player.requestFullscreen?.()
      })
    })
  }

  async function retryPlayback() {
    if (!retryCurrentPlayback) return
    playbackError.value = ''
    await retryCurrentPlayback()
  }

  function updatePlaybackMetrics() {
    if (!player) return
    const current = player.currentTime()
    const duration = player.duration()
    playbackCurrentTime.value = Number.isFinite(current) ? current : 0
    playbackDuration.value = Number.isFinite(duration) ? duration : 0
  }

  function togglePlayback() {
    if (!player) return
    if (player.paused()) player.play()?.catch?.(() => {})
    else player.pause()
  }

  function seekPlayback(time) {
    if (!player || !Number.isFinite(Number(time))) return
    const duration = player.duration()
    player.currentTime(Number.isFinite(duration) ? Math.max(0, Math.min(duration, Number(time))) : Math.max(0, Number(time)))
  }

  async function ensureVolumeAmplifier() {
    const video = videoEl.value
    if (!player || !video || currentMovie.value?.directPlayback) return false
    if (volumeGainNode && volumeGainElement === video) {
      if (volumeAudioContext?.state === 'suspended') await volumeAudioContext.resume()
      return true
    }

    const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext
    if (!AudioContextConstructor) return false
    let context
    let source
    let gain
    try {
      context = new AudioContextConstructor()
      source = context.createMediaElementSource(video)
      gain = context.createGain()
      source.connect(gain)
      gain.connect(context.destination)
    } catch {
      try { source?.disconnect() } catch { /* source creation failed */ }
      if (context && context.state !== 'closed') void context.close()
      return false
    }

    volumeAudioContext = context
    volumeSourceNode = source
    volumeGainNode = gain
    volumeGainElement = video
    if (context.state === 'suspended') {
      try { await context.resume() } catch { /* a later playback gesture can resume it */ }
    }
    return true
  }

  async function applyPlaybackVolume() {
    if (!player) return false
    const volume = Math.max(0, Math.min(1.2, playbackVolume.value))
    if (volume > 1 && !await ensureVolumeAmplifier()) {
      playbackVolume.value = 1
      player.volume(1)
      Notify.create({ type: 'warning', message: 'Volume boost is unavailable for this stream.' })
      return false
    }

    if (volumeGainNode && volumeGainElement === videoEl.value) {
      player.volume(1)
      volumeGainNode.gain.value = volume
    } else {
      player.volume(Math.min(volume, 1))
    }
    if (volume > 0 && player.muted()) player.muted(false)
    playbackMuted.value = player.muted()
    return true
  }

  function disposeVolumeAmplifier() {
    try { volumeSourceNode?.disconnect() } catch { /* already disconnected */ }
    try { volumeGainNode?.disconnect() } catch { /* already disconnected */ }
    const context = volumeAudioContext
    volumeAudioContext = null
    volumeSourceNode = null
    volumeGainNode = null
    volumeGainElement = null
    if (context && context.state !== 'closed') void context.close()
  }

  function setPlaybackVolume(value) {
    if (!player || !Number.isFinite(Number(value))) return
    const volume = Math.max(0, Math.min(1.2, Number(value)))
    playbackVolume.value = volume
    if (volume > 1 && currentMovie.value?.directPlayback && !volumeGainNode) {
      if (!proxyUpgradePending && retryCurrentPlayback) {
        proxyUpgradePending = true
        void Promise.resolve(retryCurrentPlayback()).finally(() => { proxyUpgradePending = false })
      }
      return
    }
    void applyPlaybackVolume()
  }

  function toggleMute() {
    if (!player) return
    player.muted(!player.muted())
    playbackMuted.value = player.muted()
  }

  function setPlaybackRate(value) {
    if (!player || !Number.isFinite(Number(value))) return
    const rate = Number(value)
    player.playbackRate(rate)
    playbackRate.value = rate
  }

  async function toggleFullscreen() {
    if (!player) return
    try {
      if (player.isFullscreen()) await player.exitFullscreen()
      else await player.requestFullscreen()
    } catch {
      // Some platforms block fullscreen outside a direct user gesture.
    }
  }

  function resizePlayer() {
    player?.trigger('resize')
  }

  function togglePlayerMinimized() {
    playerMinimized.value = !playerMinimized.value
    nextTick(resizePlayer)
  }

  async function restorePlayerAndEnterFullscreen() {
    playerMinimized.value = false
    await nextTick()
    if (!player) return
    player.trigger('resize')
    await toggleFullscreen()
  }

  function stopPlayback() {
    if (playLoadingTimer) { clearTimeout(playLoadingTimer); playLoadingTimer = null }
    playLoading.value = false
    try {
      player?.pause()
      player?.reset()
    } catch {
      // Disposal below still releases the player if the current source is already invalid.
    }
    playerOpen.value = false
    playerMinimized.value = false
    currentMovie.value = null
    error.value = ''
    playbackError.value = ''
    streamUrl.value = ''
    streamType.value = 'application/vnd.apple.mpegurl'
    playingLocal.value = false
    playerPaused.value = true
    playbackCurrentTime.value = 0
    playbackDuration.value = 0
    retryCurrentPlayback = null
    subtitles.value = []
    activeSub.value = null
    subtitlePanelOpen.value = false
    subtitleQuery.value = ''
    subtitleError.value = ''
    subsLoading.value = false
    subtitleTitleSearchActive.value = false
    clearAppliedSubtitleTracks()
    setTvNextHandler(null)
    playlist.clearQueue()
  }

  async function playQueueItem(index) {
    const item = playlist.setCurrentIndex(index)
    if (!item) return
    if (item.isEpisode) {
      const show = item.show ?? { id: item.externalId, title: item.title }
      await onPlayEpisode(show, item.season, item.episode, item.episodeInfo, { preserveQueue: true })
    } else if (item.sourceKey) {
      await onPlaySourceItem(item, item.sourceKey, { preserveQueue: true })
    } else {
      await onPlay(item, { preserveQueue: true })
    }
  }

  async function playNextInQueue() {
    if (playlist.hasNext.value) await playQueueItem(playlist.currentIndex.value + 1)
  }

  async function advanceTvEpisodeAutomatically() {
    const current = currentMovie.value
    const show = current?.show
    if (!autoplay.value || !current?.isEpisode || !show || current.season == null || current.episode == null) return

    try {
      const { data: details } = await api.get(`/tv-shows/${encodeURIComponent(show.id)}/details`)
      const { data: seasonData } = await api.get(
        `/tv-shows/${encodeURIComponent(show.id)}/season/${encodeURIComponent(current.season)}`,
      )
      const episodes = seasonData.episodes ?? []
      const index = episodes.findIndex((episode) => episode.episodeNumber === current.episode)
      let nextSeason = current.season
      let nextEpisode = index >= 0 && index + 1 < episodes.length ? episodes[index + 1] : null

      if (!nextEpisode) {
        const season = [...(details.seasons ?? [])]
          .sort((left, right) => left.seasonNumber - right.seasonNumber)
          .find((entry) => entry.seasonNumber > current.season)
        if (!season) return
        nextSeason = season.seasonNumber
        const { data: nextSeasonData } = await api.get(
          `/tv-shows/${encodeURIComponent(show.id)}/season/${encodeURIComponent(nextSeason)}`,
        )
        nextEpisode = nextSeasonData.episodes?.[0] ?? null
      }

      if (nextEpisode) {
        await onPlayEpisode(
          { ...show, sourceKey: current.sourceKey ?? show.sourceKey ?? null },
          nextSeason,
          nextEpisode.episodeNumber,
          nextEpisode,
        )
      }
    } catch {
      // Keep the finished episode in the player if metadata lookup fails.
    }
  }

  async function playPreviousInQueue() {
    if (player && playbackCurrentTime.value > 3) {
      seekPlayback(0)
      return
    }
    if (playlist.hasPrevious.value) await playQueueItem(playlist.currentIndex.value - 1)
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
    player.src({ src: streamUrl.value, type: streamType.value })
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
    proxyUpgradePending = false
    disposeVolumeAmplifier()
    player?.dispose()
    player = null
    retryCurrentPlayback = null
    playerMinimized.value = false
    playerPaused.value = true
    playbackCurrentTime.value = 0
    playbackDuration.value = 0
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

  function setTvNextHandler(fn, showId = null) {
    tvNextHandler.value = fn ?? null
    tvNextShowId.value = fn ? showId : null
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

  return {
    playLoading,
    playerOpen,
    playerMinimized,
    isTouchDevice,
    currentMovie,
    playbackError,
    playerPaused,
    playbackCurrentTime,
    playbackDuration,
    playbackVolume,
    playbackMuted,
    playbackRate,
    queue: playlist.queue,
    savedPlaylists: playlist.savedPlaylists,
    activePlaylistId: playlist.activePlaylistId,
    currentIndex: playlist.currentIndex,
    hasNext: playlist.hasNext,
    hasPrevious: playlist.hasPrevious,
    currentQueueItem: playlist.currentItem,
    currentPlaylistName: playlist.currentPlaylistName,
    playlistDrawerOpen: playlist.playlistDrawerOpen,
    addToQueue: playlist.addToQueue,
    removeQueueItem: playlist.removeQueueItem,
    clearQueue: playlist.clearQueue,
    createPlaylist: playlist.createPlaylist,
    saveCurrentQueue: playlist.saveCurrentQueue,
    loadSavedPlaylist: playlist.loadSavedPlaylist,
    addToSavedPlaylist: playlist.addToSavedPlaylist,
    removeSavedPlaylist: playlist.removeSavedPlaylist,
    setQueueIndex: playlist.setCurrentIndex,
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
    onPlaySourceItem,
    retryPlayback,
    playQueueItem,
    playNextInQueue,
    playPreviousInQueue,
    togglePlayback,
    seekPlayback,
    setPlaybackVolume,
    toggleMute,
    setPlaybackRate,
    toggleFullscreen,
    togglePlayerMinimized,
    resizePlayer,
    restorePlayerAndEnterFullscreen,
    stopPlayback,
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
