import { computed, ref } from 'vue'
import { api } from './useApi'
import { formatPluginError } from './pluginErrors'

// Plugin discovery catalog (GET /sources): which plugins are loaded, what they can do,
// the stream sources they contribute to nav, and subtitle providers. Drives the
// data-driven nav sub-tabs, browse grids, detail sheets, and plugin settings screens.
const plugins = ref([])
const sources = ref([])
const subtitles = ref([])
const loaded = ref(false)
const loading = ref(false)
const error = ref('')

// Per-source browse state, keyed by source key: { items, page, totalPages, query, loading, error }.
const browseState = ref({})

export function useSources() {
  async function fetchSources() {
    loading.value = true
    error.value = ''
    try {
      const { data } = await api.get('/sources')
      plugins.value = data?.plugins ?? []
      sources.value = data?.sources ?? []
      subtitles.value = data?.subtitles ?? []
      loaded.value = true
    } catch (requestError) {
      error.value = formatPluginError(requestError, 'Could not load sources.')
    } finally {
      loading.value = false
    }
  }

  // Plugins that declared a settings schema — each gets a data-driven settings tab.
  const configurablePlugins = computed(() =>
    plugins.value.filter((plugin) => (plugin.settings?.length ?? 0) > 0))

  const pluginSettingsNav = computed(() =>
    plugins.value
      .filter((plugin) => plugin.settingsNav?.label)
      .map((plugin) => ({
        ...plugin.settingsNav,
        key: `plugin-nav:${plugin.id}`,
        pluginId: plugin.id,
      })))

  const pluginMainNav = computed(() =>
    plugins.value.flatMap((plugin) => (plugin.mainNav ?? []).map((entry) => ({
      ...entry,
      pluginId: plugin.id,
      key: `${plugin.id}:${entry.path}`,
    }))))

  // Nav sub-tabs contributed by stream providers, in the server's kind/name order.
  const sourceTabs = computed(() =>
    sources.value.map((source) => ({
      key: `source:${source.key}`,
      sourceKey: source.key,
      label: source.name,
      icon: source.icon ?? 'play_circle',
      customUi: source.customUi ?? false,
      uiUrl: source.uiUrl ?? null,
      pluginId: source.pluginId ?? null,
      kind: source.kind,
    })))

  // An ONLINE stream provider loaded? Drives the Stream nav entry: the Stream screen
  // (browse + resolve through a provider) only exists when something online can serve
  // it. Local-mode stream providers obey the catalogs and never activate Stream;
  // streamMode defaults to online for plugins written before the contract had it.
  const hasOnlineStreamProvider = computed(() =>
    plugins.value.some((plugin) =>
      (plugin.capabilities ?? []).includes('stream') &&
      (plugin.streamMode ?? 'online') === 'online'))

  // Movies and TV resolve through a provider that serves video where possible. A
  // music-only provider may sort first, so don't accidentally route video into it.
  const defaultSourceKey = computed(() => {
    const kindOf = (source) => String(source.kind ?? '').toLowerCase()
    return sources.value.find((source) => ['movie', 'movies'].includes(kindOf(source)))?.key
      ?? sources.value.find((source) => ['tv', 'tvshow', 'tv-show'].includes(kindOf(source)))?.key
      ?? sources.value.find((source) => !['music', 'podcast', 'audiobook', 'book'].includes(kindOf(source)))?.key
      ?? sources.value[0]?.key
      ?? null
  })

  function stateFor(sourceKey) {
    if (!browseState.value[sourceKey]) {
      browseState.value[sourceKey] = {
        items: [],
        page: 1,
        totalPages: 1,
        query: '',
        loading: false,
        error: '',
        loaded: false,
        requestId: 0,
      }
    }
    return browseState.value[sourceKey]
  }

  async function fetchBrowse(sourceKey, page = 1) {
    const state = stateFor(sourceKey)
    const requestId = ++state.requestId
    state.loading = true
    state.error = ''
    try {
      const { data } = await api.get(`/sources/${encodeURIComponent(sourceKey)}/browse`, {
        params: { query: state.query || undefined, page },
      })
      if (requestId !== state.requestId) return
      state.items = data?.items ?? []
      state.page = data?.page ?? page
      state.totalPages = data?.totalPages ?? 1
      state.loaded = true
    } catch (requestError) {
      if (requestId !== state.requestId) return
      state.error = formatPluginError(requestError, 'Could not load this source.')
    } finally {
      if (requestId === state.requestId) state.loading = false
    }
  }

  function searchSource(sourceKey, query) {
    const state = stateFor(sourceKey)
    state.query = String(query ?? '').trim()
    state.page = 1
    return fetchBrowse(sourceKey, 1)
  }

  async function fetchDetails(sourceKey, externalId) {
    const { data } = await api.get(
      `/sources/${encodeURIComponent(sourceKey)}/details/${encodeURIComponent(externalId)}`)
    return data
  }

  // Data-driven plugin settings (admin). Secret fields never read back — the server
  // returns a boolean-per-field shape so the UI shows a "set" placeholder and only
  // writes when a new value is typed.
  async function fetchPluginSettings(pluginKey) {
    const { data } = await api.get(`/plugins/${encodeURIComponent(pluginKey)}/settings`)
    return data?.values ?? {}
  }

  async function savePluginSettings(pluginKey, values) {
    const { data } = await api.put(`/plugins/${encodeURIComponent(pluginKey)}/settings`, values)
    return data
  }

  // Official plugin catalog (GET /plugins/official): links the SPA can offer at any time
  // (e.g. the other mail providers in Settings → Email) plus whether each is loaded now.
  // Admin-only endpoint — callers gate on canEditSettings.
  const officialPlugins = ref([])

  async function fetchOfficialPlugins() {
    try {
      const { data } = await api.get('/plugins/official')
      officialPlugins.value = data?.plugins ?? []
    } catch { /* keep last known */ }
  }

  return {
    plugins,
    sources,
    subtitles,
    loaded,
    loading,
    error,
    configurablePlugins,
    pluginSettingsNav,
    pluginMainNav,
    officialPlugins,
    sourceTabs,
    hasOnlineStreamProvider,
    defaultSourceKey,
    fetchSources,
    fetchOfficialPlugins,
    stateFor,
    fetchBrowse,
    searchSource,
    fetchDetails,
    fetchPluginSettings,
    savePluginSettings,
  }
}
