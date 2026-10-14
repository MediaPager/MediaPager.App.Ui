<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Notify } from 'quasar'
import { api, apiOrigin } from '../composables/useApi'

const open = defineModel('open', { type: Boolean, required: true })
const props = defineProps({
  catalog: { type: Object, default: null },
  entry: { type: Object, default: null },
  tool: { type: Object, default: null },
})

const toolIds = ['wordcraft', 'gridcraft', 'pdfcraft', 'deckcraft']
const canvasIds = {
  wordcraft: 'wordcraft_canvas',
  gridcraft: 'gridcraft_canvas',
  pdfcraft: 'pdfcraft',
  deckcraft: 'deckcraft_canvas',
}
const loadingIds = {
  wordcraft: 'wordcraft_loading',
  gridcraft: 'gridcraft_loading',
  deckcraft: 'deckcraft_loading',
}

const message = ref('')
const busy = ref(false)
const dirty = ref(false)
const saving = ref(false)
const currentName = ref('')
const serverPath = ref(null)
const savedOnce = ref(false)
const autoSave = ref(false)
const activeToolId = ref('wordcraft')
const hostPickerOpen = ref(false)
const pickerMode = ref('source')
const pickerEntries = ref([])
const pickerPath = ref('')
const pickerSearch = ref('')
const pickerLoading = ref(false)
const pickerError = ref('')
const pendingEditorInput = ref(null)
const pendingAccept = ref('')
const pendingMultiple = ref(false)
const selectedPickerEntries = ref([])
const localInput = ref(null)
const saveStatus = computed(() => saving.value ? 'Saving…' : dirty.value ? 'Unsaved changes' : savedOnce.value ? 'Saved' : 'Not saved yet')
const pickerBreadcrumbs = computed(() => {
  const parts = pickerPath.value.split('/').filter(Boolean)
  return parts.map((name, index) => ({ name, path: parts.slice(0, index + 1).join('/') }))
})
const browsablePickerEntries = computed(() => pickerEntries.value.filter(entry =>
  entry.isDirectory || supportsAccept(entry.name, pendingAccept.value)))
const filteredPickerEntries = computed(() => browsablePickerEntries.value.filter(entry =>
  entry.name.toLowerCase().includes(pickerSearch.value.toLowerCase())))

const loadedTools = new Set()
let observedDocument = null
let inputClickListener = null
let downloadClickListener = null
let editKeyListener = null
let dropListener = null
let saveResolver = null
let savePromise = null
let dirtyTimer = 0
let autosaveTimer = 0
let localSaveHandle = null
let originalSavePicker
let saveBridgeInstalled = false
let originalMatchMedia
let documentOpened = false
let sendingSyntheticDrop = false

watch([open, () => props.entry, () => props.tool], ([isOpen, entry, tool]) => {
  if (!isOpen || !entry) return
  currentName.value = entry.name
  serverPath.value = entry.path
  dirty.value = false
  savedOnce.value = true
  busy.value = true
  message.value = `Starting ${tool?.name ?? 'document'}…`
  activeToolId.value = toolIdFor(tool?.id)
  documentOpened = false
  autoSave.value = false
  localSaveHandle = null
  void openCatalogDocument()
}, { immediate: true })

function toolIdFor(id) {
  return toolIds.includes(id) ? id : 'wordcraft'
}

async function openCatalogDocument() {
  if (!props.entry || !props.catalog || documentOpened) return
  documentOpened = true
  const toolId = toolIdFor(props.tool?.id)
  activeToolId.value = toolId
  busy.value = true
  message.value = `Opening ${props.entry.name}…`
  try {
    installSaveBridge()
    observeEditorDocument()
    startDirtyProbe()
    const { data } = await api.get(contentUrl(props.entry.path), { responseType: 'blob' })
    const file = new File([data], props.entry.name, { type: data.type || 'application/octet-stream' })
    installHostColorScheme()
    await loadEditor(toolId)
    await deliverFiles([file], props.entry.path)
    message.value = ''
  } catch (error) {
    documentOpened = false
    message.value = error.response?.data?.detail ?? error.message ?? 'Could not open this document.'
  } finally {
    busy.value = false
  }
}

