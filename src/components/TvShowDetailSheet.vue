<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Notify } from 'quasar'
import { useTvShows } from '../composables/useTvShows'
import { usePlayback } from '../composables/usePlayback'
import { useUserSettings } from '../composables/useUserSettings'
import { formatRuntime, useMovies } from '../composables/useMovies'
import { useCatalogItems } from '../composables/useCatalogItems'
import { useAuth } from '../composables/useAuth'
import { usePlaylist } from '../composables/usePlaylist'
import { useSources } from '../composables/useSources'
import MediaDetailsActions from './MediaDetailsActions.vue'
import PluginActionButtons from './PluginActionButtons.vue'

const { error, isTouchDevice } = useMovies()
const { localItemFor, requestEditItem } = useCatalogItems()
const { canEditCatalogs } = useAuth()
const { addToQueue } = usePlaylist()
const { defaultTvSourceKey } = useSources()
const { currentMovie, onPlayEpisode, setTvNextHandler, beginPlayLoading, cancelPlayLoading } = usePlayback()
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
const seasonLoads = new Map()
const localCatalogItem = computed(() => tvSheetShow.value?.localItem ?? localItemFor(tvSheetShow.value?.id))
const seriesActionContext = computed(() => {
  const show = tvSheetShow.value
  if (!show) return null
  const localItem = localCatalogItem.value
  return {
    catalogItemId: show.isCatalogItem ? localItem?.id ?? null : null,
    catalogTypeId: localItem?.catalogTypeId ?? null,
    kind: 'tv',
    sourceKey: show.isCatalogItem ? null : show.sourceKey ?? defaultTvSourceKey.value,
    externalId: String(show.id ?? ''),
    title: sheetTitle(),
    imageUrl: tvSheetDetails.value?.posterUrl ?? show.posterUrl,
    backdropUrl: tvSheetDetails.value?.backdropUrl ?? show.backdropUrl,
    overview: tvSheetDetails.value?.overview ?? show.overview,
    year: Number(tvSheetDetails.value?.year ?? show.year) || null,
  }
})
const seasonActionContext = computed(() => {
  if (!seriesActionContext.value || selectedSeason.value == null) return null
  return { ...seriesActionContext.value, season: selectedSeason.value }
})
const identifierFields = computed(() => {
  const fields = []
  const add = (label, value) => {
    if (value != null && String(value).trim()) fields.push({ label, value: String(value) })
  }
  add('IMDb ID', tvSheetDetails.value?.imdbId ?? localCatalogItem.value?.imdbId)
  add('TMDB ID', localCatalogItem.value?.externalId ?? tvSheetShow.value?.id)
  return fields
})

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
  if (seasonLoads.has(number)) return seasonLoads.get(number)
  if (seasonCache.value[number] && !seasonCache.value[number].loading) return
  const showId = tvSheetShow.value?.id
  if (showId == null) return
  seasonCache.value[number] = { loading: true, episodes: [] }
  const request = (async () => {
    try {
      const data = await fetchSeason(showId, number)
      seasonCache.value[number] = { loading: false, episodes: data.episodes }
    } catch {
      seasonCache.value[number] = { loading: false, episodes: [] }
    }
  })()
  seasonLoads.set(number, request)
  try { await request } finally { seasonLoads.delete(number) }
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

async function editSeriesMetadata() {
  if (!localCatalogItem.value) return
  try {
    await requestEditItem(localCatalogItem.value.id)
  } catch {
    Notify.create({ type: 'negative', icon: 'error', message: 'Could not open series metadata.' })
  }
}

// Clicking an episode's still starts playback for that specific episode, and
// registers the next-episode continuation the player fires when it ends.
function playEpisode(ep, seasonNumber = selectedSeason.value) {
  const show = tvSheetShow.value
  if (!show || seasonNumber == null) return
  setTvNextHandler(playNextEpisode, show.id)
  return onPlayEpisode(show, seasonNumber, ep.episodeNumber, ep)
}

