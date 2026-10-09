<script setup>
import { ref, computed, watch } from 'vue'
import { useCatalogItems } from '../composables/useCatalogItems'
import MetadataSearchDialog from './MetadataSearchDialog.vue'

// Two-way bound: :open controls visibility; :item is the CatalogItem being edited. The
// dialog lets you rename an entry and set its own poster/backdrop/description. Artwork is
// always stored locally: tap the replace icon on an image to either pick a file from this
// device or paste a URL (the API fetches, verifies and stores a copy server-side).
const open = defineModel('open', { type: Boolean, required: true })
const item = defineModel('item', { type: Object })

const emit = defineEmits(['saved', 'deleted'])

const { updateItem, uploadItemArtwork, ingestItemArtwork, deleteItem, saveTags } = useCatalogItems()

const title = ref('')
const year = ref(null)
const overview = ref('')
const imageUrl = ref('')
const backdropUrl = ref('')
const sortTitle = ref('')
const originalTitle = ref('')
const originalAvailableAt = ref('')
const contentRating = ref('')
const itemRating = ref(null)
const tags = ref([])
const originalTagsJson = ref('')
const saving = ref(false)
const deleting = ref(false)
const error = ref('')
const activeTab = ref('details')

// Tag editor state (IMDb-style: genre/country/writer/director/producer).
const tagOptions = [
  { label: 'Genre', value: 'genre' },
  { label: 'Country', value: 'country' },
  { label: 'Writer', value: 'writer' },
  { label: 'Director', value: 'director' },
  { label: 'Producer', value: 'producer' },
]
const tagType = ref('genre')
const tagValue = ref('')
const metadataSearchOpen = ref(false)
const metadataConfirmOpen = ref(false)
const metadataCandidate = ref(null)
const metadataApplying = ref(false)
const metadataError = ref('')

const metadataKind = computed(() => ({
  movies: 'movie',
  'tv-shows': 'tv',
  music: 'music',
  podcasts: 'podcast',
  audiobooks: 'audiobook',
  books: 'book',
}[item.value?.catalogTypeSlug] ?? null))

// Artwork replace flow: pick the kind, then either a device file dialog or a URL to ingest.
const fileInput = ref(null)
const pendingFileKind = ref('poster')
const uploading = ref(false)
const replaceDialog = ref(false)
const replaceKind = ref('poster')
const urlDialog = ref(false)
const replaceUrl = ref('')
const urlIngesting = ref(false)
const urlError = ref('')

watch(() => open.value, (value) => {
  if (!value || !item.value) return
  title.value = item.value.title ?? ''
  year.value = item.value.year ?? null
  overview.value = item.value.overview ?? ''
  imageUrl.value = item.value.imageUrl ?? ''
  backdropUrl.value = item.value.backdropUrl ?? ''
  sortTitle.value = item.value.sortTitle ?? ''
  originalTitle.value = item.value.originalTitle ?? ''
  originalAvailableAt.value = item.value.originalAvailableAt ? String(item.value.originalAvailableAt).slice(0, 10) : ''
  contentRating.value = item.value.contentRating ?? ''
  itemRating.value = item.value.rating ?? null
  tags.value = (item.value.tags ?? []).map((tag) => ({ type: tag.type, value: tag.value }))
  originalTagsJson.value = JSON.stringify(tags.value)
  error.value = ''
  urlError.value = ''
  metadataError.value = ''
})

function openMetadataSearch() {
  metadataError.value = ''
  metadataCandidate.value = null
  metadataSearchOpen.value = true
}

function onMetadataSelected(candidate) {
  metadataCandidate.value = candidate
  metadataConfirmOpen.value = true
}

function metadataDate(value) {
  return value ? String(value).slice(0, 10) : ''
}

