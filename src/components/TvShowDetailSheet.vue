<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useTvShows } from '../composables/useTvShows'
import { usePlayback } from '../composables/usePlayback'
import { useUserSettings } from '../composables/useUserSettings'
import { formatRuntime, useMovies } from '../composables/useMovies'
import { useCatalogItems } from '../composables/useCatalogItems'
import { useSources } from '../composables/useSources'
import MediaDetailsActions from './MediaDetailsActions.vue'

const { error } = useMovies()
const { localItemFor } = useCatalogItems()
const { defaultTvSourceKey } = useSources()
const { currentMovie, onPlayEpisode, setTvNextHandler } = usePlayback()
const { autoplay } = useUserSettings()

const {
  tvSheetOpen,
  tvSheetShow,
  tvSheetDetails,
  tvSheetLoading,
  openTvDetails,
  fetchSeason,
} = useTvShows()

// Lazy episode lists: each season's episodes are fetched once when selected,
// then cached for the life of the open sheet.
const seasonCache = ref({})
const selectedSeason = ref(null)

const seasonOptions = computed(() =>
  (tvSheetDetails.value?.seasons ?? []).map((season) => ({
    label: seasonLabel(season),
    value: season.seasonNumber,
  })),
)

function seasonState(number) {
  return seasonCache.value[number] ?? null
}

async function loadSeason(number) {
  if (seasonCache.value[number]) return
  const showId = tvSheetShow.value?.id
  if (showId == null) return
  seasonCache.value[number] = { loading: true, episodes: [] }
  try {
    const data = await fetchSeason(showId, number)
    seasonCache.value[number] = { loading: false, episodes: data.episodes }
  } catch {
    seasonCache.value[number] = { loading: false, episodes: [] }
  }
}

watch(() => tvSheetShow.value?.id, () => {
  seasonCache.value = {}
  selectedSeason.value = null
  setTvNextHandler(null)
})

// Auto-select the first season once the details are fetched, so episodes show
// under the dropdown right away.
watch(() => tvSheetDetails.value, (details) => {
  const seasons = details?.seasons ?? []
  selectedSeason.value = seasons.length ? seasons[0].seasonNumber : null
})

watch(selectedSeason, (number) => {
  if (number != null) loadSeason(number)
})

function seasonLabel(season) {
  if (season.name && season.name !== `Season ${season.seasonNumber}`) return season.name
  return `Season ${season.seasonNumber}`
}

function sheetTitle() {
  return tvSheetDetails.value?.title ?? tvSheetShow.value?.title ?? ''
}

function sheetRating() {
  return (tvSheetDetails.value?.voteAverage ?? tvSheetShow.value?.voteAverage).toFixed(1)
}

// Clicking an episode's still starts playback for that specific episode, and
// registers the next-episode continuation the player fires when it ends.
function playEpisode(ep) {
  const show = tvSheetShow.value
  if (!show || selectedSeason.value == null) return
  setTvNextHandler(playNextEpisode, show.id)
  return onPlayEpisode(show, selectedSeason.value, ep.episodeNumber, ep)
}

function episodeQueueItem(ep) {
  const show = tvSheetShow.value
  const season = selectedSeason.value
  if (!show || season == null) return null
  return {
    kind: 'tv',
    externalId: String(show?.id ?? ''),
    title: `${show?.title ?? 'TV Show'} – S${season}E${ep.episodeNumber}${ep.title ? ` · ${ep.title}` : ''}`,
    overview: ep.overview ?? show?.overview ?? '',
    artworkUrl: ep.stillUrl ?? show?.posterUrl ?? null,
    sourceKey: show.sourceKey ?? defaultTvSourceKey.value,
    isEpisode: true,
    show: { ...show, sourceKey: show.sourceKey ?? defaultTvSourceKey.value },
    season,
    episode: ep.episodeNumber,
    episodeInfo: ep,
  }
}

function episodeActionContext(ep) {
  const show = tvSheetShow.value
  const localItem = localItemFor(show?.id)
  return {
    catalogItemId: localItem?.id ?? null,
    catalogTypeId: localItem?.catalogTypeId ?? null,
    kind: 'Tv',
    externalId: String(show?.id ?? ''),
    title: `${show?.title ?? 'TV Show'} – S${selectedSeason.value}E${ep.episodeNumber}${ep.title ? ` · ${ep.title}` : ''}`,
    imageUrl: ep.stillUrl ?? tvSheetDetails.value?.posterUrl ?? show?.posterUrl,
    backdropUrl: tvSheetDetails.value?.backdropUrl ?? show?.backdropUrl,
    overview: ep.overview ?? show?.overview,
    year: Number(ep.airDate?.slice?.(0, 4) ?? tvSheetDetails.value?.year ?? show?.year) || null,
    season: selectedSeason.value,
    episode: ep.episodeNumber,
  }
}