function episodeQueueItem(ep, seasonNumber = selectedSeason.value) {
  const show = tvSheetShow.value
  const season = seasonNumber
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

async function firstSeriesEpisode() {
  const season = [...(tvSheetDetails.value?.seasons ?? [])]
    .sort((left, right) => left.seasonNumber - right.seasonNumber)[0]
  if (!season) return null
  await loadSeason(season.seasonNumber)
  const episode = seasonCache.value[season.seasonNumber]?.episodes?.[0]
  return episode ? { episode, seasonNumber: season.seasonNumber } : null
}

async function playFirstEpisode() {
  if (isTouchDevice) {
    tvSheetOpen.value = false
    beginPlayLoading()
  }
  const first = await firstSeriesEpisode()
  if (!first) {
    if (isTouchDevice) cancelPlayLoading()
    return
  }
  selectedSeason.value = first.seasonNumber
  return playEpisode(first.episode, first.seasonNumber)
}

async function queueFirstEpisode() {
  const first = await firstSeriesEpisode()
  if (!first) return
  const queueItem = episodeQueueItem(first.episode, first.seasonNumber)
  if (addToQueue(queueItem)) Notify.create({ type: 'positive', message: 'Added the first episode to the queue.' })
}

async function firstEpisodePlaylistItem() {
  const first = await firstSeriesEpisode()
  return first ? episodeQueueItem(first.episode, first.seasonNumber) : null
}

function episodeActionMetadata(season, episode) {
  return {
    label: 'series-episode',
    value: JSON.stringify({
      seasonNumber: season.seasonNumber,
      episodeNumber: episode.episodeNumber,
      title: episode.title,
      imageUrl: episode.stillUrl,
      overview: episode.overview,
      year: Number(episode.airDate?.slice?.(0, 4)) || tvSheetDetails.value?.year || tvSheetShow.value?.year || null,
      seasonTitle: season.name,
      seriesTitle: sheetTitle(),
      seriesImageUrl: tvSheetDetails.value?.posterUrl ?? tvSheetShow.value?.posterUrl,
      seriesBackdropUrl: tvSheetDetails.value?.backdropUrl ?? tvSheetShow.value?.backdropUrl,
      seriesOverview: tvSheetDetails.value?.overview ?? tvSheetShow.value?.overview,
      seriesYear: Number(tvSheetDetails.value?.year ?? tvSheetShow.value?.year) || null,
    }),
  }
}

async function resolveSeriesActionContext() {
  const base = seriesActionContext.value
  const seasons = [...(tvSheetDetails.value?.seasons ?? [])]
    .sort((left, right) => left.seasonNumber - right.seasonNumber)
  if (!base || seasons.length === 0) return null

  await Promise.all(seasons.map((season) => loadSeason(season.seasonNumber)))
  const metadata = seasons.flatMap((season) =>
    (seasonCache.value[season.seasonNumber]?.episodes ?? [])
      .map((episode) => episodeActionMetadata(season, episode)))
  for (const season of seasons) {
    const count = seasonCache.value[season.seasonNumber]?.episodes?.length ?? 0
    if (season.episodeCount && count < season.episodeCount) {
      throw new Error(`Could not load every episode in ${seasonLabel(season)}.`)
    }
  }
  return { ...base, metadata }
}

async function resolveSeasonActionContext() {
  const context = seasonActionContext.value
  const season = tvSheetDetails.value?.seasons?.find((item) => item.seasonNumber === selectedSeason.value)
  if (!context || !season) return null

  await loadSeason(season.seasonNumber)
  const episodes = seasonCache.value[season.seasonNumber]?.episodes ?? []
  if (season.episodeCount && episodes.length < season.episodeCount) {
    throw new Error(`Could not load every episode in ${seasonLabel(season)}.`)
  }
  return { ...context, metadata: episodes.map((episode) => episodeActionMetadata(season, episode)) }
}

function episodeActionContext(ep) {
  const show = tvSheetShow.value
  const localItem = localCatalogItem.value
  const season = tvSheetDetails.value?.seasons?.find((entry) => entry.seasonNumber === selectedSeason.value)
  return {
    catalogItemId: null,
    catalogTypeId: localItem?.catalogTypeId ?? null,
    kind: 'Tv',
    sourceKey: show?.isCatalogItem ? null : show?.sourceKey ?? defaultTvSourceKey.value,
    externalId: String(show?.id ?? ''),
    title: `${show?.title ?? 'TV Show'} – S${selectedSeason.value}E${ep.episodeNumber}${ep.title ? ` · ${ep.title}` : ''}`,
    imageUrl: ep.stillUrl ?? tvSheetDetails.value?.posterUrl ?? show?.posterUrl,
    backdropUrl: tvSheetDetails.value?.backdropUrl ?? show?.backdropUrl,
    overview: ep.overview ?? show?.overview,
    year: Number(ep.airDate?.slice?.(0, 4) ?? tvSheetDetails.value?.year ?? show?.year) || null,
    season: selectedSeason.value,
    episode: ep.episodeNumber,
    metadata: season ? [episodeActionMetadata(season, ep)] : [],
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
                <div class="tv-sheet-title-row">
                  <div class="sheet-title">{{ sheetTitle() }}</div>
                  <q-btn
                    v-if="localCatalogItem && canEditCatalogs"
                    flat
                    dense
                    no-caps
                    color="grey-3"
                    icon="edit"
                    label="Edit"
                    title="Edit series metadata"
                    @click="editSeriesMetadata"
                  />
                </div>
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
                <div v-if="identifierFields.length" class="sheet-identifiers row q-gutter-xs">
                  <q-chip v-for="field in identifierFields" :key="field.label" dense outline color="grey-6" text-color="grey-4">
                    <span class="text-weight-medium q-mr-xs">{{ field.label }}:</span>{{ field.value }}
                  </q-chip>
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

          <MediaDetailsActions
            v-if="tvSheetDetails && !tvSheetShow.isCatalogItem"
            class="tv-series-actions q-mt-md"
            kind="tv"
            :item="tvSheetShow"
            :play-handler="playFirstEpisode"
            :queue-handler="queueFirstEpisode"
            :playlist-item-handler="firstEpisodePlaylistItem"
            :action-context="seriesActionContext"
            :context-resolver="resolveSeriesActionContext"
          />

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
                <PluginActionButtons
                  v-if="selectedSeason != null && !tvSheetShow.isCatalogItem"
                  surface="DetailScreen"
                  kind="tv"
                  :context="seasonActionContext"
                  :context-resolver="resolveSeasonActionContext"
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
                        <span v-if="ep.voteAverage" class="tv-episode-rating">
                          <span class="tv-episode-rating-separator"> · </span>
                          <q-icon name="star" size="12px" />
                          {{ ep.voteAverage.toFixed(1) }}
                        </span>
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
