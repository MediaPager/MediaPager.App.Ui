<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Notify } from 'quasar'
import {
  usePlayback,
  languages,
} from '../composables/usePlayback'
import SubtitleStyleControls from './SubtitleStyleControls.vue'

const {
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
  streamUrl,
  streamType,
  queue,
  hasNext,
  hasPrevious,
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
  initPlayer,
  destroyPlayer,
  retryPlayback,
  searchSubtitles,
  refreshSubtitles,
  toggleSubtitles,
  clearSubtitle,
  selectSubtitle,
  togglePlayerMinimized,
  resizePlayer,
  togglePlayback,
  seekPlayback,
  setPlaybackVolume,
  toggleMute,
  setPlaybackRate,
  toggleFullscreen,
  playPreviousInQueue,
  playNextInQueue,
  restorePlayerAndEnterFullscreen,
  stopPlayback,
} = usePlayback()

const isMusic = computed(() => currentMovie.value?.kind === 'music')
const canAirPlayPlayback = computed(() => {
  const video = videoEl.value
  return Boolean(video && typeof video.webkitShowPlaybackTargetPicker === 'function')
})
const canRemotePlayback = computed(() => typeof videoEl.value?.remote?.prompt === 'function')
// Keep the implementation available while receiver/device behavior is validated.
const showCastButton = false
const castSdkReady = ref(false)
const isCasting = ref(false)
const playbackRateOptions = [0.5, 0.75, 1, 1.25, 1.5, 2].map(value => ({ label: `${value}×`, value }))
const miniVolumeOpen = ref(false)
const miniSeekHovered = ref(false)
const miniSeekFocused = ref(false)
const miniSeekActive = computed(() => miniSeekHovered.value || miniSeekFocused.value)
const miniSeekLabelPosition = computed(() => {
  const duration = playbackDuration.value
  const progress = duration > 0 ? playbackCurrentTime.value / duration : 0
  return `${Math.max(5, Math.min(95, progress * 100))}%`
})
const playerStage = ref(null)
const playerContent = ref(null)
const playerControls = ref(null)
const miniVideoTarget = ref(null)
const playerPoppedOut = ref(false)
let playerPopoutWindow = null
const programmaticPlayerPopoutCloses = new WeakSet()
let castSdkLoadPromise = null
let castSdkWindow = null
let castSession = null
let castRemotePlayer = null
let castRemoteController = null
let castStopRequested = false

watch(playerOpen, (open) => {
  if (!open) closePlayerPopout()
}, { flush: 'sync' })

watch(playerOpen, (open) => {
  if (open) {
    void initPlayer().then(() => {
      nextTick(() => movePlayerVideo(playerMinimized.value))
    })
    if (showCastButton && !isTouchDevice && !canAirPlayPlayback.value) {
      void prepareGoogleCastSdk(window).catch(error => {
        console.warn('Google Cast SDK failed to load.', error)
      })
    }
  }
  else {
    destroyPlayer()
    closePlayerPopout()
  }
}, { flush: 'post' })

watch([playerOpen, playerMinimized], ([open, minimized]) => {
  document.body.classList.toggle('player-modal-open', open && !minimized)
}, { flush: 'post' })

watch(playerMinimized, (minimized) => {
  if (playerOpen.value && !playerPoppedOut.value) nextTick(() => movePlayerVideo(minimized))
}, { flush: 'post' })

function movePlayerVideo(minimized) {
  if (isMusic.value || playerPoppedOut.value) return
  const videoPlayer = videoEl.value?.closest('.video-js')
  const target = minimized ? miniVideoTarget.value : playerStage.value
  if (!videoPlayer || !target || videoPlayer.parentElement === target) return
  target.appendChild(videoPlayer)
  nextTick(resizePlayer)
}

function restoreMiniPlayer() {
  if (playerPoppedOut.value) {
    restorePlayerFromPopout()
    return
  }
  if (playerMinimized.value) togglePlayerMinimized()
}

function pauseAndMinimizePlayer() {
  if (!playerPaused.value) togglePlayback()
  if (!playerMinimized.value) togglePlayerMinimized()
}

function showAirPlayPicker() {
  const video = videoEl.value
  if (typeof video?.webkitShowPlaybackTargetPicker === 'function')
    video.webkitShowPlaybackTargetPicker()
}