async function loadEditor(toolId) {
  if (loadedTools.has(toolId)) return
  const editorUrl = props.tool?.editorUrl ?? `/tools/docs/${toolId}/index.html`
  const indexUrl = new URL(editorUrl, apiOrigin())
  const response = await fetch(indexUrl)
  if (!response.ok) throw new Error(`${props.tool?.name ?? 'The editor'} bundle returned HTTP ${response.status}.`)
  const html = await response.text()
  const moduleScript = html.match(/<script\b[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/i)?.[1]
  if (!moduleScript) throw new Error('The editor bundle has no WebAssembly loader script.')

  const javascriptPath = moduleScript.match(/\bfrom\s+["']([^"']+\.js)["']/i)?.[1]
  const wasmPath = moduleScript.match(/module_or_path\s*:\s*["']([^"']+\.wasm)["']/i)?.[1]
  if (!javascriptPath || !wasmPath) throw new Error('The editor bundle loader did not identify its JavaScript and WebAssembly assets.')

  // Load the fork's generated wasm-bindgen module directly in MediaPager's document.
  // This keeps the canvas and its drag/drop events in the same origin as the host UI.
  const bindings = await import(new URL(javascriptPath, indexUrl).toString())
  const wasm = await bindings.default({ module_or_path: new URL(wasmPath, indexUrl).toString() })
  window.wasmBindings = bindings
  window.dispatchEvent(new CustomEvent('TrunkApplicationStarted', { detail: { wasm } }))
  await waitForEditor(toolId)
  loadedTools.add(toolId)
}

async function waitForEditor(toolId) {
  const loadingId = loadingIds[toolId]
  if (!loadingId) {
    // PdfCraft's current web shell has no loading element; give its async WebRunner setup
    // time to attach before delivering the document.
    await new Promise(resolve => window.setTimeout(resolve, 1200))
    return
  }

  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const loading = document.getElementById(loadingId)
    if (!loading) return
    if (/failed to start|could not start/i.test(loading.textContent ?? ''))
      throw new Error(loading.textContent.trim())
    await new Promise(resolve => window.setTimeout(resolve, 100))
  }
  throw new Error(`${props.tool?.name ?? 'The editor'} took too long to start.`)
}

function observeEditorDocument() {
  const editorDocument = document
  if (observedDocument === editorDocument) return
  if (observedDocument && downloadClickListener) observedDocument.removeEventListener('click', downloadClickListener, true)
  if (observedDocument && editKeyListener) observedDocument.removeEventListener('keydown', editKeyListener, true)
  observedDocument = editorDocument

  inputClickListener = event => {
    const target = event.target
    if (target?.tagName !== 'INPUT' || target.type !== 'file') return
    if (target === localInput.value) return
    event.preventDefault()
    if (pendingEditorInput.value) return
    pendingEditorInput.value = target
    pendingAccept.value = target.accept
    pendingMultiple.value = target.multiple
    selectedPickerEntries.value = []
    pickerMode.value = 'source'
    hostPickerOpen.value = true
  }
  downloadClickListener = event => {
    const anchor = event.target?.closest?.('a[download]')
    if (!anchor || !anchor.download || !serverPath.value || !sameExtension(anchor.download, currentName.value)) return
    event.preventDefault()
    void saveBlobUrl(anchor.href, siblingPath(serverPath.value, anchor.download))
  }
  editKeyListener = event => {
    if (activeToolId.value === 'wordcraft') return
    if (event.key.length === 1 || ['Backspace', 'Delete', 'Enter'].includes(event.key)) dirty.value = true
    else if ((event.ctrlKey || event.metaKey) && ['b', 'i', 'u', 'v', 'x', 'z', 'y'].includes(event.key.toLowerCase())) dirty.value = true
  }
  dropListener = () => {
    if (sendingSyntheticDrop) return
    serverPath.value = null
    savedOnce.value = false
    localSaveHandle = null
    dirty.value = false
  }
  editorDocument.addEventListener('click', inputClickListener, true)
  editorDocument.addEventListener('click', downloadClickListener, true)
  editorDocument.addEventListener('keydown', editKeyListener, true)
  editorDocument.addEventListener('drop', dropListener, true)
}

