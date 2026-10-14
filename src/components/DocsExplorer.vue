<script setup>
import { computed, ref, watch } from 'vue'
import { Notify } from 'quasar'
import { api } from '../composables/useApi'

const props = defineProps({
  catalog: { type: Object, required: true },
  canEditCatalogs: { type: Boolean, default: false },
})
const emit = defineEmits(['add-document', 'open-document'])

const entries = ref([])
const currentPath = ref('')
const search = ref('')
const loading = ref(false)
const error = ref('')
const toolset = ref(null)
const uploadInput = ref(null)

const breadcrumbs = computed(() => {
  const parts = currentPath.value.split('/').filter(Boolean)
  return [{ label: props.catalog.name, path: '' }, ...parts.map((part, index) => ({
    label: part,
    path: parts.slice(0, index + 1).join('/'),
  }))]
})
const filteredEntries = computed(() => entries.value.filter(entry =>
  entry.name.toLocaleLowerCase().includes(search.value.toLocaleLowerCase())))

watch(() => props.catalog.id, () => {
  currentPath.value = ''
  search.value = ''
  void loadFolder()
  void loadTools()
}, { immediate: true })

function docsUrl(path = '') {
  const suffix = path ? `?path=${encodeURIComponent(path)}` : ''
  return `/catalogs/${encodeURIComponent(props.catalog.id)}/docs${suffix}`
}

function contentUrl(path) {
  const encoded = path.split('/').map(segment => encodeURIComponent(segment)).join('/')
  return `/catalogs/${encodeURIComponent(props.catalog.id)}/docs/content/${encoded}`
}

async function loadFolder(path = currentPath.value) {
  loading.value = true
  error.value = ''
  try {
    const { data } = await api.get(docsUrl(path))
    entries.value = data
    currentPath.value = path
    search.value = ''
  } catch (requestError) {
    error.value = requestError.response?.data?.detail ?? requestError.response?.data?.error ?? 'Could not load this Docs folder.'
  } finally {
    loading.value = false
  }
}

async function loadTools() {
  try {
    const { data } = await api.get('/document-tools/status')
    toolset.value = data
  } catch {
    toolset.value = null
  }
}

function parentFolder() {
  const parts = currentPath.value.split('/').filter(Boolean)
  parts.pop()
  void loadFolder(parts.join('/'))
}

async function openEntry(entry) {
  if (entry.isDirectory) {
    void loadFolder(entry.path)
    return
  }

  const extension = entry.name.split('.').pop()?.toLowerCase() ?? ''
  const toolId = toolForExtension(extension)
  const tool = toolset.value?.tools?.find(candidate => candidate.id === toolId)
  if (toolId && tool?.ready) {
    emit('open-document', { catalog: props.catalog, entry, tool })
    return
  }
  if (toolId) {
    Notify.create({ type: 'warning', message: `${toolset.value?.message ?? 'Document tools are still preparing.'} Open Doc Tools from the navigation to check their status.` })
    return
  }

  try {
    const { data } = await api.get(contentUrl(entry.path), { responseType: 'blob' })
    const objectUrl = URL.createObjectURL(data)
    const opened = window.open(objectUrl, '_blank')
    if (!opened) {
      URL.revokeObjectURL(objectUrl)
      Notify.create({ type: 'warning', message: 'Allow pop-ups to open this document.' })
      return
    }
    opened.opener = null
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
  } catch (requestError) {
    Notify.create({ type: 'negative', message: requestError.response?.data?.detail ?? 'Could not open this document.' })
  }
}

function toolForExtension(extension) {
  if (['xlsx', 'xls', 'xlsm', 'ods', 'csv', 'tsv'].includes(extension)) return 'gridcraft'
  if (extension === 'pdf') return 'pdfcraft'
  if (['pptx', 'ppsx', 'potx', 'deckcraft', 'slidecraft'].includes(extension)) return 'deckcraft'
  if (['doc', 'docx', 'odt', 'rtf', 'txt', 'md'].includes(extension)) return 'wordcraft'
  return null
}

function fileIcon(name) {
  const extension = name.split('.').pop()?.toLowerCase()
  if (['doc', 'docx', 'odt', 'rtf'].includes(extension)) return 'article'
  if (['xls', 'xlsx', 'xlsm', 'ods', 'csv', 'tsv'].includes(extension)) return 'table_chart'
  if (['pptx', 'ppsx', 'potx', 'deckcraft', 'slidecraft'].includes(extension)) return 'slideshow'
  if (extension === 'pdf') return 'picture_as_pdf'
  return 'description'
}