async function popOutPlayer() {
  if (isTouchDevice || isMusic.value || playerPoppedOut.value) return
  const stage = playerStage.value
  if (!stage) return

  const pictureInPicture = window.documentPictureInPicture
  if (!pictureInPicture?.requestWindow) {
    Notify.create({ type: 'warning', message: 'This browser does not support the player popout window.' })
    return
  }

  let popup
  try {
    popup = await pictureInPicture.requestWindow({
      width: 1000,
      height: 650,
      disallowReturnToOpener: true,
    })
  } catch {
    Notify.create({ type: 'warning', message: 'The player popout window could not be opened.' })
    return
  }

  const popupDocument = popup.document
  popupDocument.title = currentMovie.value?.title ?? 'MediaPager Player'
  popupDocument.body.classList.add('mediapager-player-popout')
  if (document.body.classList.contains('body--dark')) popupDocument.body.classList.add('body--dark')
  for (const stylesheet of document.head.querySelectorAll('link[rel="stylesheet"], style')) {
    if (stylesheet.tagName === 'LINK') {
      const link = popupDocument.createElement('link')
      link.rel = 'stylesheet'
      link.href = stylesheet.href
      popupDocument.head.appendChild(link)
    } else {
      popupDocument.head.appendChild(stylesheet.cloneNode(true))
    }
  }

  const shell = popupDocument.createElement('main')
  shell.className = 'player-popout-shell q-dark'
  const screen = popupDocument.createElement('div')
  screen.className = 'player-popout-screen'
  const controls = popupDocument.createElement('div')
  controls.className = 'player-popout-controls'
  shell.append(screen, controls)
  popupDocument.body.replaceChildren(shell)

  const playerControlsElement = playerControls.value
  playerPopoutWindow = popup
  playerPoppedOut.value = true
  await nextTick()
  playerControlsElement
    ?.querySelector('[data-player-popout-restore]')
    ?.addEventListener('click', restorePlayerFromPopout)
  popup.document.addEventListener('mousemove', forwardPopoutMouseEvent, true)
  popup.document.addEventListener('mouseup', forwardPopoutMouseEvent, true)
  popup.addEventListener('pagehide', () => handlePlayerPopoutClosed(popup), { once: true })
  try {
    screen.appendChild(popupDocument.adoptNode(stage))
    if (playerControlsElement) controls.appendChild(popupDocument.adoptNode(playerControlsElement))
  } catch {
    playerPoppedOut.value = false
    playerPopoutWindow = null
    if (playerContent.value) playerContent.value.appendChild(stage)
    if (playerControlsElement && playerContent.value) playerContent.value.appendChild(playerControlsElement)
    closePlayerPopoutWindow(popup)
    return
  }
  togglePlayerMinimized()
  nextTick(resizePlayer)
  popup.focus()
  if (showCastButton && !canAirPlayPlayback.value) {
    void prepareGoogleCastSdk(popup).catch(error => {
      console.warn('Google Cast SDK failed to load.', error)
      if (playerPopoutWindow === popup && !canRemotePlayback.value)
        Notify.create({ type: 'warning', message: 'Google Cast could not initialize in this browser.' })
    })
  }
}

function restorePlayerFromPopout() {
  if (!playerPoppedOut.value) return
  const popup = playerPopoutWindow
  const stage = playerStage.value
  const controls = playerControls.value
  playerPoppedOut.value = false
  if (stage && playerContent.value)
    playerContent.value.appendChild(document.adoptNode(stage))
  if (controls && playerContent.value)
    playerContent.value.appendChild(document.adoptNode(controls))
  playerPopoutWindow = null
  releasePopoutPointer()
  if (playerMinimized.value) togglePlayerMinimized()
  closePlayerPopoutWindow(popup)
  if (showCastButton && !isTouchDevice && !canAirPlayPlayback.value)
    void prepareGoogleCastSdk(window).catch(error => console.warn('Google Cast SDK failed to load.', error))
  nextTick(resizePlayer)
}

function handlePlayerPopoutClosed(popup) {
  if (programmaticPlayerPopoutCloses.has(popup)) {
    programmaticPlayerPopoutCloses.delete(popup)
    resetCastSdkForWindow(popup)
    return
  }
  if (popup !== playerPopoutWindow) return
  resetCastSdkForWindow(popup)
  stopPlayerPlayback()
}

