<script setup>
import { computed, ref } from 'vue'
import { useMovies, formatRuntime } from '../composables/useMovies'
import { usePlayback } from '../composables/usePlayback'
import { useCatalogItems } from '../composables/useCatalogItems'
import { useSources } from '../composables/useSources'
import ItemRatingMenu from './ItemRatingMenu.vue'
import PluginActionButtons from './PluginActionButtons.vue'

const {
  movieSheetOpen,
  sheetMovie,
  sheetDetails,
  sheetLoading,
  openDetails,
  searchCast,
  isTouchDevice,
} = useMovies()
const { onPlay } = usePlayback()
const { localItemFor } = useCatalogItems()
const { defaultSourceKey, sourceTabs } = useSources()

// The movie being viewed — a local copy adds its library action, local playback, and rating.
const localItem = computed(() => sheetMovie.value?.localItem ?? localItemFor(sheetMovie.value?.id))
const sourceLabel = computed(() => {
  if (localItem.value) return localItem.value.catalogName || 'Local catalog'
  return sourceTabs.value.find((source) => source.sourceKey === defaultSourceKey.value)?.label ?? 'Stream'
})

</script>

<template>
  <q-dialog
    v-model="movieSheetOpen"
    transition-show="fade"
    transition-hide="fade"
    maximized
  >
    <q-card dark class="movie-sheet" v-if="sheetMovie">
      <q-img :src="(sheetDetails?.backdropUrl ?? sheetMovie.backdropUrl ?? sheetMovie.posterUrl) ?? undefined" fit="cover" class="sheet-bg">
        <template #error>
          <div class="sheet-bg-fallback absolute-full" />
        </template>
      </q-img>
      <div class="sheet-fade absolute-full" />

      <q-btn round dense flat icon="close" class="sheet-close" aria-label="Close" v-close-popup />

      <q-scroll-area class="sheet-scroll">
        <div class="sheet-content">
          <div class="sheet-poster-row row items-end q-gutter-md">
            <q-img :src="(sheetDetails?.posterUrl ?? sheetMovie.posterUrl) ?? undefined" fit="cover" class="sheet-poster">
              <template #error>
                <div class="sheet-poster-fallback flex flex-center">
                  <q-icon name="movie" size="2rem" color="grey-7" />
                </div>
              </template>
            </q-img>
            <div class="sheet-header-main col row items-center q-gutter-md">
                <div class="sheet-header-text col">
                  <div class="sheet-title">{{ sheetDetails?.title ?? sheetMovie.title }}</div>
                  <div class="sheet-origin">Stream: {{ sourceLabel }}</div>
                  <div class="sheet-meta">
                  <span class="sheet-year">{{ sheetDetails?.year ?? sheetMovie.year ?? '—' }}</span>
                  <span v-if="sheetDetails?.runtimeMinutes" class="sheet-runtime">{{ formatRuntime(sheetDetails.runtimeMinutes) }}</span>
                  <span class="sheet-rating">
                    <q-icon name="star" color="secondary" size="14px" />
                    {{ (sheetDetails?.voteAverage ?? sheetMovie.voteAverage).toFixed(1) }}
                    <span class="text-grey-6">/ 10</span>
                  </span>
                  <span v-if="localItem" class="sheet-owned">
                    <q-icon name="check_circle" color="secondary" size="14px" /> in your library
                  </span>
                </div>
                <div v-if="sheetDetails?.genres?.length" class="sheet-genres row q-gutter-sm">
                  <q-chip
                    v-for="genre in sheetDetails.genres"
                    :key="genre"
                    outline
                    color="primary"
                    text-color="primary"
                    :label="genre"
                    dense
                  />
                </div>
              </div>
              <!-- desktop: play sits right of the title/meta/genres -->
              <div class="sheet-header-actions">
                <q-btn
                  unelevated
                  color="primary"
                  text-color="dark"
                  icon="play_arrow"
                  label="Play"
                  size="lg"
                  class="sheet-play-float"
                  @click="onPlay(localItem ?? sheetMovie)"
                />
                <template v-if="localItem">
                  <item-rating-menu v-if="!isTouchDevice" :item="localItem" size="md" />
                </template>
              </div>
            </div>
          </div>

          <template v-if="localItem">
            <div class="sheet-actions-mobile row q-gutter-sm items-center">
              <q-btn
                unelevated
                color="primary"
                text-color="dark"
                icon="play_arrow"
                label="Play"
                class="col"
                @click="onPlay(localItem ?? sheetMovie)"
              />
              <item-rating-menu v-if="!isTouchDevice" :item="localItem" size="sm" />
            </div>
          </template>
          <div v-else class="sheet-actions row q-gutter-sm">
            <q-btn
              unelevated
              color="primary"
              text-color="dark"
              icon="play_arrow"
              label="Play"
              class="col"
              @click="onPlay(localItem ?? sheetMovie)"
            />
          </div>

          <div v-if="sheetLoading" class="flex flex-center q-pa-md">
            <q-spinner-dots color="primary" size="2rem" />
          </div>

          <template v-else-if="sheetDetails">
            <div class="sheet-overview">{{ sheetDetails.overview || 'No description available.' }}</div>
            <PluginActionButtons
              surface="DetailScreen"
              kind="movie"
              :context="{
                catalogItemId: localItem?.id ?? null,
                kind: 'Movie',
                externalId: String(sheetMovie.id),
                title: sheetDetails.title ?? sheetMovie.title,
                imageUrl: sheetDetails.posterUrl ?? sheetMovie.posterUrl,
                backdropUrl: sheetDetails.backdropUrl ?? sheetMovie.backdropUrl,
                overview: sheetDetails.overview ?? sheetMovie.overview,
                year: Number(sheetDetails.year ?? sheetMovie.year) || null,
              }"
            />

            <div v-if="sheetDetails.cast?.length" class="sheet-section">
              <div class="sheet-section-title">Cast</div>
              <div class="sheet-cast-row">
                <div
                  v-for="member in sheetDetails.cast"
                  :key="member.name"
                  class="sheet-cast-item"
                  role="button"
                  tabindex="0"
                  :title="`Search movies with ${member.name}`"
                  @click="searchCast(member.name)"
                  @keyup.enter="searchCast(member.name)"
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

            <div v-if="sheetDetails.director" class="sheet-section">
              <div class="sheet-section-title">Director</div>
              <div class="sheet-director">{{ sheetDetails.director }}</div>
            </div>

            <div v-if="sheetDetails.related?.length" class="sheet-section">
              <div class="sheet-section-title">Related Movies</div>
              <div class="sheet-related-row">
                <div
                  v-for="rel in sheetDetails.related"
                  :key="rel.id"
                  class="sheet-related-item"
                  @click="openDetails(rel)"
                >
                  <q-img :src="rel.posterUrl ?? undefined" fit="cover" class="sheet-related-poster">
                    <template #error>
                      <div class="sheet-related-fallback flex flex-center">
                        <q-icon name="movie" size="1.4rem" color="grey-7" />
                      </div>
                    </template>
                  </q-img>
                  <div class="sheet-related-title">{{ rel.title }}</div>
                </div>
              </div>
            </div>
          </template>

          <div v-else class="sheet-overview">{{ sheetMovie.overview || 'No description available.' }}</div>
        </div>
      </q-scroll-area>
    </q-card>
  </q-dialog>
</template>