// When autoplay is on, advance to the following episode at the end of the playout:
// same season if there are more episodes, otherwise the first episode of the next season.
async function playNextEpisode() {
  const cur = currentMovie.value
  const show = tvSheetShow.value
  if (!autoplay.value || !cur?.isEpisode || !show || cur.season == null || cur.episode == null) return

  const episodes = seasonCache.value[cur.season]?.episodes ?? []
  const index = episodes.findIndex((ep) => ep.episodeNumber === cur.episode)
  let nextSeason = cur.season
  let next = index >= 0 && index + 1 < episodes.length ? episodes[index + 1] : null

  if (!next) {
    const seasons = [...(tvSheetDetails.value?.seasons ?? [])].sort((a, b) => a.seasonNumber - b.seasonNumber)
    const nextSeasonEntry = seasons.find((season) => season.seasonNumber > cur.season)
    if (!nextSeasonEntry) return
    nextSeason = nextSeasonEntry.seasonNumber
    if (!seasonCache.value[nextSeason]) {
      selectedSeason.value = nextSeason
      await loadSeason(nextSeason)
    }
    next = seasonCache.value[nextSeason]?.episodes?.[0]
  }

  if (next) {
    selectedSeason.value = nextSeason
    playEpisode(next)
  }
}

onBeforeUnmount(() => setTvNextHandler(null))
</script>