function resetCastSdkForWindow(popup) {
  if (castSdkWindow !== popup) return
  castSdkWindow = null
  castSdkLoadPromise = null
  castSdkReady.value = false
}

function closePlayerPopoutWindow(popup) {
  resetCastSdkForWindow(popup)
  if (!popup || popup.closed) return
  programmaticPlayerPopoutCloses.add(popup)
  popup.close()
}

function closePlayerPopout() {
  const popup = playerPopoutWindow
  const stage = playerStage.value
  const controls = playerControls.value
  playerPoppedOut.value = false
  playerPopoutWindow = null
  if (stage && playerContent.value)
    playerContent.value.appendChild(document.adoptNode(stage))
  if (controls && playerContent.value)
    playerContent.value.appendChild(document.adoptNode(controls))
  releasePopoutPointer()
  closePlayerPopoutWindow(popup)
}

function prepareGoogleCastSdk(targetWindow) {
  if (targetWindow.cast?.framework && targetWindow.chrome?.cast) {
    configureCastContext(targetWindow)
    castSdkWindow = targetWindow
    castSdkReady.value = true
    return Promise.resolve()
  }
  if (castSdkWindow !== targetWindow) {
    castSdkWindow = targetWindow
    castSdkLoadPromise = null
    castSdkReady.value = false
  }
  if (castSdkWindow === targetWindow && castSdkLoadPromise) return castSdkLoadPromise

  castSdkLoadPromise = new Promise((resolve, reject) => {
    let settled = false
    const timeoutId = targetWindow.setTimeout(() => finish(new Error('Timed out loading Google Cast.')), 20000)
    const finish = error => {
      if (settled) return
      settled = true
      targetWindow.clearTimeout(timeoutId)
      if (error) {
        castSdkLoadPromise = null
        reject(error)
        return
      }
      if (targetWindow.closed || (targetWindow !== window && playerPopoutWindow !== targetWindow)) {
        castSdkLoadPromise = null
        reject(new Error('The player popout closed before Cast initialized.'))
        return
      }
      try {
        configureCastContext(targetWindow)
        castSdkReady.value = true
        resolve()
      } catch (setupError) {
        castSdkLoadPromise = null
        reject(setupError)
      }
    }

    const previousCallback = targetWindow.__onGCastApiAvailable
    targetWindow.__onGCastApiAvailable = available => {
      try { previousCallback?.(available) } catch { /* do not break the Cast SDK callback */ }
      if (!available || !targetWindow.cast?.framework || !targetWindow.chrome?.cast) {
        finish(new Error('Google Cast is not available in this browser.'))
        return
      }
      finish()
    }

    const script = targetWindow.document.createElement('script')
    script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1'
    script.async = true
    script.onerror = () => finish(new Error('Could not download the Google Cast SDK.'))
    targetWindow.document.head.appendChild(script)
  })
  return castSdkLoadPromise
}

function configureCastContext(targetWindow) {
  targetWindow.cast.framework.CastContext.getInstance().setOptions({
    receiverApplicationId: targetWindow.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
    autoJoinPolicy: targetWindow.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
  })
}

