<script setup>
import { computed, ref, watch } from 'vue'
import { api } from '../composables/useApi'
import MetadataSearchDialog from './MetadataSearchDialog.vue'

const open = defineModel('open', { type: Boolean, required: true })
const props = defineProps({ catalog: { type: Object, default: null } })
const emit = defineEmits(['created'])

const file = ref(null)
const title = ref('')
const year = ref(null)
const overview = ref('')
const originalTitle = ref('')
const originalAvailableAt = ref('')
const contentRating = ref('')
const rating = ref(null)
const externalId = ref('')
const imageUrl = ref('')
const backdropUrl = ref('')
const genres = ref([])
const metadataSearchOpen = ref(false)
const saving = ref(false)
const progress = ref(0)
const error = ref('')

const catalogTypeSlug = computed(() => props.catalog?.catalogType?.slug ?? '')
const metadataKind = computed(() => ({
  movies: 'movie',
  'tv-shows': 'tv',
  music: 'music',
  podcasts: 'podcast',
  audiobooks: 'audiobook',
  books: 'book',
}[catalogTypeSlug.value] ?? null))
const accept = computed(() => {
  if (catalogTypeSlug.value === 'movies' || catalogTypeSlug.value === 'tv-shows')
    return 'video/*,.mkv,.avi,.mov,.m4v,.ts'
  if (catalogTypeSlug.value === 'books')
    return '.pdf,.epub,.mobi,.azw,.azw3,.cbz,.cbr,.txt,.rtf'
  return 'audio/*,.m4b,.flac,.opus,.wma'
})

watch(open, (isOpen) => {
  if (!isOpen) return
  file.value = null
  title.value = ''
  year.value = null
  overview.value = ''
  originalTitle.value = ''
  originalAvailableAt.value = ''
  contentRating.value = ''
  rating.value = null
  externalId.value = ''
  imageUrl.value = ''
  backdropUrl.value = ''
  genres.value = []
  progress.value = 0
  error.value = ''
})

watch(file, (picked) => {
  if (!picked) return
  if (!title.value.trim()) title.value = picked.name.replace(/\.[^.]+$/, '')
})

function useMetadata({ result, metadata }) {
  externalId.value = result.externalId
  title.value = metadata.title ?? result.title
  year.value = metadata.year ?? result.year ?? null
  overview.value = metadata.overview ?? result.overview ?? ''
  originalTitle.value = metadata.originalTitle ?? ''
  originalAvailableAt.value = metadata.originalAvailableAt ? String(metadata.originalAvailableAt).slice(0, 10) : ''
  contentRating.value = metadata.contentRating ?? ''
  rating.value = metadata.rating ?? result.voteAverage ?? null
  imageUrl.value = metadata.artworkUrl ?? result.artworkUrl ?? ''
  backdropUrl.value = metadata.backdropUrl ?? ''
  genres.value = metadata.genres ?? []
}

function appendIfSet(form, key, value) {
  if (value != null && String(value).trim() !== '') form.append(key, String(value))
}

async function upload() {
  if (!file.value) {
    error.value = 'Choose a file to upload.'
    return
  }
  if (!title.value.trim()) {
    error.value = 'Enter a title.'
    return
  }
  if (!props.catalog?.id) {
    error.value = 'Choose a catalog first.'
    return
  }

  const form = new FormData()
  form.append('catalogId', String(props.catalog.id))
  form.append('file', file.value)
  form.append('title', title.value.trim())
  appendIfSet(form, 'year', year.value)
  appendIfSet(form, 'overview', overview.value)
  appendIfSet(form, 'originalTitle', originalTitle.value)
  appendIfSet(form, 'originalAvailableAt', originalAvailableAt.value)
  appendIfSet(form, 'contentRating', contentRating.value)
  appendIfSet(form, 'rating', rating.value)
  appendIfSet(form, 'externalId', externalId.value)
  appendIfSet(form, 'imageUrl', imageUrl.value)
  appendIfSet(form, 'backdropUrl', backdropUrl.value)
  for (const genre of genres.value) form.append('genres', genre)

  saving.value = true
  error.value = ''
  progress.value = 0
  try {
    const { data } = await api.post('/catalog-items/upload', form, {
      onUploadProgress: (event) => {
        if (event.total) progress.value = Math.round((event.loaded / event.total) * 100)
      },
    })
    emit('created', data)
    open.value = false
  } catch (requestError) {
    error.value = requestError.response?.data?.detail ?? requestError.response?.data?.error ?? 'Could not upload this file.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <q-dialog v-model="open">
    <q-card dark class="auth-card catalog-upload-card">
      <div class="row items-center justify-between q-mb-sm">
        <div class="auth-title q-mb-none">Add to {{ catalog?.name ?? 'catalog' }}</div>
        <q-btn
          v-if="metadataKind"
          flat
          dense
          color="primary"
          icon="travel_explore"
          label="Find metadata"
          :disable="!title.trim()"
          @click="metadataSearchOpen = true"
        />
      </div>
      <div class="text-caption text-grey-6 q-mb-md">Upload a file into this catalog’s folder.</div>
      <q-banner v-if="error" dense class="error-banner q-mb-md">{{ error }}</q-banner>

      <q-form class="column q-gutter-sm" @submit.prevent="upload">
        <q-file
          v-model="file"
          dark
          outlined
          dense
          clearable
          :accept="accept"
          label="Media file"
        >
          <template #prepend><q-icon name="upload_file" /></template>
        </q-file>

        <q-input v-model="title" dark outlined dense label="Title" required />
        <div class="row q-col-gutter-sm">
          <div class="col-4">
            <q-input v-model.number="year" dark outlined dense type="number" label="Year" :min="1800" :max="2200" />
          </div>
          <div class="col">
            <q-input v-model="contentRating" dark outlined dense label="Rating" placeholder="PG-13, TV-MA" />
          </div>
          <div class="col-4">
            <q-input v-model.number="rating" dark outlined dense type="number" label="Score /10" min="0" max="10" step="0.1" />
          </div>
        </div>
        <q-input v-model="originalTitle" dark outlined dense label="Original title" />
        <q-input v-model="overview" dark outlined dense type="textarea" autogrow label="Description" />

        <q-linear-progress v-if="saving" :value="progress / 100" color="primary" track-color="grey-8" rounded />
        <div class="row justify-end q-gutter-sm q-mt-sm">
          <q-btn flat dense color="grey-5" label="cancel" :disable="saving" @click="open = false" />
          <q-btn type="submit" unelevated color="primary" text-color="dark" icon="upload_file" label="upload" :loading="saving" />
        </div>
      </q-form>

      <MetadataSearchDialog
        v-if="metadataKind"
        v-model:open="metadataSearchOpen"
        :kind="metadataKind"
        :initial-query="title"
        @selected="useMetadata"
      />
    </q-card>
  </q-dialog>
</template>

<style scoped>
.catalog-upload-card {
  width: min(560px, 94vw);
  max-width: 94vw;
}
</style>