async function applyMetadata() {
  const metadata = metadataCandidate.value?.metadata
  if (!metadata || !item.value) return
  metadataApplying.value = true
  metadataError.value = ''
  try {
    let updated = item.value
    let posterStored = false
    let backdropStored = false
    if (metadata.artworkUrl) {
      try {
        updated = await ingestItemArtwork(item.value.id, 'poster', metadata.artworkUrl)
        posterStored = true
      } catch {
        // Keep the provider URL as a fallback if the server cannot cache this image.
      }
    }
    if (metadata.backdropUrl) {
      try {
        updated = await ingestItemArtwork(item.value.id, 'backdrop', metadata.backdropUrl)
        backdropStored = true
      } catch {
        // Keep the provider URL as a fallback if the server cannot cache this image.
      }
    }

    const payload = {
      title: metadata.title || metadataCandidate.value.result.title,
      overview: metadata.overview ?? overview.value,
      year: metadata.year ?? year.value,
      originalTitle: metadata.originalTitle ?? originalTitle.value,
      originalAvailableAt: metadata.originalAvailableAt
        ? metadataDate(metadata.originalAvailableAt)
        : originalAvailableAt.value,
      contentRating: metadata.contentRating ?? contentRating.value,
    }
    if (metadata.rating != null) payload.rating = metadata.rating
    if (metadata.artworkUrl && !posterStored) payload.imageUrl = metadata.artworkUrl
    if (metadata.backdropUrl && !backdropStored) payload.backdropUrl = metadata.backdropUrl
    updated = await updateItem(item.value.id, payload)

    if (metadata.genres?.length) {
      const retainedTags = (item.value.tags ?? []).filter((tag) => tag.type?.toLowerCase() !== 'genre')
      const genreTags = metadata.genres.map((value) => ({ type: 'genre', value }))
      tags.value = [...retainedTags, ...genreTags]
      updated = await saveTags(item.value.id, tags.value)
      originalTagsJson.value = JSON.stringify(tags.value)
    }

    item.value = updated
    title.value = updated.title ?? payload.title
    year.value = updated.year ?? payload.year
    overview.value = updated.overview ?? payload.overview
    imageUrl.value = updated.imageUrl ?? imageUrl.value
    backdropUrl.value = updated.backdropUrl ?? backdropUrl.value
    originalTitle.value = updated.originalTitle ?? payload.originalTitle
    originalAvailableAt.value = updated.originalAvailableAt ? metadataDate(updated.originalAvailableAt) : ''
    contentRating.value = updated.contentRating ?? payload.contentRating
    itemRating.value = updated.rating ?? itemRating.value
    emit('saved', updated)
    metadataConfirmOpen.value = false
  } catch (requestError) {
    metadataError.value = requestError.response?.data?.detail ?? 'Could not update this item with the selected metadata.'
  } finally {
    metadataApplying.value = false
  }
}

const kindLabel = (kind) => (kind === 'poster' ? 'poster' : 'backdrop')

function askReplace(kind) {
  replaceKind.value = kind
  replaceDialog.value = true
}

function pickFromDevice() {
  replaceDialog.value = false
  pendingFileKind.value = replaceKind.value
  fileInput.value?.click()
}

function onFilePicked(event) {
  const file = event.target.files?.[0]
  event.target.value = '' // allow picking the same file again
  if (!file) return
  uploadFromFile(pendingFileKind.value, file)
}

async function uploadFromFile(kind, file) {
  uploading.value = kind
  error.value = ''
  try {
    const updated = await uploadItemArtwork(item.value.id, kind, file)
    applyArtwork(updated, kind)
    emit('saved', updated)
  } catch (e) {
    error.value = e.response?.data?.detail ?? e.response?.data?.error ?? e.message
  } finally {
    uploading.value = ''
  }
}

function openUrlDialog() {
  replaceDialog.value = false
  replaceUrl.value = ''
  urlError.value = ''
  urlDialog.value = true
}