function installSaveBridge() {
  if (saveBridgeInstalled) return
  originalSavePicker = window.showSaveFilePicker?.bind(window)
  window.showSaveFilePicker = async options => {
    const path = serverPath.value
    if (!path) {
      if (localSaveHandle) return wrapLocalHandle(localSaveHandle)
      if (!originalSavePicker) throw new Error('This browser does not support saving files to this device.')
      localSaveHandle = await originalSavePicker(options)
      return wrapLocalHandle(localSaveHandle)
    }

    const name = (options?.suggestedName || currentName.value).split(/[\\/]/).pop()
    const destination = siblingPath(path, name)
    const chunks = []
    return {
      name,
      createWritable: async () => ({
        write: async data => { chunks.push(data) },
        close: async () => {
          await api.put(contentUrl(destination), new Blob(chunks), { headers: { 'Content-Type': 'application/octet-stream' } })
          serverPath.value = destination
          currentName.value = name
          markSaved()
        },
      }),
    }
  }
  saveBridgeInstalled = true
}

function installHostColorScheme() {
  if (originalMatchMedia) return
  originalMatchMedia = window.matchMedia.bind(window)
  const hostIsDark = document.body.classList.contains('body--dark')
  window.matchMedia = query => {
    const media = originalMatchMedia(query)
    if (!/prefers-color-scheme/i.test(query)) return media
    const darkQuery = /prefers-color-scheme\s*:\s*dark/i.test(query)
    const lightQuery = /prefers-color-scheme\s*:\s*light/i.test(query)
    const matches = darkQuery ? hostIsDark : lightQuery ? !hostIsDark : media.matches
    // Preserve the native MediaQueryList as the proxy target so wasm-bindgen can still
    // cast it to MediaQueryList, while reporting MediaPager's Quasar appearance.
    return new Proxy(media, {
      get(target, property) {
        if (property === 'matches') return matches
        const value = Reflect.get(target, property, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  }
}

function docsUrl(path = '') {
  const query = path ? `?path=${encodeURIComponent(path)}` : ''
  return `/catalogs/${encodeURIComponent(props.catalog.id)}/docs${query}`
}

async function browseDocsFolder(path = pickerPath.value) {
  pickerLoading.value = true
  pickerError.value = ''
  try {
    const { data } = await api.get(docsUrl(path))
    pickerEntries.value = data
    pickerPath.value = path
    pickerSearch.value = ''
    selectedPickerEntries.value = []
  } catch (error) {
    pickerError.value = error.response?.data?.detail ?? error.response?.data?.error ?? 'Could not read this Docs folder.'
  } finally {
    pickerLoading.value = false
  }
}

function browsePickerParent() {
  const parts = pickerPath.value.split('/').filter(Boolean)
  parts.pop()
  void browseDocsFolder(parts.join('/'))
}

function isPickerEntrySelected(entry) {
  return selectedPickerEntries.value.some(item => item.path === entry.path)
}

function selectPickerEntry(entry) {
  if (entry.isDirectory) {
    void browseDocsFolder(entry.path)
    return
  }
  if (pendingMultiple.value) {
    selectedPickerEntries.value = isPickerEntrySelected(entry)
      ? selectedPickerEntries.value.filter(item => item.path !== entry.path)
      : [...selectedPickerEntries.value, entry]
    return
  }
  void openPickerServerEntries([entry])
}

async function openSelectedPickerEntries() {
  await openPickerServerEntries(selectedPickerEntries.value)
}

async function openPickerServerEntries(entries) {
  if (!entries.length) return
  try {
    const files = []
    for (const entry of entries) {
      const { data } = await api.get(contentUrl(entry.path), { responseType: 'blob' })
      files.push(new File([data], entry.name, { type: data.type || 'application/octet-stream' }))
    }
    const path = entries.length === 1 ? entries[0].path : null
    await deliverFiles(files, path)
  } catch (error) {
    pickerError.value = error.response?.data?.detail ?? error.response?.data?.error ?? error.message ?? 'Could not open the selected Docs file.'
  }
}

function openLocalPicker() {
  if (!localInput.value) return
  localInput.value.value = ''
  localInput.value.accept = pendingAccept.value
  localInput.value.multiple = pendingMultiple.value
  localInput.value.click()
}

async function onLocalFilesSelected(event) {
  const input = event.currentTarget
  const files = input.files ? Array.from(input.files) : []
  if (!files.length) return
  await deliverFiles(files, null)
  input.value = ''
}

function openDeckFilePicker() {
  pendingEditorInput.value = null
  pendingAccept.value = '.deckcraft,.slidecraft,.pptx,.potx,.ppsx,.txt,.md'
  pendingMultiple.value = false
  selectedPickerEntries.value = []
  pickerMode.value = 'source'
  hostPickerOpen.value = true
}

function cancelPickerOpen() {
  const input = pendingEditorInput.value
  pendingEditorInput.value = null
  hostPickerOpen.value = false
  if (input) input.dispatchEvent(new Event('cancel', { bubbles: true }))
}

async function deliverFiles(files, serverFilePath) {
  if (!files.length) return
  serverPath.value = serverFilePath
  currentName.value = files[0].name
  dirty.value = false
  savedOnce.value = serverFilePath !== null
  localSaveHandle = null
  autoSave.value = false

  const target = pendingEditorInput.value
  if (target) {
    const transfer = new DataTransfer()
    files.forEach(file => transfer.items.add(file))
    target.files = transfer.files
    pendingEditorInput.value = null
    selectedPickerEntries.value = []
    hostPickerOpen.value = false
    target.dispatchEvent(new Event('change', { bubbles: true }))
    return
  }

  const canvas = document.getElementById(canvasIds[activeToolId.value])
  if (!canvas) throw new Error(`${props.tool?.name ?? 'The editor'} did not create its canvas.`)
  const transfer = new DataTransfer()
  files.forEach(file => transfer.items.add(file))
  sendingSyntheticDrop = true
  try {
    for (const type of ['dragenter', 'dragover', 'drop']) {
      canvas.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }))
    }
  } finally {
    sendingSyntheticDrop = false
  }
  selectedPickerEntries.value = []
  hostPickerOpen.value = false
}

function supportsAccept(name, accept) {
  const rules = accept.split(',').map(rule => rule.trim().toLowerCase()).filter(Boolean)
  if (!rules.length) return true
  const extension = name.includes('.') ? `.${name.split('.').pop().toLowerCase()}` : ''
  const mime = mimeForExtension(extension)
  return rules.some(rule => rule.startsWith('.')
    ? rule === extension
    : rule.endsWith('/*') ? mime.startsWith(rule.slice(0, -1)) : rule === mime)
}

function mimeForExtension(extension) {
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'].includes(extension))
    return `image/${extension === '.jpg' ? 'jpeg' : extension.slice(1)}`
  if (['.ttf', '.otf', '.woff', '.woff2'].includes(extension)) return 'font/*'
  if (extension === '.pdf') return 'application/pdf'
  return 'application/octet-stream'
}

function wrapLocalHandle(handle) {
  return {
    name: handle.name,
    createWritable: async () => {
      const writable = await handle.createWritable()
      return {
        write: data => writable.write(data),
        close: async () => { await writable.close(); markSaved() },
      }
    },
  }
}

function triggerSave() {
  return triggerEditorShortcut('s', 'KeyS')
}

function triggerEditorShortcut(key, code) {
  const canvas = document.getElementById(canvasIds[activeToolId.value])
  if (!canvas) return false
  canvas.focus()
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
  const options = { key, code, bubbles: true, cancelable: true, metaKey: isMac, ctrlKey: !isMac }
  canvas.dispatchEvent(new KeyboardEvent('keydown', options))
  canvas.dispatchEvent(new KeyboardEvent('keyup', options))
  return true
}

function saveNow() {
  if (!triggerSave()) Notify.create({ type: 'warning', message: 'The editor is not ready to save.' })
  else {
    saving.value = true
    window.setTimeout(() => { saving.value = false }, 30_000)
  }
}

function saveServerChanges() {
  if (savePromise) return savePromise
  savePromise = new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      saveResolver = null
      savePromise = null
      saving.value = false
      reject(new Error('The editor did not finish saving.'))
    }, 20_000)
    saveResolver = () => {
      window.clearTimeout(timeout)
      saveResolver = null
      savePromise = null
      resolve()
    }
    saving.value = true
    if (!triggerSave()) {
      window.clearTimeout(timeout)
      saveResolver = null
      savePromise = null
      saving.value = false
      reject(new Error('The editor is not ready to save.'))
    }
  })
  return savePromise
}

