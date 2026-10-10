import { ref } from 'vue'
import { api } from './useApi'

const tvShows = ref([])
const tvPage = ref(1)
const tvTotalPages = ref(1)
const tvQuery = ref('')
const tvLoading = ref(false)
const tvError = ref('')
const tvKeyMissing = ref(false)

// Detail sheet state is shared by browse, playback, and search entry points.
const tvSheetOpen = ref(false)
const tvSheetShow = ref(null)
const tvSheetDetails = ref(null)
const tvSheetLoading = ref(false)

export function useTvShows() {
  async function fetchTvShows() {
    tvLoading.value = true
    tvError.value = ''
    tvKeyMissing.value = false
    try {
      const searchQuery = tvQuery.value.trim()
      const { data } = await api.get('/tv-shows', {
        params: {
          ...(searchQuery ? { q: searchQuery } : {}),
          page: tvPage.value,
        },
      })
      tvShows.value = data.results
      tvTotalPages.value = data.totalPages
    } catch (e) {
      const detail = e.response?.data?.detail ?? e.response?.data?.error ?? e.message
      tvError.value = detail
      tvKeyMissing.value = e.response?.status === 503 && /TMDB API key/i.test(detail)
      tvShows.value = []
    } finally {
      tvLoading.value = false
    }
  }

  function searchTv() {
    tvPage.value = 1
    tvSheetOpen.value = false
    fetchTvShows()
  }

  function goToTvPage(p) {
    tvPage.value = p
    tvSheetOpen.value = false
    fetchTvShows()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function openTvDetails(show) {
    tvSheetShow.value = show
    tvSheetDetails.value = null
    tvSheetOpen.value = true
    tvSheetLoading.value = true
    try {
      const { data } = await api.get(`/tv-shows/${show.id}/details`)
      tvSheetDetails.value = data
    } catch {
      tvSheetDetails.value = null
    } finally {
      tvSheetLoading.value = false
    }
  }

  // Lazy-load a season's episode list (called when a season section opens).
  async function fetchSeason(showId, seasonNumber) {
    const { data } = await api.get(`/tv-shows/${showId}/season/${seasonNumber}`)
    return data
  }

  function clearTvList() {
    tvShows.value = []
  }

  return {
    tvShows,
    tvPage,
    tvTotalPages,
    tvQuery,
    tvLoading,
    tvError,
    tvKeyMissing,
    tvSheetOpen,
    tvSheetShow,
    tvSheetDetails,
    tvSheetLoading,
    fetchTvShows,
    searchTv,
    goToTvPage,
    openTvDetails,
    fetchSeason,
    clearTvList,
  }
}