function fileSize(size) {
  if (size == null) return '—'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function fileDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function chooseUpload() {
  if (props.canEditCatalogs) uploadInput.value?.click()
}

async function uploadDocument(event) {
  const input = event.target
  const file = input.files?.[0]
  if (!file) return
  const targetPath = currentPath.value ? `${currentPath.value}/${file.name}` : file.name
  try {
    await api.put(contentUrl(targetPath), file, { headers: { 'Content-Type': 'application/octet-stream' } })
    await loadFolder()
    Notify.create({ type: 'positive', message: `Added ${file.name} to ${props.catalog.name}.` })
  } catch (requestError) {
    Notify.create({ type: 'negative', message: requestError.response?.data?.detail ?? requestError.response?.data?.error ?? `Could not add ${file.name}.` })
  } finally {
    input.value = ''
  }
}
</script>

<template>
  <section class="docs-explorer">
    <header class="docs-explorer-toolbar">
      <div class="docs-breadcrumbs">
        <template v-for="(crumb, index) in breadcrumbs" :key="crumb.path || 'root'">
          <q-icon v-if="index" name="chevron_right" size="16px" class="text-grey-6" />
          <button class="docs-crumb" :class="{ 'docs-crumb--active': index === breadcrumbs.length - 1 }" @click="loadFolder(crumb.path)">
            {{ crumb.label }}
          </button>
        </template>
      </div>
      <q-space />
      <q-input v-model="search" dense outlined clearable placeholder="Search this folder" class="docs-search">
        <template #prepend><q-icon name="search" /></template>
      </q-input>
      <q-btn v-if="currentPath" flat dense no-caps icon="arrow_upward" label="Up" @click="parentFolder" />
      <q-btn flat round dense icon="refresh" aria-label="Refresh folder" @click="loadFolder()" />
      <q-btn v-if="canEditCatalogs" flat dense no-caps icon="upload_file" label="Add document" @click="chooseUpload" />
      <input ref="uploadInput" class="docs-upload-input" type="file" accept=".pdf,.doc,.docx,.odt,.rtf,.txt,.md,.csv,.xls,.xlsx,.ppt,.pptx,.odp,.ods" @change="uploadDocument" />
    </header>

    <div v-if="error" class="error-banner q-mb-md">{{ error }}</div>
    <div v-if="loading && !entries.length" class="docs-explorer-empty"><q-spinner-dots color="primary" size="36px" /></div>
    <div v-else-if="filteredEntries.length" class="docs-file-list">
      <div class="docs-file-header"><span>Name</span><span>Modified</span><span>Size</span><span /></div>
      <button v-for="entry in filteredEntries" :key="entry.path" class="docs-file-row" @click="openEntry(entry)">
        <span class="docs-file-title">
          <q-icon :name="entry.isDirectory ? 'folder' : fileIcon(entry.name)" :color="entry.isDirectory ? 'amber-8' : 'primary'" size="20px" />
          <span>{{ entry.name }}</span>
        </span>
        <span class="docs-file-date">{{ fileDate(entry.modifiedAt) }}</span>
        <span class="docs-file-size">{{ entry.isDirectory ? '—' : fileSize(entry.size) }}</span>
        <q-icon :name="entry.isDirectory ? 'chevron_right' : 'open_in_new'" class="text-grey-6" />
      </button>
    </div>
    <div v-else class="docs-explorer-empty">
      <q-icon :name="search ? 'search_off' : 'folder_open'" size="42px" color="grey-7" />
      <strong>{{ search ? 'No matching documents' : 'This folder is empty' }}</strong>
      <span>{{ search ? 'Try another name.' : 'Add documents here or connect a provider.' }}</span>
    </div>

    <footer class="docs-explorer-footer">
      <span>{{ filteredEntries.length }} items</span>
      <q-space />
      <span class="text-grey-6">{{ props.catalog.path }}{{ currentPath ? `/${currentPath}` : '' }}</span>
    </footer>

  </section>
</template>

<style scoped>
.docs-explorer { display: flex; min-width: 0; flex-direction: column; gap: 12px; }
.docs-explorer-toolbar { display: flex; min-width: 0; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid #263348; border-radius: 10px; background: #0e1525; }
.docs-breadcrumbs { display: flex; min-width: 0; align-items: center; gap: 4px; overflow: hidden; }
.docs-crumb { overflow: hidden; border: 0; background: transparent; color: #a9b7ca; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.docs-crumb--active { color: #f1f4f8; font-weight: 600; }
.docs-search { flex: 0 1 260px; min-width: 140px; }
.docs-upload-input { display: none; }
.docs-file-list { overflow: hidden; border: 1px solid #263348; border-radius: 10px; background: #0e1525; }
.docs-file-header,.docs-file-row { display: grid; grid-template-columns: minmax(0, 1fr) 190px 100px 26px; align-items: center; gap: 12px; padding: 10px 14px; }
.docs-file-header { border-bottom: 1px solid #263348; color: #8190a5; font-size: .75rem; text-transform: uppercase; }
.docs-file-row { width: 100%; border: 0; border-bottom: 1px solid rgba(38,51,72,.55); background: transparent; color: #e2e8f0; text-align: left; cursor: pointer; }
.docs-file-row:last-child { border-bottom: 0; }
.docs-file-row:hover,.docs-file-row:focus-visible { background: #172235; outline: 0; }
.docs-file-title { display: flex; min-width: 0; align-items: center; gap: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.docs-file-date,.docs-file-size { color: #94a3b8; font-size: .8rem; }
.docs-explorer-empty { display: flex; min-height: 220px; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: #91a0b4; }
.docs-explorer-empty strong { color: #d5deea; }
.docs-explorer-footer { display: flex; gap: 8px; color: #94a3b8; font-size: .8rem; }
@media (max-width: 700px) {
  .docs-explorer-toolbar { flex-wrap: wrap; padding: 8px; }
  .docs-breadcrumbs { flex: 1 1 100%; }
  .docs-search { flex: 1 1 160px; }
  .docs-file-header,.docs-file-row { grid-template-columns: minmax(0, 1fr) 80px 50px 22px; gap: 6px; padding: 9px 8px; }
  .docs-file-date,.docs-file-size { font-size: .68rem; }
}
</style>