<template>
  <q-dialog
    v-model="tvSheetOpen"
    transition-show="fade"
    transition-hide="fade"
    maximized
  >
    <q-card dark class="movie-sheet" v-if="tvSheetShow">
      <q-img :src="(tvSheetDetails?.backdropUrl ?? tvSheetShow.backdropUrl ?? tvSheetShow.posterUrl) ?? undefined" fit="cover" class="sheet-bg">
        <template #error>
          <div class="sheet-bg-fallback absolute-full" />
        </template>
      </q-img>
      <div class="sheet-fade absolute-full" />

      <q-btn round dense flat icon="close" class="sheet-close" aria-label="Close" v-close-popup />

      <q-scroll-area class="sheet-scroll">
        <div class="sheet-content">
          <div class="sheet-poster-row row items-end q-gutter-md">
            <q-img :src="(tvSheetDetails?.posterUrl ?? tvSheetShow.posterUrl) ?? undefined" fit="cover" class="sheet-poster">
              <template #error>
                <div class="sheet-poster-fallback flex flex-center">
                  <q-icon name="live_tv" size="2rem" color="grey-7" />
                </div>
              </template>
            </q-img>
            <div class="sheet-header-main col row items-center q-gutter-md">
              <div class="sheet-header-text col">
                <div class="sheet-title">{{ sheetTitle() }}</div>
                <div class="sheet-meta">
                  <span class="sheet-year">{{ tvSheetDetails?.year ?? tvSheetShow.year ?? '—' }}</span>
                  <span v-if="tvSheetDetails?.status" class="sheet-status">{{ tvSheetDetails.status }}</span>
                  <span v-if="tvSheetDetails?.numberOfSeasons" class="sheet-seasons">
                    {{ tvSheetDetails.numberOfSeasons }} season{{ tvSheetDetails.numberOfSeasons > 1 ? 's' : '' }}
                  </span>
                  <span class="sheet-rating">
                    <q-icon name="star" color="secondary" size="14px" />
                    {{ sheetRating() }}
                    <span class="text-grey-6">/ 10</span>
                  </span>
                </div>
                <div v-if="tvSheetDetails?.genres?.length" class="sheet-genres row q-gutter-sm">
                  <q-chip
                    v-for="genre in tvSheetDetails.genres"
                    :key="genre"
                    outline
                    color="primary"
                    text-color="primary"
                    :label="genre"
                    dense
                  />
                </div>
                <div v-if="tvSheetDetails?.creator" class="sheet-director tv-sheet-creator">
                  <span class="text-grey-6">created by </span>{{ tvSheetDetails.creator }}
                </div>
              </div>
            </div>
          </div>

          <div v-if="tvSheetLoading" class="flex flex-center q-pa-md">
            <q-spinner-dots color="primary" size="2rem" />
          </div>

          <template v-else-if="tvSheetDetails">
            <div class="sheet-overview">{{ tvSheetDetails.overview || 'No description available.' }}</div>
            <div v-if="tvSheetDetails.cast?.length" class="sheet-section">
              <div class="sheet-section-title">Cast</div>
              <div class="sheet-cast-row">
                <div
                  v-for="member in tvSheetDetails.cast"
                  :key="member.name"
                  class="sheet-cast-item"
                >
                  <q-img :src="member.profileUrl ?? undefined" fit="cover" class="sheet-cast-photo">
                    <template #error>
                      <div class="sheet-cast-fallback flex flex-center">
                        <q-icon name="person" size="1.4rem" color="grey-7" />
                      </div>
                    </template>
                  </q-img>
                  <div class="sheet-cast-name">{{ member.name }}</div>
                  <div class="sheet-cast-char">{{ member.character }}</div>
                </div>
              </div>
            </div>

            <div v-if="tvSheetDetails.seasons?.length" class="sheet-section">
              <div class="sheet-section-title">Episodes</div>
              <q-banner v-if="error" dense class="error q-mb-md" rounded>
                <template #avatar>
                  <q-icon name="error" color="negative" />
                </template>
                {{ error }}
              </q-banner>
              <div class="tv-season-select-wrap">
                <q-select
                  v-model="selectedSeason"
                  dark
                  dense
                  outlined
                  :options="seasonOptions"
                  emit-value
                  map-options
                  option-label="label"
                  option-value="value"
                  class="tv-season-select"
                />
              </div>
              <div v-if="selectedSeason != null" class="tv-episodes">
                <div v-if="seasonState(selectedSeason)?.loading" class="flex flex-center q-pa-md">
                  <q-spinner-dots color="primary" size="1.6rem" />
                </div>
                <div
                  v-else-if="!seasonState(selectedSeason)?.episodes?.length"
                  class="tv-episodes-empty text-grey-6"
                >
                  no episode list available for this season
                </div>
                <template v-else>
                  <div
                    v-for="ep in seasonState(selectedSeason)?.episodes"
                    :key="ep.episodeNumber"
                    class="tv-episode"
                  >
                    <div class="tv-episode-num">{{ ep.episodeNumber }}</div>
                    <div class="tv-episode-still-wrap" role="button" tabindex="0" :aria-label="`Play episode ${ep.episodeNumber}`" @click="playEpisode(ep)" @keydown.enter.prevent="playEpisode(ep)">
                      <q-img :src="ep.stillUrl ?? undefined" fit="cover" class="tv-episode-still">
                        <template #error>
                          <div class="tv-episode-still-fallback flex flex-center">
                            <q-icon name="tv_off" size="1.1rem" color="grey-7" />
                          </div>
                        </template>
                      </q-img>
                      <div class="tv-episode-play">
                        <q-icon name="play_arrow" />
                      </div>
                    </div>
                    <div class="tv-episode-body col">
                      <div class="tv-episode-title">{{ ep.title }}</div>
                      <div class="tv-episode-meta">
                        <span>{{ ep.airDate ?? 'air date n/a' }}</span>
                        <span v-if="ep.runtimeMinutes"> · {{ formatRuntime(ep.runtimeMinutes) }}</span>
                      </div>
                      <div v-if="ep.overview" class="tv-episode-overview">{{ ep.overview }}</div>
                    </div>
                    <MediaDetailsActions
                      class="tv-episode-actions"
                      compact
                      kind="tv"
                      :item="ep"
                      :queue-item="episodeQueueItem(ep)"
                      :play-handler="() => playEpisode(ep)"
                      :action-context="episodeActionContext(ep)"
                    />
                    <div v-if="ep.voteAverage" class="tv-episode-rating">
                      <q-icon name="star" color="secondary" size="14px" />
                      {{ ep.voteAverage.toFixed(1) }}
                    </div>
                  </div>
                </template>
              </div>
            </div>

            <div v-if="tvSheetDetails.related?.length" class="sheet-section">
              <div class="sheet-section-title">Related Shows</div>
              <div class="sheet-related-row">
                <div
                  v-for="rel in tvSheetDetails.related"
                  :key="rel.id"
                  class="sheet-related-item"
                  @click="openTvDetails(rel)"
                >
                  <q-img :src="rel.posterUrl ?? undefined" fit="cover" class="sheet-related-poster">
                    <template #error>
                      <div class="sheet-related-fallback flex flex-center">
                        <q-icon name="live_tv" size="1.4rem" color="grey-7" />
                      </div>
                    </template>
                  </q-img>
                  <div class="sheet-related-title">{{ rel.title }}</div>
                </div>
              </div>
            </div>
          </template>

          <div v-else class="sheet-overview">{{ tvSheetShow.overview || 'No description available.' }}</div>
        </div>
      </q-scroll-area>
    </q-card>
  </q-dialog>
</template>