async function ingestUrl() {
  const url = replaceUrl.value.trim()
  if (!url) {
    urlError.value = 'Paste an image URL.'
    return
  }
  urlIngesting.value = true
  urlError.value = ''
  try {
    const updated = await ingestItemArtwork(item.value.id, replaceKind.value, url)
    applyArtwork(updated, replaceKind.value)
    emit('saved', updated)
    urlDialog.value = false
  } catch (e) {
    urlError.value = e.response?.data?.detail ?? e.response?.data?.error ?? e.message
  } finally {
    urlIngesting.value = false
  }
}

function applyArtwork(updated, kind) {
  if (kind === 'backdrop') backdropUrl.value = updated.backdropUrl ?? ''
  else imageUrl.value = updated.imageUrl ?? ''
}

async function clearArtwork(kind) {
  error.value = ''
  try {
    const updated = await updateItem(item.value.id, kind === 'backdrop' ? { backdropUrl: '' } : { imageUrl: '' })
    applyArtwork(updated, kind)
    emit('saved', updated)
  } catch (e) {
    error.value = e.response?.data?.detail ?? e.response?.data?.error ?? e.message
  }
}

function addTag() {
  const type = tagType.value
  const value = tagValue.value.trim()
  if (!value) return
  if (!tags.value.some((tag) => tag.type === type && tag.value.toLowerCase() === value.toLowerCase())) {
    tags.value.push({ type, value })
  }
  tagValue.value = ''
}

function removeTag(tag) {
  const index = tags.value.indexOf(tag)
  if (index !== -1) tags.value.splice(index, 1)
}

const tagGroups = computed(() =>
  tagOptions.map((option) => ({
    ...option,
    items: tags.value.filter((tag) => tag.type === option.value),
  })))

async function save() {
  if (!title.value.trim()) {
    error.value = 'A title is required.'
    return
  }
  saving.value = true
  error.value = ''
  try {
    const payload = {
      title: title.value.trim(),
      sortTitle: sortTitle.value.trim() || '',
      originalTitle: originalTitle.value.trim() || '',
      originalAvailableAt: originalAvailableAt.value || '',
      contentRating: contentRating.value.trim() || '',
      ...(overview.value ? { overview: overview.value.trim() } : { overview: '' }),
      ...(year.value ? { year } : { year: null }),
      ...(itemRating.value != null && itemRating.value !== '' ? { rating: Number(itemRating.value) } : {}),
    }
    const updated = await updateItem(item.value.id, payload)
    if (JSON.stringify(tags.value) !== originalTagsJson.value) {
      await saveTags(item.value.id, tags.value)
    }
    emit('saved', updated)
    open.value = false
  } catch (e) {
    error.value = e.response?.data?.detail ?? e.response?.data?.error ?? e.message
  } finally {
    saving.value = false
  }
}

