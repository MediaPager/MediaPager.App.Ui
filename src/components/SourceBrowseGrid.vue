<script setup>
import { computed, watch } from 'vue'
import { useSources } from '../composables/useSources'
import { useMovies } from '../composables/useMovies'
import { useCatalogItems } from '../composables/useCatalogItems'
import { usePlayback } from '../composables/usePlayback'
import { useMediaDetails } from '../composables/useMediaDetails'
import PluginActionButtons from './PluginActionButtons.vue'

// Generic data-driven browse screen for one stream-provider source (`source:{key}` tab):
// a poster grid over GET /sources/{key}/browse + a detail sheet over .../details/{id}.
const props = defineProps({
  sourceKey: { type: String, required: true },
  icon: { type: String, default: 'play_circle' },
  kind: { type: String, default: null },
})

const { stateFor, fetchBrowse } = useSources()
const { isTouchDevice } = useMovies()
const { localItemFor } = useCatalogItems()
const { onPlaySourceItem } = usePlayback()
const { openSourceDetails } = useMediaDetails()

const state = computed(() => stateFor(props.sourceKey))

// Lazy-load the first page when the tab first shows; reload if the source key changes.
watch(() => props.sourceKey, (key) => {
  if (key && !stateFor(key).loaded && !stateFor(key).loading) fetchBrowse(key)
}, { immediate: true })

function openDetails(item) {
  openSourceDetails(props.sourceKey, item)
}

function playItem(item) {
  return onPlaySourceItem({ ...item, kind: item.kind ?? props.kind ?? 'music' }, props.sourceKey)
}

function metadataSummary(metadata) {
  return (metadata ?? []).slice(0, 3).map((field) => field.value).filter(Boolean).join(' · ')
}

function goToPage(page) {
  fetchBrowse(props.sourceKey, page)
}
</script>

<template>
  <div>
    <q-banner v-if="state.error" dense class="error q-mb-md" rounded>
      <template #avatar>
        <q-icon name="error" color="negative" />
      </template>
      {{ state.error }}
    </q-banner>

    <div v-if="state.loading" class="source-search-status row items-center justify-center q-mb-md" role="status" aria-live="polite">
      <q-spinner-dots color="primary" size="1.5rem" />
      <span>{{ state.query ? `Searching “${state.query}”…` : 'Loading results…' }}</span>
    </div>

    <div class="movie-grid">
      <div v-for="item in state.items" :key="item.externalId" class="movie-grid-item">
        <q-card dark class="movie-card full-height column" @click="openDetails(item)">
          <div class="poster-wrap">
            <q-img :src="item.artworkUrl ?? undefined" fit="cover" class="poster">
              <template #error>
                <div class="poster-fallback absolute-full flex flex-center">
                  <q-icon :name="icon" size="2rem" color="grey-7" />
                </div>
              </template>
            </q-img>
            <q-btn
              round
              unelevated
              color="dark"
              text-color="primary"
              icon="info"
              size="sm"
              class="poster-info-button"
              :aria-label="`Browse ${item.title}`"
              @click.stop="openDetails(item)"
            />
            <div v-if="item.voteAverage != null" class="rating absolute-bottom-right q-ma-xs">
              <q-icon name="star" color="secondary" size="16px" />
              {{ item.voteAverage.toFixed(1) }}
            </div>
            <PluginActionButtons
              surface="PosterCard"
              :kind="kind"
              :context="{
                catalogItemId: localItemFor(item.externalId)?.id ?? null,
                catalogTypeId: localItemFor(item.externalId)?.catalogTypeId ?? null,
                kind: kind === 'tv' ? 'Tv' : kind === 'movie' ? 'Movie' : kind,
                sourceKey, externalId: item.externalId, title: item.title,
                imageUrl: item.artworkUrl, backdropUrl: item.backdropUrl,
                overview: item.overview, year: item.year, metadata: item.metadata,
              }"
            />
            <div class="play-overlay absolute-full flex flex-center">
              <q-btn
                round
                unelevated
                color="primary"
                text-color="dark"
                icon="play_arrow"
                size="lg"
                :aria-label="`Play ${item.title}`"
                @click.stop="playItem(item)"
              />
              <div class="movie-overview">
                {{ item.overview || 'No description available.' }}
              </div>
            </div>
          </div>

          <q-card-section class="col q-pa-sm">
            <div class="movie-title">{{ item.title }}</div>
            <div v-if="metadataSummary(item.metadata)" class="movie-year text-grey-6">
              {{ metadataSummary(item.metadata) }}
            </div>
            <div v-else class="movie-year text-primary">{{ item.year ?? '—' }}</div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <div v-if="!state.loading && !state.error && state.loaded && state.items.length === 0" class="text-grey-6 text-center q-my-xl">
      no results
    </div>

    <div v-if="state.totalPages > 1" class="flex flex-center q-my-lg">
      <q-pagination
        :model-value="state.page"
        :max="state.totalPages"
        :max-pages="isTouchDevice ? 3 : 7"
        :direction-links="true"
        :boundary-links="!isTouchDevice"
        :size="isTouchDevice ? 'sm' : 'md'"
        color="primary"
        text-color="grey-5"
        active-color="primary"
        active-text-color="dark"
        @update:model-value="goToPage"
      />
    </div>

  </div>
</template>

<style scoped>
.source-search-status {
  gap: 0.5rem;
  min-height: 2.5rem;
  color: #86d411;
}
</style>
