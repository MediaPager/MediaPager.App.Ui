<script setup>
import { computed, ref, watch } from 'vue'
import { useSources } from '../composables/useSources'
import { useCatalogItems } from '../composables/useCatalogItems'
import PluginActionButtons from './PluginActionButtons.vue'

// Generic data-driven detail sheet for a stream-provider title: fetches
// GET /sources/{key}/details/{externalId} and renders whatever the provider returned
// (overview, rating, credits, seasons/episodes for TV-kind sources). Playback resolve
// (/sources/{key}/resolve) is a later phase — for now this is the browse target.
const open = defineModel({ type: Boolean, required: true })
const props = defineProps({
  sourceKey: { type: String, required: true },
  externalId: { type: String, default: null },
  kind: { type: String, default: null },
})

const { fetchDetails, sourceTabs } = useSources()
const { localItemFor } = useCatalogItems()
const sourceLabel = computed(() =>
  localItemFor(props.externalId)?.catalogName ??
  sourceTabs.value.find((source) => source.sourceKey === props.sourceKey)?.label ??
  'Stream')

const details = ref(null)
const loading = ref(false)
const error = ref('')

watch([open, () => props.externalId], async ([isOpen, id]) => {
  if (!isOpen || !id) return
  details.value = null
  error.value = ''
  loading.value = true
  try {
    details.value = await fetchDetails(props.sourceKey, id)
  } catch (requestError) {
    error.value = requestError.response?.data?.detail ?? 'Could not load details.'
  } finally {
    loading.value = false
  }
}, { immediate: true })
</script>

<template>
  <q-dialog v-model="open" transition-show="fade" transition-hide="fade" maximized>
    <q-card dark class="movie-sheet">
      <q-img :src="details?.backdropUrl ?? details?.artworkUrl ?? undefined" fit="cover" class="sheet-bg">
        <template #error>
          <div class="sheet-bg-fallback absolute-full" />
        </template>
      </q-img>
      <div class="sheet-fade absolute-full" />

      <q-btn round dense flat icon="close" class="sheet-close" aria-label="Close" v-close-popup />

      <q-scroll-area class="sheet-scroll">
        <div class="sheet-content">
          <div v-if="loading" class="flex flex-center q-my-xl">
            <q-spinner-dots color="primary" size="3rem" />
          </div>

          <q-banner v-else-if="error" dense class="error" rounded>
            <template #avatar>
              <q-icon name="error" color="negative" />
            </template>
            {{ error }}
          </q-banner>

          <template v-else-if="details">
            <div class="sheet-poster-row row items-end q-gutter-md">
              <q-img :src="details.artworkUrl ?? undefined" fit="cover" class="sheet-poster">
                <template #error>
                  <div class="sheet-poster-fallback flex flex-center">
                    <q-icon name="play_circle" size="2rem" color="grey-7" />
                  </div>
                </template>
              </q-img>
              <div class="sheet-header-main col row items-center q-gutter-md">
                <div class="sheet-header-text col">
                  <div class="sheet-title">{{ details.title }}</div>
                  <div class="sheet-origin">Stream: {{ sourceLabel }}</div>
                  <div class="sheet-meta">
                    <span class="sheet-year">{{ details.year ?? '—' }}</span>
                    <span v-if="details.contentRating" class="sheet-runtime">{{ details.contentRating }}</span>
                    <span v-if="details.rating != null" class="sheet-rating">
                      <q-icon name="star" color="secondary" size="14px" />
                      {{ details.rating.toFixed(1) }}
                      <span class="text-grey-6">/ 10</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="details.overview" class="sheet-overview">{{ details.overview }}</div>
            <PluginActionButtons
              surface="DetailScreen"
                :kind="kind"
                :context="{
                catalogItemId: localItemFor(externalId)?.id ?? null,
                catalogTypeId: localItemFor(externalId)?.catalogTypeId ?? null,
                kind: kind === 'tv' ? 'Tv' : kind === 'movie' ? 'Movie' : kind,
                sourceKey, externalId: details.externalId, title: details.title,
                imageUrl: details.artworkUrl, backdropUrl: details.backdropUrl,
                overview: details.overview, year: details.year,
              }"
            />

            <div v-if="details.credits?.length" class="sheet-section">
              <div class="sheet-section-title">Cast &amp; Crew</div>
              <div class="row q-gutter-sm">
                <q-chip
                  v-for="credit in details.credits"
                  :key="`${credit.name}:${credit.role}`"
                  outline
                  color="primary"
                  text-color="grey-4"
                  :label="credit.role ? `${credit.name} — ${credit.role}` : credit.name"
                  dense
                />
              </div>
            </div>

            <div v-if="details.seasons?.length" class="sheet-section">
              <div class="sheet-section-title">Seasons</div>
              <div v-for="season in details.seasons" :key="season.seasonNumber" class="q-mb-md">
                <div class="text-subtitle2 text-primary q-mb-xs">
                  {{ season.name ?? `Season ${season.seasonNumber}` }}
                </div>
                <div v-if="season.overview" class="text-grey-6 q-mb-sm">{{ season.overview }}</div>
                <q-list v-if="season.episodes?.length" dark dense bordered separator class="rounded-borders">
                  <q-item v-for="episode in season.episodes" :key="episode.episodeNumber">
                    <q-item-section avatar class="text-grey-6" style="min-width: 2.5rem">
                      {{ episode.episodeNumber }}
                    </q-item-section>
                    <q-item-section>
                      <q-item-label>{{ episode.name ?? `Episode ${episode.episodeNumber}` }}</q-item-label>
                      <q-item-label v-if="episode.overview" caption lines="2">{{ episode.overview }}</q-item-label>
                    </q-item-section>
                  </q-item>
                </q-list>
              </div>
            </div>
          </template>
        </div>
      </q-scroll-area>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.sheet-section {
  margin-top: 1.5rem;
}

.sheet-section-title {
  font-size: 1.05rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}
</style>