function markSaved() {
  dirty.value = false
  saving.value = false
  savedOnce.value = true
  saveResolver?.()
  saveResolver = null
}

async function saveBlobUrl(url, destination) {
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error('Could not read the editor output.')
    await api.put(contentUrl(destination), await response.blob(), { headers: { 'Content-Type': 'application/octet-stream' } })
    serverPath.value = destination
    currentName.value = destination.split('/').pop()
    markSaved()
    Notify.create({ type: 'positive', message: `Saved ${currentName.value} to ${props.catalog?.name ?? 'Docs'}.` })
  } catch (error) {
    Notify.create({ type: 'negative', message: error.response?.data?.detail ?? error.message ?? 'Could not save this document.' })
  }
}

function markDirtyFromEditor() {
  if (!open.value || activeToolId.value !== 'wordcraft') return
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  dirty.value = event.defaultPrevented
}

function startDirtyProbe() {
  if (dirtyTimer) window.clearInterval(dirtyTimer)
  dirtyTimer = window.setInterval(markDirtyFromEditor, 500)
}

async function autoSaveTick() {
  if (!open.value || !autoSave.value || !savedOnce.value || saving.value) return
  markDirtyFromEditor()
  if (!dirty.value) return
  try { await saveServerChanges() }
  catch (error) { Notify.create({ type: 'negative', message: error.message ?? 'Automatic save failed.' }) }
}