async function castPlayback() {
  const video = videoEl.value
  if (!video) return

  if (isCasting.value && castSession) {
    try { await castSession.endSession(true) } catch { /* Cast may already be disconnected */ }
    return
  }

  if (typeof video.webkitShowPlaybackTargetPicker === 'function') {
    video.webkitShowPlaybackTargetPicker()
    return
  }

  if (typeof video.remote?.prompt === 'function') {
    try {
      await video.remote.prompt()
      return
    } catch (error) {
      const castApi = window.chrome?.cast
      if (error?.name === 'AbortError' || error?.code === castApi?.ErrorCode?.CANCEL) return
      // Fall through to Google Cast Sender for receivers that the browser's
      // generic Remote Playback API cannot use with this MSE-backed stream.
    }
  }

  const castWindow = playerPopoutWindow ?? window
  const castApi = castWindow.chrome?.cast
  if (!castSdkReady.value || !castWindow.cast?.framework || !castApi) {
    Notify.create({ type: 'warning', message: 'Google Cast is still initializing. Try again in a moment.' })
    return
  }

  try {
    const session = await castWindow.cast.framework.CastContext.getInstance().requestSession()
    castSession = session
    const contentType = streamType.value.toLowerCase().includes('mpegurl')
      ? 'application/x-mpegURL'
      : streamType.value
    const mediaInfo = new castApi.media.MediaInfo(streamUrl.value, contentType)
    mediaInfo.streamType = castApi.media.StreamType.BUFFERED
    const metadata = new castApi.media.GenericMediaMetadata()
    metadata.title = currentMovie.value?.title ?? 'MediaPager'
    const artwork = currentMovie.value?.posterUrl ?? currentMovie.value?.artworkUrl
    if (artwork) metadata.images = [new castApi.Image(artwork)]
    mediaInfo.metadata = metadata

    const request = new castApi.media.LoadRequest(mediaInfo)
    request.autoplay = true
    request.currentTime = playbackCurrentTime.value

    const remotePlayer = new castWindow.cast.framework.RemotePlayer()
    const remoteController = new castWindow.cast.framework.RemotePlayerController(remotePlayer)
    remoteController.addEventListener(
      castWindow.cast.framework.RemotePlayerEventType.ANY_CHANGE,
      () => syncCastPlayback(remotePlayer),
    )

    await session.loadMedia(request)
    castRemotePlayer = remotePlayer
    castRemoteController = remoteController
    castStopRequested = false
    isCasting.value = true
    video.pause()
    syncCastPlayback(remotePlayer)
  } catch (error) {
    if (error?.name === 'AbortError' || error?.code === castApi?.ErrorCode?.CANCEL) return
    if (castSession && !isCasting.value) {
      try { await castSession.endSession(true) } catch { /* Cast may already be disconnected */ }
      castSession = null
    }
    console.warn('Google Cast playback failed.', error)
    const reason = error?.message ?? error?.description ?? 'No Cast receiver was found.'
    const hint = error?.code === castApi?.ErrorCode?.RECEIVER_UNAVAILABLE
      ? ' Check Chrome local network access and confirm the TV is on the same network.'
      : ''
    Notify.create({ type: 'warning', message: `Could not cast this stream (${reason}).${hint}` })
  }
}

function syncCastPlayback(remotePlayer) {
  if (castStopRequested) {
    if (!remotePlayer.isConnected) castStopRequested = false
    return
  }

  if (remotePlayer.isConnected) {
    isCasting.value = true
    if (Number.isFinite(remotePlayer.currentTime)) playbackCurrentTime.value = remotePlayer.currentTime
    if (Number.isFinite(remotePlayer.duration)) playbackDuration.value = remotePlayer.duration
    if (Number.isFinite(remotePlayer.volumeLevel)) playbackVolume.value = remotePlayer.volumeLevel
    playerPaused.value = Boolean(remotePlayer.isPaused)
    playbackMuted.value = Boolean(remotePlayer.isMuted)
    return
  }

  if (!isCasting.value) return
  isCasting.value = false
  castSession = null
  castRemotePlayer = null
  castRemoteController = null
  if (!castStopRequested && videoEl.value) {
    videoEl.value.currentTime = playbackCurrentTime.value
    void videoEl.value.play().catch(() => {})
  }
}

function togglePlayerPlayback() {
  if (isCasting.value && castRemoteController) {
    castRemoteController.playOrPause()
    return
  }
  togglePlayback()
}

function seekPlayerPlayback(time) {
  if (isCasting.value && castRemotePlayer && castRemoteController) {
    castRemotePlayer.currentTime = Number(time)
    castRemoteController.seek()
    playbackCurrentTime.value = Number(time)
    return
  }
  seekPlayback(time)
}

function setPlayerVolume(value) {
  if (isCasting.value && castRemotePlayer && castRemoteController) {
    castRemotePlayer.volumeLevel = Math.min(1, Math.max(0, Number(value)))
    castRemoteController.setVolumeLevel()
    playbackVolume.value = castRemotePlayer.volumeLevel
    return
  }
  setPlaybackVolume(value)
}

function togglePlayerMute() {
  if (isCasting.value && castRemotePlayer && castRemoteController) {
    castRemotePlayer.isMuted = !castRemotePlayer.isMuted
    castRemoteController.muteOrUnmute()
    playbackMuted.value = castRemotePlayer.isMuted
    return
  }
  toggleMute()
}

