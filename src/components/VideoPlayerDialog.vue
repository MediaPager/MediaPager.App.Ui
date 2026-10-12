<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  usePlayback,
  languages,
} from '../composables/usePlayback'
import SubtitleStyleControls from './SubtitleStyleControls.vue'

const {
  playerOpen,
  playerMinimized,
  currentMovie,
  playbackError,
  playerPaused,
  playbackCurrentTime,
  playbackDuration,
  playbackVolume,
  playbackMuted,
  playbackRate,
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

watch(playerOpen, (open) => {
  if (open) void initPlayer()
  else destroyPlayer()
}, { flush: 'post' })

watch([playerOpen, playerMinimized], ([open, minimized]) => {
  document.body.classList.toggle('player-modal-open', open && !minimized)
}, { flush: 'post' })

onBeforeUnmount(() => document.body.classList.remove('player-modal-open'))

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
          <q-btn dense flat round icon="minimize" aria-label="Minimize player" title="Minimize player" @click="togglePlayerMinimized" />
        </q-bar>

        <div class="player-content col" :class="{ 'player-content--hidden': playerMinimized }">
          <div class="player-stage">
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

          <div v-if="!playerMinimized" class="player-controls">
            <div class="player-seek-row">
              <span class="player-control-time">{{ formatTime(playbackCurrentTime) }}</span>
              <q-slider
                class="player-seek"
                :model-value="playbackCurrentTime"
                :min="0"
                :max="Math.max(playbackDuration, 1)"
                color="primary"
                aria-label="Seek playback"
                @update:model-value="seekPlayback"
              />
              <span class="player-control-time">{{ formatTime(playbackDuration) }}</span>
            </div>
            <div class="player-actions-row">
              <div class="player-volume-controls">
                <q-btn flat round dense :icon="playerMuted || playbackVolume === 0 ? 'volume_off' : 'volume_up'" :aria-label="playerMuted ? 'Unmute' : 'Mute'" :title="playerMuted ? 'Unmute' : 'Mute'" @click="toggleMute" />
                <q-slider class="player-volume-slider" :model-value="playbackVolume" :min="0" :max="1.2" :step="0.01" color="primary" aria-label="Volume" @update:model-value="setPlaybackVolume" />
              </div>
              <div class="player-transport">
                <q-btn flat round dense icon="skip_previous" aria-label="Previous item" title="Previous item" :disable="!hasPrevious" @click="playPreviousInQueue" />
                <q-btn unelevated round color="primary" text-color="dark" :icon="playerPaused ? 'play_arrow' : 'pause'" :aria-label="playerPaused ? 'Play' : 'Pause'" @click="togglePlayback" />
                <q-btn flat round dense icon="skip_next" aria-label="Next item" title="Next item" :disable="!hasNext" @click="playNextInQueue" />
                <q-btn flat round dense color="negative" icon="stop" aria-label="Stop playback" title="Stop playback" @click="stopPlayback" />
              </div>
              <div class="player-end-controls">
              <select
                class="player-rate-select"
                :value="playbackRate"
                aria-label="Playback speed"
                title="Playback speed"
                @change="setPlaybackRate($event.target.value)"
              >
                <option v-for="option in playbackRateOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
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
              @update:model-value="seekPlayback"
            />
          </div>
        </div>
        <div class="player-mini-main">
          <div class="player-mini-media">
            <q-img
              :src="currentMovie?.artworkUrl ?? currentMovie?.posterUrl ?? undefined"
              fit="cover"
              class="player-mini-art"
            >
              <template #error><div class="absolute-full flex flex-center bg-grey-10"><q-icon :name="isMusic ? 'music_note' : 'movie'" color="grey-6" /></div></template>
            </q-img>
            <div class="player-mini-info">
              <div class="player-mini-title ellipsis">{{ currentMovie?.title }}</div>
              <div class="player-mini-subtitle ellipsis">{{ currentMovie?.artist ?? currentMovie?.album ?? currentMovie?.year ?? '' }}</div>
            </div>
          </div>
          <div class="player-mini-transport">
            <q-btn flat round dense icon="skip_previous" aria-label="Previous item" title="Previous item" :disable="!hasPrevious" @click="playPreviousInQueue" />
            <q-btn unelevated round color="primary" text-color="dark" :icon="playerPaused ? 'play_arrow' : 'pause'" :aria-label="playerPaused ? 'Play' : 'Pause'" @click="togglePlayback" />
            <q-btn flat round dense icon="skip_next" aria-label="Next item" title="Next item" :disable="!hasNext" @click="playNextInQueue" />
            <q-btn flat round dense color="negative" icon="stop" aria-label="Stop playback" title="Stop playback" @click="stopPlayback" />
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
                  @update:model-value="setPlaybackVolume"
                />
                <q-btn flat round dense :icon="playerMuted ? 'volume_off' : 'volume_up'" :aria-label="playerMuted ? 'Unmute' : 'Mute'" :title="playerMuted ? 'Unmute' : 'Mute'" @click="toggleMute" />
              </div>
              <q-btn
                flat
                round
                dense
                :icon="playerMuted || playbackVolume === 0 ? 'volume_off' : 'volume_up'"
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
              @change="setPlaybackRate($event.target.value)"
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
              @click="playerMinimized ? restorePlayerAndEnterFullscreen() : toggleFullscreen()"
            />
            <q-btn
              flat
              round
              dense
              :icon="playerMinimized ? 'open_in_full' : 'minimize'"
              :aria-label="playerMinimized ? 'Restore player' : 'Minimize player'"
              :title="playerMinimized ? 'Restore player' : 'Minimize player'"
              @click="togglePlayerMinimized"
            />
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
