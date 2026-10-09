import { ref } from 'vue'
import { api } from './useApi'

// Catalogs for the left nav plus the catalog-type lookup for the create dialog.
// navCatalogs is the per-user ordered list served by /catalogs/nav.
const catalogs = ref([])
const navCatalogs = ref([])
const catalogTypes = ref([])
const catalogsLoading = ref(false)
const catalogsError = ref('')
const navSaving = ref(false)
// Whether /catalogs/nav has resolved at least once (the 404 check needs to know the
// difference between "not loaded yet" and "loaded, and that name isn't there").
const navCatalogsLoaded = ref(false)

export function useCatalogs() {
  async function fetchCatalogs() {
    catalogsLoading.value = true
    catalogsError.value = ''
    try {
      const { data } = await api.get('/catalogs')
      catalogs.value = data
    } catch (e) {
      catalogs.value = []
      catalogsError.value = e.response?.data?.detail ?? e.response?.data?.error ?? e.message
    } finally {
      catalogsLoading.value = false
    }
  }

  async function fetchNavCatalogs() {
    try {
      const { data } = await api.get('/catalogs/nav')
      navCatalogs.value = data
    } catch {
      navCatalogs.value = []
    } finally {
      navCatalogsLoaded.value = true
    }
  }

  // Persist the user's preferred nav order, then refresh to reflect the server's verdict
  // (new catalogs always land at the bottom).
  async function saveNavOrder(ids) {
    navSaving.value = true
    try {
      const { data } = await api.put('/catalogs/nav', { catalogIds: ids })
      navCatalogs.value = data
    } finally {
      navSaving.value = false
    }
  }

  async function fetchCatalogTypes() {
    if (catalogTypes.value.length) return
    try {
      const { data } = await api.get('/catalog-types')
      catalogTypes.value = data
    } catch {
      catalogTypes.value = []
    }
  }

  async function createCatalog(payload) {
    const { data } = await api.post('/catalogs', payload)
    await Promise.all([fetchCatalogs(), fetchNavCatalogs()])
    return data
  }

  async function updateCatalog(id, payload) {
    const { data } = await api.put(`/catalogs/${id}`, payload)
    await fetchCatalogs()
    return data
  }

  return {
    catalogs,
    navCatalogs,
    catalogTypes,
    catalogsLoading,
    catalogsError,
    navSaving,
    navCatalogsLoaded,
    fetchCatalogs,
    fetchNavCatalogs,
    saveNavOrder,
    fetchCatalogTypes,
    createCatalog,
    updateCatalog,
  }
}