async function saveAndClose() {
  if (dirty.value || saving.value) {
    try { await saveServerChanges() }
    catch (error) {
      Notify.create({ type: 'negative', message: error.message })
      return
    }
  }
  open.value = false
}

function contentUrl(path) {
  const encoded = path.split('/').map(encodeURIComponent).join('/')
  return `/catalogs/${encodeURIComponent(props.catalog.id)}/docs/content/${encoded}`
}

function sameExtension(first, second) {
  return first.split('.').pop()?.toLowerCase() === second.split('.').pop()?.toLowerCase()
}

function siblingPath(current, name) {
  const cleanName = name.split(/[\\/]/).pop()?.trim()
  if (!cleanName || cleanName === '.' || cleanName === '..') return current
  const parent = current.includes('/') ? current.slice(0, current.lastIndexOf('/')) : ''
  return parent ? `${parent}/${cleanName}` : cleanName
}

onBeforeUnmount(() => {
  window.clearInterval(dirtyTimer)
  window.clearInterval(autosaveTimer)
  if (observedDocument && downloadClickListener) observedDocument.removeEventListener('click', downloadClickListener, true)
  if (observedDocument && editKeyListener) observedDocument.removeEventListener('keydown', editKeyListener, true)
  if (saveBridgeInstalled) {
    if (originalSavePicker) window.showSaveFilePicker = originalSavePicker
    else delete window.showSaveFilePicker
  }
  if (originalMatchMedia) window.matchMedia = originalMatchMedia
})

onMounted(() => { autosaveTimer = window.setInterval(autoSaveTick, 30_000) })
</script>

