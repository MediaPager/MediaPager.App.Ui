<script setup>
import { computed, watch } from 'vue'
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
  playPreviousInQueue,
  playNextInQueue,
} = usePlayback()

const isMusic = computed(() => currentMovie.value?.kind === 'music')

watch(playerOpen, (open) => {
  if (open) void initPlayer()
  else destroyPlayer()
}, { flush: 'post' })

function closePlayer() {
  playerOpen.value = false
}

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
        <q-bar class="player-bar">
          <div class="player-title ellipsis text-weight-bold">
            {{ currentMovie?.title }}<span v-if="currentMovie?.year && !isMusic"> ({{ currentMovie.year }})</span>
          </div>
          <q-space />
          <q-btn
            v-if="playerMinimized"
            dense
            flat
            round
            icon="open_in_full"
            aria-label="Expand player"
            title="Expand player"
            @click="togglePlayerMinimized"
          />
          <q-btn
            v-else
            dense
            flat
            round
            icon="minimize"
            aria-label="Minimize player"
            title="Minimize player"
            @click="togglePlayerMinimized"
          />
          <q-btn dense flat round icon="close" aria-label="Close player" title="Close player" @click="closePlayer" />
        </q-bar>

        <div class="player-content col">
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

          <div v-if="isMusic && !playerMinimized" class="music-player-controls column q-pa-md">
            <div class="row items-center q-gutter-sm">
              <span class="text-caption text-grey-5">{{ formatTime(playbackCurrentTime) }}</span>
              <q-slider
                class="col music-seek"
                :model-value="playbackCurrentTime"
                :min="0"
                :max="Math.max(playbackDuration, 1)"
                color="primary"
                @update:model-value="seekPlayback"
              />
              <span class="text-caption text-grey-5">{{ formatTime(playbackDuration) }}</span>
            </div>
            <div class="row items-center justify-center q-gutter-md">
              <q-btn flat round icon="skip_previous" aria-label="Previous track" @click="playPreviousInQueue" />
              <q-btn unelevated round color="primary" text-color="dark" :icon="playerPaused ? 'play_arrow' : 'pause'" :aria-label="playerPaused ? 'Play' : 'Pause'" @click="togglePlayback" />
              <q-btn flat round icon="skip_next" aria-label="Next track" @click="playNextInQueue" />
            </div>
          </div>

          <div v-if="playerMinimized" class="player-mini-controls row items-center q-gutter-xs q-px-sm q-pb-sm">
            <q-btn flat round dense icon="skip_previous" aria-label="Previous item" @click="playPreviousInQueue" />
            <q-btn flat round dense :icon="playerPaused ? 'play_arrow' : 'pause'" :aria-label="playerPaused ? 'Play' : 'Pause'" @click="togglePlayback" />
            <q-btn flat round dense icon="skip_next" aria-label="Next item" @click="playNextInQueue" />
            <q-slider
              class="col player-mini-seek"
              :model-value="playbackCurrentTime"
              :min="0"
              :max="Math.max(playbackDuration, 1)"
              color="primary"
              @update:model-value="seekPlayback"
            />
            <span class="player-mini-time">{{ formatTime(playbackCurrentTime) }}</span>
          </div>
        </div>
      </q-card>
    </div>
  </Teleport>
</template>