function setPlayerPlaybackRate(value) {
  if (!isCasting.value) setPlaybackRate(value)
}

function stopPlayerPlayback() {
  if (castSession) {
    castStopRequested = true
    const session = castSession
    castSession = null
    try { void session.endSession(true) } catch { /* Cast may already be disconnected */ }
  }
  isCasting.value = false
  castRemotePlayer = null
  castRemoteController = null
  stopPlayback()
}

function forwardPopoutMouseEvent(event) {
  document.dispatchEvent(new MouseEvent(event.type, {
    bubbles: true,
    cancelable: event.cancelable,
    view: window,
    detail: event.detail,
    screenX: event.screenX,
    screenY: event.screenY,
    clientX: event.clientX,
    clientY: event.clientY,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
    button: event.button,
    buttons: event.buttons,
  }))
}

function releasePopoutPointer() {
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, buttons: 0, view: window }))
}

function minimizePlayerOnEscape(event) {
  if (event.key !== 'Escape' || !playerOpen.value || playerMinimized.value) return
  event.preventDefault()
  event.stopPropagation()
  togglePlayerMinimized()
}

onMounted(() => document.addEventListener('keydown', minimizePlayerOnEscape))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', minimizePlayerOnEscape)
  document.body.classList.remove('player-modal-open')
  closePlayerPopout()
})