<template>
  <section v-show="open" class="doc-editor-shell">
    <header class="doc-editor-toolbar">
      <q-btn flat round icon="arrow_back" aria-label="Back to Docs" @click="saveAndClose" />
      <q-icon name="description" color="primary" size="20px" />
      <div class="doc-editor-heading">
        <strong>{{ currentName || entry?.name }}</strong>
        <span>{{ catalog?.name }} · {{ tool?.name ?? 'Document editor' }}</span>
      </div>
      <template v-if="activeToolId === 'deckcraft'">
        <q-btn flat dense no-caps icon="note_add" label="New" @click="triggerEditorShortcut('n', 'KeyN')" />
        <q-btn flat dense no-caps icon="folder_open" label="Open" @click="openDeckFilePicker" />
      </template>
      <q-space />
      <span class="doc-editor-save-status" :class="{ 'is-dirty': dirty || saving }">{{ saveStatus }}</span>
      <q-toggle v-model="autoSave" dense label="Auto save" :disable="!savedOnce" />
      <q-btn flat dense no-caps icon="save" label="Save" :disable="busy" @click="saveNow" />
    </header>
    <div v-if="message" class="doc-editor-message"><q-spinner-dots v-if="busy" color="primary" /> {{ message }}</div>
    <div class="doc-editor-stage">
      <div
        v-for="toolId in toolIds"
        :key="toolId"
        class="doc-editor-runtime"
        :class="{ 'doc-editor-runtime--active': activeToolId === toolId }"
      >
        <canvas :id="canvasIds[toolId]" tabindex="0" :aria-label="`${toolId} editor canvas`" />
        <div v-if="loadingIds[toolId]" :id="loadingIds[toolId]" class="doc-editor-loading">Loading {{ toolId }}…</div>
      </div>
    </div>

    <div v-if="hostPickerOpen" class="editor-picker-shade" @click.self="cancelPickerOpen">
      <section class="editor-picker-card">
        <header class="editor-picker-heading">
          <div>
            <strong>{{ pickerMode === 'source' ? 'Open a file' : `${catalog?.name ?? 'Docs'} file explorer` }}</strong>
            <div class="editor-picker-caption">
              {{ pickerMode === 'source' ? 'Choose a source' : `${catalog?.path ?? ''}${pickerPath ? `/${pickerPath}` : ''}` }}
            </div>
          </div>
          <q-btn flat round dense icon="close" aria-label="Cancel open" @click="cancelPickerOpen" />
        </header>

        <q-list v-if="pickerMode === 'source'" separator>
          <q-item clickable @click="pickerMode = 'docs'; pickerPath = ''; void browseDocsFolder('')">
            <q-item-section avatar><q-icon name="folder_shared" color="primary" /></q-item-section>
            <q-item-section>
              <q-item-label>{{ catalog?.name ?? 'Docs catalog' }}</q-item-label>
              <q-item-label caption>Browse files in this catalog</q-item-label>
            </q-item-section>
            <q-item-section side><q-icon name="chevron_right" /></q-item-section>
          </q-item>
          <q-item clickable @click="openLocalPicker">
            <q-item-section avatar><q-icon name="computer" color="primary" /></q-item-section>
            <q-item-section>
              <q-item-label>This device</q-item-label>
              <q-item-label caption>Browse files on this computer</q-item-label>
            </q-item-section>
            <q-item-section side><q-icon name="chevron_right" /></q-item-section>
          </q-item>
        </q-list>

        <template v-else>
          <div class="editor-picker-toolbar">
            <q-btn flat dense no-caps icon="arrow_upward" label="Up" :disable="!pickerPath" @click="browsePickerParent" />
            <div class="editor-picker-breadcrumbs">
              <button @click="browseDocsFolder('')">{{ catalog?.name ?? 'Docs' }}</button>
              <template v-for="crumb in pickerBreadcrumbs" :key="crumb.path">
                <q-icon name="chevron_right" size="16px" />
                <button @click="browseDocsFolder(crumb.path)">{{ crumb.name }}</button>
              </template>
            </div>
            <q-space />
            <q-input v-model="pickerSearch" dense outlined clearable placeholder="Search this folder" class="editor-picker-search" />
          </div>
          <div v-if="pickerError" class="error-banner q-ma-sm">{{ pickerError }}</div>
          <div class="editor-picker-columns"><span>Name</span><span>Modified</span><span>Size</span></div>
          <div class="editor-picker-list">
            <button v-for="item in filteredPickerEntries" :key="item.path" class="editor-picker-row" @click="selectPickerEntry(item)">
              <span class="editor-picker-name">
                <q-icon :name="item.isDirectory ? 'folder' : 'description'" :color="item.isDirectory ? 'amber-8' : 'primary'" size="20px" />
                <span>{{ item.name }}</span>
              </span>
              <span>{{ item.isDirectory ? '—' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(item.modifiedAt)) }}</span>
              <span>{{ item.isDirectory || item.size == null ? '—' : `${Math.ceil(item.size / 1024)} KB` }}</span>
              <q-icon :name="item.isDirectory ? 'chevron_right' : pendingMultiple ? (isPickerEntrySelected(item) ? 'check_box' : 'check_box_outline_blank') : 'open_in_new'" />
            </button>
            <div v-if="pickerLoading" class="editor-picker-empty"><q-spinner-dots color="primary" size="32px" /></div>
            <div v-else-if="!filteredPickerEntries.length" class="editor-picker-empty">No matching files in this folder.</div>
          </div>
          <footer class="editor-picker-footer">
            <span>{{ filteredPickerEntries.length }} items</span>
            <q-space />
            <span v-if="pendingMultiple">{{ selectedPickerEntries.length }} selected</span>
            <q-btn flat no-caps label="Back" @click="pickerMode = 'source'" />
            <q-btn v-if="pendingMultiple" flat no-caps label="Open selected" color="primary" :disable="!selectedPickerEntries.length" @click="openSelectedPickerEntries" />
          </footer>
        </template>
        <input ref="localInput" class="editor-local-input" type="file" @change="onLocalFilesSelected" />
      </section>
    </div>
  </section>
