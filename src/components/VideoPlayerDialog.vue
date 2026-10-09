<script setup>
import {
  usePlayback,
  languages,
} from '../composables/usePlayback'
import SubtitleStyleControls from './SubtitleStyleControls.vue'

const {
  playerOpen,
  currentMovie,
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
  searchSubtitles,
  refreshSubtitles,
  toggleSubtitles,
  clearSubtitle,
  selectSubtitle,
} = usePlayback()
</script>

<template>
  <q-dialog
    v-model="playerOpen"
    transition-show="fade"
    transition-hide="fade"
    @show="initPlayer"
    @hide="destroyPlayer"
  >
    <q-card dark class="player-card column">
      <q-bar class="player-bar">
        <div class="ellipsis text-weight-bold">{{ currentMovie?.title }} ({{ currentMovie?.year }})</div>
        <q-space />
        <q-btn v-close-popup dense flat round icon="close" />
      </q-bar>

      <div class="col row player-body">
        <div class="col player-wrap">
          <video ref="videoEl" class="video-js vjs-big-play-centered" crossorigin="anonymous"></video>
          <q-btn
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

          <div v-if="subtitlePanelOpen" class="subtitle-panel column q-pa-md">
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
                    <q-btn
                      flat
                      round
                      dense
                      icon="search"
                      color="primary"
                      aria-label="Search subtitles by title"
                      @click="searchSubtitles"
                    />
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
                    <div v-if="subsLoading" class="flex flex-center q-pa-md">
                      <q-spinner-dots color="primary" size="2rem" />
                    </div>
                    <div v-if="!subsLoading && subtitles.length === 0" class="text-grey-6 q-pa-sm">
                      no subtitles found
                    </div>
                  </q-list>
                </q-scroll-area>

                <q-banner v-if="subtitleError" dense class="error-banner q-mt-sm" rounded>
                  {{ subtitleError }}
                </q-banner>

                <div class="row items-center q-mt-sm q-gutter-sm">
                  <q-toggle
                    v-model="subtitlesVisible"
                    dark
                    color="primary"
                    label="subtitles"
                    :disable="!activeSub"
                    @update:model-value="toggleSubtitles"
                  />
                  <q-btn
                    flat
                    dense
                    color="grey-5"
                    label="clear"
                    :disable="!activeSub"
                    @click="clearSubtitle"
                  />
                </div>
              </q-tab-panel>

              <q-tab-panel name="style" class="column q-pa-none">
                <q-scroll-area class="col">
                  <SubtitleStyleControls class="subtitle-style-container" />
                </q-scroll-area>
              </q-tab-panel>
            </q-tab-panels>
          </div>
        </div>
      </div>
    </q-card>
  </q-dialog>
</template>