function formatTime(seconds) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  const minutes = Math.floor(safeSeconds / 60)
  const remaining = String(safeSeconds % 60).padStart(2, '0')
  return `${minutes}:${remaining}`
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="playerOpen"
      class="player-shell"
      :class="{
        'player-shell--mini': playerMinimized,
        'player-shell--music': isMusic,
      }"
    >
      <div v-if="!playerMinimized" class="player-backdrop" />
      <q-card dark class="player-card column">
        <q-bar v-if="!playerMinimized" class="player-bar">
          <div class="player-title ellipsis text-weight-bold">
            {{ currentMovie?.title }}<span v-if="currentMovie?.year && !isMusic"> ({{ currentMovie.year }})</span>
          </div>
          <q-space />
          <q-btn
            v-if="canAirPlayPlayback && !showCastButton && !isCasting"
            dense
            flat
            round
            icon="airplay"
            aria-label="AirPlay"
            title="AirPlay"
            @click="showAirPlayPicker"
          />
          <q-btn
            v-if="showCastButton && !isTouchDevice && !isMusic && (castSdkReady || canAirPlayPlayback || canRemotePlayback)"
            dense
            flat
            round
            :icon="isCasting ? 'cast_connected' : (canAirPlayPlayback ? 'airplay' : 'cast')"
            :aria-label="isCasting ? 'Disconnect from TV' : 'Cast, AirPlay, or Miracast'"
            :title="isCasting ? 'Disconnect from TV' : 'Cast, AirPlay, or Miracast'"
            @click="castPlayback"
          />
          <q-btn
            v-if="!isTouchDevice && !isMusic"
            dense
            flat
            round
            icon="open_in_new"
            aria-label="Pop out player"
            title="Pop out player"
            :disable="!videoEl || !playerControls"
            @click="popOutPlayer"
          />
          <q-btn
            dense
            flat
            round
            :icon="isTouchDevice ? 'close' : 'minimize'"
            :aria-label="isTouchDevice ? 'Pause and minimize player' : 'Minimize player'"
            :title="isTouchDevice ? 'Pause and minimize player' : 'Minimize player'"
            @click="isTouchDevice ? pauseAndMinimizePlayer() : togglePlayerMinimized()"
          />
        </q-bar>

        <div ref="playerContent" class="player-content col" :class="{ 'player-content--hidden': playerMinimized }">
          <div ref="playerStage" class="player-stage">
            <video
              ref="videoEl"
              class="video-js vjs-big-play-centered"
              :poster="currentMovie?.posterUrl ?? currentMovie?.artworkUrl ?? undefined"
              :crossorigin="currentMovie?.directPlayback ? undefined : 'anonymous'"
            ></video>

            <div v-if="isMusic" class="music-artwork-panel">
              <q-img
                :src="currentMovie?.artworkUrl ?? currentMovie?.posterUrl ?? undefined"
                fit="contain"
                class="music-artwork"
              >
                <template #error>
                  <div class="music-artwork-fallback flex flex-center column">
                    <q-icon name="music_note" size="4rem" />
                    <div class="q-mt-md text-subtitle1">{{ currentMovie?.title }}</div>
                  </div>
                </template>
              </q-img>
              <div class="music-artwork-title ellipsis">{{ currentMovie?.title }}</div>
              <div class="music-artwork-subtitle ellipsis text-grey-5">
                {{ currentMovie?.artist ?? currentMovie?.album ?? currentMovie?.metadata?.[0]?.value ?? 'Music' }}
              </div>
            </div>

            <q-banner v-if="playbackError" dense rounded class="playback-error">
              <template #avatar><q-icon name="error" color="negative" /></template>
              {{ playbackError }}
              <template #action>
                <q-btn flat dense label="Retry" color="primary" @click="retryPlayback" />
              </template>
            </q-banner>

            <q-btn
              v-if="!isMusic && !playerMinimized"
              round
              dense
              flat
              icon="closed_caption"
              color="white"
              class="subtitle-toggle"
              :aria-expanded="subtitlePanelOpen"
              aria-label="Subtitle settings"
              title="Subtitle settings"
              @click="subtitlePanelOpen = !subtitlePanelOpen"
            />

            <div v-if="subtitlePanelOpen && !isMusic && !playerMinimized" class="subtitle-panel column q-pa-md">
              <q-tabs
                v-model="subtitlePanelTab"
                dense
                dark
                class="sub-tabs q-mb-sm"
                active-color="primary"
                indicator-color="primary"
              >
                <q-tab name="list" label="Subtitles" />
                <q-tab name="style" label="Style" />
              </q-tabs>

              <q-tab-panels v-model="subtitlePanelTab" animated class="col sub-tab-panels">
                <q-tab-panel name="list" class="column q-pa-none">
                  <q-select
                    v-model="subLang"
                    :options="languages"
                    dark
                    dense
                    outlined
                    emit-value
                    map-options
                    label="language"
                    class="q-mb-sm"
                    @update:model-value="refreshSubtitles"
                  />

                  <q-input
                    v-model="subtitleQuery"
                    dark
                    dense
                    outlined
                    label="search subtitles by title"
                    class="q-mb-sm"
                    @keyup.enter="searchSubtitles"
                  >
                    <template #append>
                      <q-btn flat round dense icon="search" color="primary" aria-label="Search subtitles by title" @click="searchSubtitles" />
                    </template>
                  </q-input>

                  <q-scroll-area class="col sub-list">
                    <q-list dark dense>
                      <q-item
                        v-for="sub in subtitles"
                        :key="sub.fileId"
                        clickable
                        :active="activeSub === sub.fileId"
                        active-class="sub-active"
                        @click="selectSubtitle(sub)"
                      >
                        <q-item-section>
                          <q-item-label class="sub-release">{{ sub.release ?? sub.fileName }}</q-item-label>
                          <q-item-label caption class="text-grey-6">
                            {{ sub.popularity }} matches · {{ sub.language }}
                            <span v-if="sub.hearingImpaired"> · SDH</span>
                          </q-item-label>
                        </q-item-section>
                      </q-item>
                      <div v-if="subsLoading" class="flex flex-center q-pa-md"><q-spinner-dots color="primary" size="2rem" /></div>
                      <div v-if="!subsLoading && subtitles.length === 0" class="text-grey-6 q-pa-sm">no subtitles found</div>
                    </q-list>
                  </q-scroll-area>

                  <q-banner v-if="subtitleError" dense class="error-banner q-mt-sm" rounded>{{ subtitleError }}</q-banner>

                  <div class="row items-center q-mt-sm q-gutter-sm">
                    <q-toggle v-model="subtitlesVisible" dark color="primary" label="subtitles" :disable="!activeSub" @update:model-value="toggleSubtitles" />
                    <q-btn flat dense color="grey-5" label="clear" :disable="!activeSub" @click="clearSubtitle" />
                  </div>
                </q-tab-panel>

                <q-tab-panel name="style" class="column q-pa-none">
                  <q-scroll-area class="col"><SubtitleStyleControls class="subtitle-style-container" /></q-scroll-area>
                </q-tab-panel>
              </q-tab-panels>
            </div>
          </div>

          <div v-if="!playerMinimized || playerPoppedOut" ref="playerControls" class="player-controls">
            <div class="player-seek-row">
              <span class="player-control-time">{{ formatTime(playbackCurrentTime) }}</span>
              <q-slider
                class="player-seek"
                :model-value="playbackCurrentTime"
                :min="0"
                :max="Math.max(playbackDuration, 1)"
                color="primary"
                aria-label="Seek playback"
                @update:model-value="seekPlayerPlayback"
              />
              <span class="player-control-time">{{ formatTime(playbackDuration) }}</span>
            </div>
            <div class="player-actions-row">
              <div class="player-volume-controls">
                <q-btn flat round dense :icon="playbackMuted || playbackVolume === 0 ? 'volume_off' : 'volume_up'" :aria-label="playbackMuted ? 'Unmute' : 'Mute'" :title="playbackMuted ? 'Unmute' : 'Mute'" @click="togglePlayerMute" />
                <q-slider class="player-volume-slider" :model-value="playbackVolume" :min="0" :max="1.2" :step="0.01" color="primary" aria-label="Volume" @update:model-value="setPlayerVolume" />
              </div>
              <div class="player-transport">
                <q-btn flat round dense icon="skip_previous" aria-label="Previous item" title="Previous item" :disable="!hasPrevious || isCasting" @click="playPreviousInQueue" />
                <q-btn unelevated round color="primary" text-color="dark" :icon="playerPaused ? 'play_arrow' : 'pause'" :aria-label="playerPaused ? 'Play' : 'Pause'" @click="togglePlayerPlayback" />
                <q-btn flat round dense icon="skip_next" aria-label="Next item" title="Next item" :disable="!hasNext || isCasting" @click="playNextInQueue" />
                <q-btn flat round dense color="negative" icon="stop" aria-label="Stop playback" title="Stop playback" @click="stopPlayerPlayback" />
              </div>
              <div class="player-end-controls">
              <select
                class="player-rate-select"
                :value="playbackRate"
                aria-label="Playback speed"
                title="Playback speed"
                :disabled="isCasting"
                @change="setPlayerPlaybackRate($event.target.value)"
              >
                <option v-for="option in playbackRateOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
                <q-btn
                  v-if="playerPoppedOut"
                  flat
                  round
                  dense
                  icon="picture_in_picture"
                  aria-label="Return player to app"
                  title="Return player to app"
                  data-player-popout-restore
                  @click="restorePlayerFromPopout"
                />
                <q-btn
                  v-if="showCastButton && (isCasting || (playerPoppedOut && (castSdkReady || canAirPlayPlayback || canRemotePlayback)))"
                  flat
                  round
                  dense
                  :icon="isCasting ? 'cast_connected' : 'cast'"
                  :aria-label="isCasting ? 'Disconnect from TV' : 'Cast, AirPlay, or Miracast'"
                  :title="isCasting ? 'Disconnect from TV' : 'Cast, AirPlay, or Miracast'"
                  @click="castPlayback"
                />
                <q-btn v-if="!isMusic" flat round dense icon="fullscreen" aria-label="Enter fullscreen" title="Enter fullscreen" @click="toggleFullscreen" />
              </div>
            </div>
          </div>

        </div>

      </q-card>
    </div>

    <div
      v-if="playerOpen"
      class="player-mini-dock"
      :class="{ 'player-mini-dock--under-modal': !playerMinimized }"
    >
      <div class="player-mini-bar">
        <div class="player-mini-progress row items-center no-wrap">
          <div
            class="player-mini-seek-wrap"
            @pointerenter="miniSeekHovered = true"
            @pointerleave="miniSeekHovered = false"
            @focusin="miniSeekFocused = true"
            @focusout="miniSeekFocused = false"
          >
            <div v-if="miniSeekActive" class="player-mini-seek-label" :style="{ left: miniSeekLabelPosition }">
              {{ formatTime(playbackCurrentTime) }} / {{ formatTime(playbackDuration) }}
            </div>
            <q-slider
              class="player-mini-seek"
              :class="{ 'player-mini-seek--playing': !playerPaused }"
              :model-value="playbackCurrentTime"
              :min="0"
              :max="Math.max(playbackDuration, 1)"
              color="primary"
              aria-label="Seek playback"
              @update:model-value="seekPlayerPlayback"
            />
          </div>
        </div>
        <div class="player-mini-main">
          <div class="player-mini-media">
            <q-img
              v-if="isMusic || !playerMinimized"
              :src="currentMovie?.artworkUrl ?? currentMovie?.posterUrl ?? undefined"
              fit="cover"
              class="player-mini-art"
            >
              <template #error><div class="absolute-full flex flex-center bg-grey-10"><q-icon :name="isMusic ? 'music_note' : 'movie'" color="grey-6" /></div></template>
            </q-img>
            <div v-else class="player-mini-video" :class="{ 'player-mini-video--popped-out': playerPoppedOut }">
              <div ref="miniVideoTarget" class="player-mini-video-screen" />
              <button
                class="player-mini-video-restore"
                type="button"
                :aria-label="playerPoppedOut ? 'Return player to MediaPager' : 'Restore player'"
                :title="playerPoppedOut ? 'Return player to MediaPager' : 'Restore player'"
                @click="restoreMiniPlayer"
              >
                <q-icon :name="playerPoppedOut ? 'open_in_new' : 'open_in_full'" />
                <span v-if="playerPoppedOut">Return to app</span>
              </button>
            </div>
            <div class="player-mini-info">
              <div class="player-mini-title ellipsis">{{ currentMovie?.title }}</div>
              <div class="player-mini-subtitle ellipsis">{{ currentMovie?.artist ?? currentMovie?.album ?? currentMovie?.year ?? '' }}</div>
            </div>
          </div>
          <div class="player-mini-transport">
            <q-btn flat round dense icon="skip_previous" aria-label="Previous item" title="Previous item" :disable="!hasPrevious || isCasting" @click="playPreviousInQueue" />
            <q-btn unelevated round color="primary" text-color="dark" :icon="playerPaused ? 'play_arrow' : 'pause'" :aria-label="playerPaused ? 'Play' : 'Pause'" @click="togglePlayerPlayback" />
            <q-btn flat round dense icon="skip_next" aria-label="Next item" title="Next item" :disable="!hasNext || isCasting" @click="playNextInQueue" />
            <q-btn flat round dense color="negative" icon="stop" aria-label="Stop playback" title="Stop playback" @click="stopPlayerPlayback" />
          </div>
          <div class="player-mini-end-controls">
            <div class="player-mini-volume-control" @keydown.esc="miniVolumeOpen = false">
              <div v-if="miniVolumeOpen" class="player-mini-volume-popover column items-center q-pa-sm">
                <div class="player-mini-volume-value">{{ Math.round(playbackVolume * 100) }}%</div>
                <q-slider
                  class="player-mini-volume-slider"
                  :model-value="playbackVolume"
                  :min="0"
                  :max="1.2"
                  :step="0.01"
                  vertical
                  reverse
                  color="primary"
                  aria-label="Volume"
                  @update:model-value="setPlayerVolume"
                />
                <q-btn flat round dense :icon="playbackMuted ? 'volume_off' : 'volume_up'" :aria-label="playbackMuted ? 'Unmute' : 'Mute'" :title="playbackMuted ? 'Unmute' : 'Mute'" @click="togglePlayerMute" />
              </div>
              <q-btn
                flat
                round
                dense
                :icon="playbackMuted || playbackVolume === 0 ? 'volume_off' : 'volume_up'"
                aria-label="Adjust volume"
                title="Adjust volume"
                :aria-expanded="miniVolumeOpen"
                @click="miniVolumeOpen = !miniVolumeOpen"
              />
            </div>
            <select
              class="player-rate-select player-mini-rate-select"
              :value="playbackRate"
              aria-label="Playback speed"
              title="Playback speed"
              :disabled="isCasting"
              @change="setPlayerPlaybackRate($event.target.value)"
            >
              <option v-for="option in playbackRateOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
            <q-btn
              v-if="!isMusic"
              flat
              round
              dense
              icon="fullscreen"
              :aria-label="playerMinimized ? 'Restore and enter fullscreen' : 'Enter fullscreen'"
              :title="playerMinimized ? 'Restore and enter fullscreen' : 'Enter fullscreen'"
              :disable="playerPoppedOut"
              @click="playerMinimized ? restorePlayerAndEnterFullscreen() : toggleFullscreen()"
            />
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
