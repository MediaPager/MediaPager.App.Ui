import { computed, ref } from 'vue'
import { useSources } from './useSources'

// The media-kind bar shared by Stream and catalog screens. Providers declare supported
// catalog kinds separately from any browse sources they expose.
export const builtinStreamTabs = [
  { key: 'movies', label: 'Movies', icon: 'movie' },
  { key: 'tv', label: 'TV Shows', icon: 'live_tv' },
  { key: 'music', label: 'Music', icon: 'album' },
  { key: 'podcasts', label: 'Podcasts', icon: 'podcasts' },
  { key: 'audiobooks', label: 'Audio Books', icon: 'headphones' },
  { key: 'books', label: 'Books', icon: 'menu_book' },
]

const streamTab = ref('movies')

const sourceKindToTab = {
  movie: 'movies',
  tv: 'tv',
  music: 'music',
  podcast: 'podcasts',
  audiobook: 'audiobooks',
  book: 'books',
}

const catalogTypeToTab = {
  movies: 'movies',
  'tv-shows': 'tv',
  music: 'music',
  podcasts: 'podcasts',
  audiobooks: 'audiobooks',
  books: 'books',
}

export function useStreamTabs() {
  const { sourceTabs: discoveredSourceTabs, plugins } = useSources()
  const onlineStreamPlugins = computed(() => plugins.value.filter((plugin) =>
    (plugin.capabilities ?? []).includes('stream') &&
    (plugin.streamMode ?? 'online').toLowerCase() === 'online'))
  const onlinePluginIds = computed(() => new Set(onlineStreamPlugins.value.map((plugin) => plugin.id)))
  const sourceTabs = computed(() => discoveredSourceTabs.value.filter((source) =>
    source.pluginId == null || onlinePluginIds.value.has(source.pluginId)))

  const streamTabs = computed(() => builtinStreamTabs)
  const availableStreamKinds = computed(() => {
    const declared = onlineStreamPlugins.value.flatMap((plugin) =>
      Array.isArray(plugin.supportedCatalogTypes)
        ? plugin.supportedCatalogTypes.map((slug) => catalogTypeToTab[String(slug).toLowerCase()])
        : sourceTabs.value
          .filter((source) => source.pluginId === plugin.id)
          .map((source) => sourceKindToTab[String(source.kind).toLowerCase()]),
    )
    return new Set(declared.filter(Boolean))
  })
  const activeMediaKind = computed(() => {
    if (!streamTab.value.startsWith('source:')) return streamTab.value
    const source = sourceTabs.value.find((entry) => entry.key === streamTab.value)
    return source ? sourceKindToTab[String(source.kind).toLowerCase()] ?? null : null
  })

  function isSourceTab(k) {
    return k?.startsWith('source:') ?? false
  }

  return { streamTabs, streamTab, sourceTabs, availableStreamKinds, activeMediaKind, isSourceTab }
}