async function remove() {
  deleting.value = true
  error.value = ''
  try {
    await deleteItem(item.value.id)
    emit('deleted', item.value.id)
    open.value = false
  } catch (e) {
    error.value = e.response?.data?.detail ?? e.response?.data?.error ?? e.message
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <q-dialog v-model="open">
    <q-card dark class="auth-card item-dialog-card">
      <div class="row items-center justify-between q-mb-sm">
        <div class="auth-title q-mb-none">Edit item</div>
        <q-btn
          v-if="metadataKind"
          flat
          dense
          color="primary"
          icon="travel_explore"
          label="Find metadata"
          title="Search metadata providers"
          @click="openMetadataSearch"
        />
      </div>
      <q-banner v-if="error" dense class="error-banner q-mb-md">{{ error }}</q-banner>
      <q-banner v-if="metadataError" dense class="error-banner q-mb-md">{{ metadataError }}</q-banner>

      <q-form class="column q-gutter-sm" @submit.prevent="save">
        <q-tabs
          v-model="activeTab"
          dense
          align="left"
          class="item-tabs"
          active-color="primary"
          indicator-color="primary"
          narrow-indicator
        >
          <q-tab name="details" icon="info" label="Details" />
          <q-tab name="tags" icon="local_offer" label="Tags" />
        </q-tabs>

        <q-tab-panels v-model="activeTab" animated dark class="item-tab-panels">
          <q-tab-panel name="details" class="q-pa-none">
            <div class="column" style="gap: 16px">
              <div class="row item-art-row" style="gap: 10px">
                <div class="col">
                  <div class="item-art-label">Poster</div>
                  <div class="item-art-wrap">
                    <q-img :src="imageUrl || undefined" fit="cover" class="item-art-preview">
                      <template #error>
                        <div class="flex flex-center item-art-fallback">
                          <q-icon name="movie" size="1.6rem" color="grey-6" />
                        </div>
                      </template>
                    </q-img>
                    <q-btn
                      round
                      dense
                      unelevated
                      color="dark"
                      text-color="primary"
                      icon="swap_horiz"
                      size="sm"
                      class="art-btn art-btn-replace"
                      title="Replace poster"
                      :loading="uploading === 'poster'"
                      @click="askReplace('poster')"
                    />
                    <q-btn
                      round
                      dense
                      unelevated
                      color="dark"
                      text-color="negative"
                      icon="delete_outline"
                      size="sm"
                      class="art-btn art-btn-clear"
                      title="Remove poster"
                      :disable="!imageUrl"
                      @click="clearArtwork('poster')"
                    />
                  </div>
                </div>

                <div class="col">
                  <div class="item-art-label">Backdrop</div>
                  <div class="item-art-wrap">
                    <q-img :src="backdropUrl || undefined" fit="cover" class="item-art-preview">
                      <template #error>
                        <div class="flex flex-center item-art-fallback">
                          <q-icon name="image" size="1.6rem" color="grey-6" />
                        </div>
                      </template>
                    </q-img>
                    <q-btn
                      round
                      dense
                      unelevated
                      color="dark"
                      text-color="primary"
                      icon="swap_horiz"
                      size="sm"
                      class="art-btn art-btn-replace"
                      title="Replace backdrop"
                      :loading="uploading === 'backdrop'"
                      @click="askReplace('backdrop')"
                    />
                    <q-btn
                      round
                      dense
                      unelevated
                      color="dark"
                      text-color="negative"
                      icon="delete_outline"
                      size="sm"
                      class="art-btn art-btn-clear"
                      title="Remove backdrop"
                      :disable="!backdropUrl"
                      @click="clearArtwork('backdrop')"
                    />
                  </div>
                </div>
              </div>

              <div class="row" style="gap: 10px">
                <div class="col">
                  <q-input v-model="title" dark outlined dense label="Title (rename)" required hint="Displayed in the catalog; the file on disk stays untouched" />
                </div>
                <div class="col-6 col-sm-4">
                  <q-input v-model.number="year" dark outlined dense type="number" label="Year (optional)" :min="1800" :max="2200" />
                </div>
              </div>
              <q-input
                v-model="sortTitle"
                dark
                outlined
                dense
                label="Sort title (optional)"
                hint="Sorts under this instead of Title — e.g. “The Hook” as “Hook” so it lists under H"
              />
              <div class="row" style="gap: 10px">
                <div class="col">
                  <q-input
                    v-model="originalTitle"
                    dark
                    outlined
                    dense
                    label="Original title (optional)"
                  />
                </div>
                <div class="col-6 col-sm-4">
                  <q-input
                    v-model="originalAvailableAt"
                    dark
                    outlined
                    dense
                    type="date"
                    label="Original available date (optional)"
                  />
                </div>
              </div>
              <div class="row" style="gap: 10px">
                <div class="col">
                  <q-input
                    v-model="contentRating"
                    dark
                    outlined
                    dense
                    label="Content rating (optional)"
                    placeholder="e.g. PG-13, TV-MA"
                  />
                </div>
                <div class="col-6 col-sm-4">
                  <q-input
                    v-model.number="itemRating"
                    dark
                    outlined
                    dense
                    type="number"
                    label="Official rating /10 (optional)"
                    min="0"
                    max="10"
                    step="0.1"
                    placeholder="e.g. 8.4"
                  />
                </div>
              </div>
              <q-input
                v-model="overview"
                dark
                outlined
                dense
                type="textarea"
                autogrow
                label="Description (optional)"
              />
            </div>
          </q-tab-panel>

          <q-tab-panel name="tags" class="q-pa-none">
            <div class="column" style="gap: 16px">
              <div class="row items-center" style="gap: 10px">
                <div class="col-6 col-sm-4">
                  <q-select
                    v-model="tagType"
                    :options="tagOptions"
                    dark
                    outlined
                    dense
                    emit-value
                    map-options
                    label="Type"
                  />
                </div>
                <div class="col">
                  <q-input
                    v-model="tagValue"
                    dark
                    outlined
                    dense
                    label="Value"
                    placeholder="e.g. Action, USA, Tarantino"
                    @keyup.enter="addTag"
                  />
                </div>
                <q-btn flat round dense icon="add" color="primary" aria-label="Add tag" title="Add tag" @click="addTag" />
              </div>

              <template v-if="tagGroups.some((group) => group.items.length)">
                <div v-for="group in tagGroups" :key="group.value" class="column" style="gap: 8px">
                  <div class="tag-group-title">{{ group.label }}</div>
                  <div v-if="group.items.length" class="row tag-chips" style="gap: 6px">
                    <q-chip
                      v-for="(tag, index) in group.items"
                      :key="`${tag.type}:${tag.value}:${index}`"
                      removable
                      color="dark"
                      text-color="primary"
                      @remove="removeTag(tag)"
                    >
                      {{ tag.value }}
                    </q-chip>
                  </div>
                </div>
              </template>
              <div v-else class="text-grey-6" style="font-size: 0.8rem">No tags yet — add a Genre, Country, Writer, Director or Producer tag above.</div>
              <div class="text-grey-6" style="font-size: 0.75rem">
                Tags are grouped by type and can drive future browsing and filtering. New tags land under the type selected above.
              </div>
            </div>
          </q-tab-panel>
        </q-tab-panels>

        <div class="row items-center justify-between">
          <q-btn flat dense color="negative" icon="delete" label="remove" :loading="deleting" @click="remove" />
          <div class="row items-center" style="gap: 10px">
            <q-btn flat dense color="grey-5" label="cancel" @click="open = false" />
            <q-btn type="submit" unelevated color="primary" text-color="dark" :loading="saving" label="save changes" />
          </div>
        </div>
      </q-form>

      <input ref="fileInput" type="file" accept="image/*" class="art-file-input" @change="onFilePicked" />
    </q-card>
  </q-dialog>

  <MetadataSearchDialog
    v-model:open="metadataSearchOpen"
    :kind="metadataKind"
    :initial-query="title"
    @selected="onMetadataSelected"
  />

  <q-dialog v-model="metadataConfirmOpen">
    <q-card dark class="auth-card metadata-confirm-card">
      <div class="auth-title">Update this item with these details?</div>
      <q-banner v-if="metadataError" dense class="error-banner q-mb-md">{{ metadataError }}</q-banner>
      <div v-if="metadataCandidate" class="row items-center q-gutter-md q-mb-md">
        <q-img
          :src="metadataCandidate.metadata.artworkUrl ?? undefined"
          fit="cover"
          class="metadata-confirm-poster"
        />
        <div class="col">
          <div class="text-weight-bold">{{ metadataCandidate.metadata.title }}</div>
          <div class="text-caption text-grey-5">
            {{ metadataCandidate.metadata.year ?? 'Year unknown' }} · {{ metadataCandidate.result.providerId }}
          </div>
          <div class="text-caption text-grey-5 metadata-confirm-overview">
            {{ metadataCandidate.metadata.overview }}
          </div>
        </div>
      </div>
      <div class="text-caption text-grey-6 q-mb-md">This updates the catalog metadata; your uploaded file stays unchanged.</div>
      <div class="row justify-end q-gutter-sm">
        <q-btn flat dense color="grey-5" label="cancel" @click="metadataConfirmOpen = false" />
        <q-btn
          unelevated
          color="primary"
          text-color="dark"
          label="Update item"
          :loading="metadataApplying"
          @click="applyMetadata"
        />
      </div>
    </q-card>
  </q-dialog>

  <!-- replace: local file or URL? -->
  <q-dialog v-model="replaceDialog">
    <q-card dark class="auth-card replace-dialog-card">
      <div class="auth-title">Replace {{ kindLabel(replaceKind) }}</div>
      <div class="text-grey-5 q-mb-md" style="font-size: 0.9rem">Chosen art is stored on this server, never linked.</div>
      <div class="column q-gutter-sm">
        <q-btn unelevated color="primary" text-color="dark" icon="upload_file" label="From my device" @click="pickFromDevice" />
        <q-btn outline color="primary" icon="link" label="From a URL" @click="openUrlDialog" />
      </div>
      <div class="row justify-end q-mt-sm">
        <q-btn flat dense color="grey-5" label="cancel" @click="replaceDialog = false" />
      </div>
    </q-card>
  </q-dialog>

  <!-- replace from a URL: server fetches, verifies, stores a local copy -->
  <q-dialog v-model="urlDialog">
    <q-card dark class="auth-card replace-dialog-card">
      <div class="auth-title">Add {{ kindLabel(replaceKind) }} from a URL</div>
      <q-banner v-if="urlError" dense class="error-banner q-mb-md">{{ urlError }}</q-banner>
      <q-input v-model="replaceUrl" dark outlined dense type="url" label="Image URL (https://…)" autofocus @keyup.enter="ingestUrl" />
      <div class="row q-gutter-sm justify-end q-mt-sm">
        <q-btn flat dense color="grey-5" label="cancel" @click="urlDialog = false" />
        <q-btn unelevated color="primary" text-color="dark" icon="cloud_sync" :loading="urlIngesting" label="fetch &amp; store" @click="ingestUrl" />
      </div>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.item-dialog-card {
  padding: 1.25rem;
  width: 80vw;
  max-width: 80vw;
  height: 80vh;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}
.item-dialog-card .q-form {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.item-tabs {
  border-bottom: 1px solid #1a2333;
  margin-bottom: 4px;
  flex: 0 0 auto;
}
.item-tabs .q-tab {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  min-height: 36px;
}
.item-tabs .q-tab__icon {
  font-size: 1.05rem;
  margin-right: 4px;
}
.item-tab-panels {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  background: transparent;
}
.item-tab-panels.q-tab-panels > .q-tab-panel {
  padding: 10px 0;
}
.item-art-row {
  align-items: stretch;
}
.item-art-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #64748b;
  margin-bottom: 4px;
}
.item-art-wrap {
  position: relative;
}
.item-art-preview {
  width: 100%;
  height: 140px;
  border-radius: 8px;
  background: #1a2333;
}
.item-art-fallback {
  width: 100%;
  height: 100%;
  background: #1a2333;
}
.art-btn {
  position: absolute;
  top: 6px;
  z-index: 2;
}
.art-btn-replace {
  left: 6px;
}
.art-btn-clear {
  right: 6px;
}
.art-file-input {
  display: none;
}
.tag-chips {
  margin-top: 4px;
  margin-bottom: 8px;
}
.tag-group-title {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #64748b;
  margin-bottom: 2px;
}
.replace-dialog-card {
  padding: 1.25rem;
  min-width: 320px;
  max-width: 400px;
  width: 90vw;
}

.metadata-confirm-card {
  padding: 1.25rem;
  min-width: 320px;
  max-width: 520px;
  width: 90vw;
}

.metadata-confirm-poster {
  width: 70px;
  height: 105px;
  border-radius: 5px;
  background: #1a2333;
}

.metadata-confirm-overview {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
}
</style>
