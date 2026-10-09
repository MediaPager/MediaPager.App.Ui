<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { api } from '../composables/useApi'

const open = defineModel('open', { type: Boolean, required: true })
const props = defineProps({
  kind: { type: String, required: true },
  initialQuery: { type: String, default: '' },
})
const emit = defineEmits(['selected'])

const query = ref('')
const results = ref([])
const loading = ref(false)
const loadingProviderId = ref('')
const error = ref('')
let searchTimer = null

watch(open, (isOpen) => {
  if (!isOpen) {
    clearTimeout(searchTimer)
    searchTimer = null
    return
  }
  query.value = ''
  results.value = []
  error.value = ''
  if (props.initialQuery.trim()) query.value = props.initialQuery
})

watch(query, (value) => {
  clearTimeout(searchTimer)
  searchTimer = null
  if (!open.value || value.trim().length < 2) {
    results.value = []
    loading.value = false
    return
  }
  searchTimer = setTimeout(search, 300)
})

onBeforeUnmount(() => clearTimeout(searchTimer))

async function search() {
  clearTimeout(searchTimer)
  searchTimer = null
  const text = query.value.trim()
  if (!text) {
    results.value = []
    return
  }
  loading.value = true
  error.value = ''
  try {
    const { data } = await api.get('/metadata/search', {
      params: { q: text, kind: props.kind, limit: 10 },
    })
    if (query.value.trim() === text) results.value = data ?? []
  } catch (requestError) {
    error.value = requestError.response?.data?.detail ?? 'Could not search metadata providers.'
    results.value = []
  } finally {
    loading.value = false
  }
}

async function choose(result) {
  loadingProviderId.value = result.providerId
  error.value = ''
  try {
    const { data } = await api.get(
      `/metadata/${encodeURIComponent(result.providerId)}/${encodeURIComponent(result.kind)}/${encodeURIComponent(result.externalId)}`)
    emit('selected', { result, metadata: data })
    open.value = false
  } catch (requestError) {
    error.value = requestError.response?.data?.detail ?? 'Could not load the selected title metadata.'
  } finally {
    loadingProviderId.value = ''
  }
}
</script>

<template>
  <q-dialog v-model="open">
    <q-card dark class="metadata-search-card">
      <q-bar class="metadata-search-bar">
        <div class="text-weight-bold">Find online metadata</div>
        <q-space />
        <q-btn v-close-popup flat dense round icon="close" aria-label="Close metadata search" />
      </q-bar>

      <div class="q-pa-md column metadata-search-content">
        <q-input
          v-model="query"
          dark
          dense
          outlined
          autofocus
          label="Title"
          class="q-mb-sm"
          @keyup.enter="search"
        >
          <template #append>
            <q-btn flat round dense icon="search" color="primary" aria-label="Search metadata" @click="search" />
          </template>
        </q-input>

        <q-banner v-if="error" dense class="error-banner q-mb-sm">{{ error }}</q-banner>
        <div v-if="loading" class="flex flex-center q-pa-xl">
          <q-spinner-dots color="primary" size="2rem" />
        </div>
        <div v-else-if="!results.length" class="text-grey-6 q-pa-md text-center">
          {{ query.trim() ? 'No matching metadata found.' : 'Search by title to find metadata.' }}
        </div>
        <q-scroll-area v-else class="metadata-result-list">
          <q-list separator dark>
            <q-item
              v-for="result in results"
              :key="`${result.providerId}:${result.externalId}`"
              clickable
              :disable="Boolean(loadingProviderId)"
              @click="choose(result)"
            >
              <q-item-section avatar>
                <q-img :src="result.artworkUrl ?? undefined" fit="cover" class="metadata-result-poster" ratio="2/3">
                  <template #error>
                    <div class="metadata-result-fallback flex flex-center">
                      <q-icon name="movie" color="grey-6" />
                    </div>
                  </template>
                </q-img>
              </q-item-section>
              <q-item-section>
                <q-item-label class="text-weight-medium">{{ result.title }}</q-item-label>
                <q-item-label caption>{{ result.year ?? 'Year unknown' }}</q-item-label>
                <q-item-label v-if="result.overview" caption class="metadata-result-overview">
                  {{ result.overview }}
                </q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-spinner-dots v-if="loadingProviderId === result.providerId" color="primary" />
                <q-icon v-else name="arrow_forward" color="primary" />
              </q-item-section>
            </q-item>
          </q-list>
        </q-scroll-area>
      </div>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.metadata-search-card {
  width: min(620px, 94vw);
  max-width: 94vw;
  max-height: 85vh;
}

.metadata-search-content {
  height: min(650px, 75vh);
}

.metadata-result-list {
  flex: 1;
  min-height: 0;
}

.metadata-result-poster,
.metadata-result-fallback {
  width: 48px;
  height: 72px;
  border-radius: 4px;
  background: #1a2333;
}

.metadata-result-overview {
  display: -webkit-box;
  max-width: 400px;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
</style>
