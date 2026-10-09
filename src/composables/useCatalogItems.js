import { ref } from 'vue'
import { api } from './useApi'

const items = ref([])
const itemsLoading = ref(false)
const itemsError = ref('')

// Global lookup: TMDB id → CatalogItem with a StoragePath. Lets the Stream grid know a
// movie is already in the library (edit icon and direct local playback).
const localByExternalId = ref({})
const localMapLoading = ref(false)
const editItemRequest = ref(null)

export function useCatalogItems() {
  async function fetchItems(catalogId) {
    itemsLoading.value = true
    itemsError.value = ''
    items.value = []
    try {
      const { data } = await api.get('/catalog-items', { params: { catalogId } })
      items.value = data
    } catch (e) {
      items.value = []
      itemsError.value = e.response?.data?.detail ?? e.response?.data?.error ?? e.message
    } finally {
      itemsLoading.value = false
    }
  }

  function replaceItem(updated) {
    const index = items.value.findIndex((item) => item.id === updated.id)
    if (index !== -1) items.value.splice(index, 1, updated)
    syncLocalMap(updated)
  }

  // Rebuild the externalId → local-item map from the whole library.
  async function refreshLocalMap() {
    localMapLoading.value = true
    try {
      const { data } = await api.get('/catalog-items')
      const map = {}
      for (const item of data) {
        if (item.externalId && item.storagePath) map[String(item.externalId)] = item
      }
      localByExternalId.value = map
    } catch { /* transient; the map keeps its last-known state */ } finally {
      localMapLoading.value = false
    }
  }

  function localItemFor(externalId) {
    if (externalId == null) return null
    return localByExternalId.value[String(externalId)] ?? null
  }

  async function findLocalItemByExternalId(externalId) {
    if (externalId == null) return null
    const cached = localItemFor(externalId)
    if (cached?.storagePath) return cached

    const { data } = await api.get('/catalog-items', { params: { externalId: String(externalId) } })
    const localItem = data.find((item) => item.storagePath) ?? null
    if (localItem) syncLocalMap(localItem)
    return localItem
  }

  async function requestEditItem(id) {
    const { data } = await api.get(`/catalog-items/${encodeURIComponent(id)}`)
    editItemRequest.value = data
    return data
  }

  function clearEditItemRequest() {
    editItemRequest.value = null
  }

  function syncLocalMap(updated) {
    if (!updated?.externalId) return
    if (updated.storagePath) localByExternalId.value[String(updated.externalId)] = updated
    else delete localByExternalId.value[String(updated.externalId)]
  }

  function removeFromLocalMap(item) {
    if (item?.externalId) delete localByExternalId.value[String(item.externalId)]
  }

  // Rename / set poster, backdrop, description, year, sort title, orig title/date,
  // content rating and the official rating on a library entry.
  async function updateItem(id, payload) {
    const { data } = await api.put(`/catalog-items/${id}`, payload)
    replaceItem(data)
    return data
  }

  // Upload a custom poster/backdrop; the API stores it and returns the updated entry.
  async function uploadItemArtwork(id, kind, file) {
    const form = new FormData()
    form.append('file', file)
    const { data } = await api.post(`/catalog-items/${id}/artwork`, form, {
      params: { kind },
    })
    replaceItem(data)
    return data
  }

  // Fetch an image from a URL server-side, verify it, store a local copy, and point the
  // item at it (artwork should not rely on a third-party host staying up).
  async function ingestItemArtwork(id, kind, url) {
    const { data } = await api.post(`/catalog-items/${id}/artwork-url`, { url }, { params: { kind } })
    replaceItem(data)
    return data
  }

  async function deleteItem(id) {
    const removed = items.value.find((item) => item.id === id) ?? null
    await api.delete(`/catalog-items/${id}`)
    items.value = items.value.filter((item) => item.id !== id)
    if (removed) removeFromLocalMap(removed)
  }

  // Replace the whole IMDb-style tag set (genre/country/writer/director/producer).
  async function saveTags(id, tags) {
    const payload = (tags ?? []).map((tag) => ({ type: tag.type, value: tag.value }))
    const { data } = await api.put(`/catalog-items/${id}/tags`, { tags: payload })
    replaceItem(data)
    return data
  }

  // Personal rating: what *this* user believes the movie is rated. rating 0 clears it.
  async function setRating(id, rating) {
    const { data } = await api.put(`/catalog-items/${id}/rating`, { rating })
    patchUserRating(id, data.rating ?? null)
    return data
  }

  async function clearRating(id) {
    const { data } = await api.delete(`/catalog-items/${id}/rating`)
    patchUserRating(id, null)
    return data
  }

  function patchUserRating(id, rating) {
    const item = items.value.find((entry) => entry.id === id)
    if (item) item.userRating = rating
    for (const key of Object.keys(localByExternalId.value)) {
      if (localByExternalId.value[key].id === id) localByExternalId.value[key].userRating = rating
    }
  }

  return {
    items,
    itemsLoading,
    itemsError,
    localByExternalId,
    localMapLoading,
    editItemRequest,
    fetchItems,
    refreshLocalMap,
    localItemFor,
    findLocalItemByExternalId,
    requestEditItem,
    clearEditItemRequest,
    updateItem,
    uploadItemArtwork,
    ingestItemArtwork,
    deleteItem,
    saveTags,
    setRating,
    clearRating,
  }
}