</template>

<style scoped>
.doc-editor-shell { position: fixed; z-index: 7000; inset: 0; display: flex; flex-direction: column; background: #0b1220; color: #e2e8f0; }
.doc-editor-toolbar { display: flex; flex: 0 0 auto; align-items: center; gap: 10px; min-height: 58px; padding: 6px 12px; border-bottom: 1px solid #263348; background: #111a2a; }
.doc-editor-heading { display: flex; min-width: 0; flex-direction: column; }
.doc-editor-heading strong { overflow: hidden; max-width: min(38vw, 520px); text-overflow: ellipsis; white-space: nowrap; }
.doc-editor-heading span { color: #91a0b4; font-size: .75rem; }
.doc-editor-save-status { color: #81c784; font-size: .8rem; white-space: nowrap; }
.doc-editor-save-status.is-dirty { color: #ffca67; }
.doc-editor-message { display: flex; flex: 0 0 auto; align-items: center; justify-content: center; gap: 8px; padding: 7px 12px; color: #aab8cc; font-size: .85rem; }
.doc-editor-stage { position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden; }
.doc-editor-runtime { display: none; position: absolute; inset: 0; background: #e6e6e6; }
.doc-editor-runtime--active { display: block; }
.doc-editor-runtime canvas { position: absolute; inset: 0; display: block; width: 100%; height: 100%; outline: none; }
.doc-editor-loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #555; font: 14px system-ui, sans-serif; pointer-events: none; }
.editor-picker-shade { position: absolute; z-index: 5; inset: 58px 0 0; display: flex; align-items: center; justify-content: center; padding: 18px; background: rgba(4, 8, 15, .72); }
.editor-picker-card { display: flex; width: min(900px, 96vw); max-height: min(760px, 92vh); flex-direction: column; overflow: hidden; border: 1px solid #334155; border-radius: 14px; background: #101827; box-shadow: 0 24px 80px rgba(0,0,0,.5); }
.editor-picker-heading,.editor-picker-footer { display: flex; flex: 0 0 auto; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: 1px solid #263348; }
.editor-picker-footer { border-top: 1px solid #263348; border-bottom: 0; }
.editor-picker-caption { margin-top: 3px; color: #91a0b4; font-size: .78rem; }
.editor-picker-toolbar { display: flex; flex: 0 0 auto; align-items: center; gap: 8px; padding: 9px 12px; }
.editor-picker-breadcrumbs { display: flex; min-width: 0; align-items: center; gap: 4px; overflow: hidden; }
.editor-picker-breadcrumbs button { overflow: hidden; border: 0; background: transparent; color: #cbd5e1; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.editor-picker-search { flex: 0 1 230px; }
.editor-picker-columns,.editor-picker-row { display: grid; grid-template-columns: minmax(0, 1fr) 150px 80px 26px; align-items: center; gap: 10px; padding: 9px 14px; }
.editor-picker-columns { border-top: 1px solid #263348; border-bottom: 1px solid #263348; color: #91a0b4; font-size: .72rem; text-transform: uppercase; }
.editor-picker-list { min-height: 140px; overflow: auto; }
.editor-picker-row { width: 100%; border: 0; border-bottom: 1px solid rgba(38,51,72,.6); background: transparent; color: #cbd5e1; text-align: left; cursor: pointer; }
.editor-picker-row:hover { background: #1b2940; }
.editor-picker-name { display: flex; min-width: 0; align-items: center; gap: 9px; overflow: hidden; white-space: nowrap; }
.editor-picker-name span { overflow: hidden; text-overflow: ellipsis; }
.editor-picker-empty { padding: 32px; color: #91a0b4; text-align: center; }
.editor-local-input { display: none; }
@media (max-width: 700px) { .doc-editor-toolbar { flex-wrap: wrap; gap: 4px; padding: 5px; } .doc-editor-heading { flex: 1 1 40%; } .doc-editor-heading strong { max-width: 100%; } .doc-editor-save-status { display: none; } }
</style>
