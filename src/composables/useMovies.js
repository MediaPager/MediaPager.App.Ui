import { ref } from 'vue'
import { api } from './useApi'

const movies = ref([])
const page = ref(1)
const totalPages = ref(1)
const query = ref('')
const loading = ref(false)
const error = ref('')
const tmdbKeyMissing = ref(false)

// Detail screen state (shared so the grid, detail sheet, and player all see it).
const movieSheetOpen = ref(false)
const sheetMovie = ref(null)
const sheetDetails = ref(null)
const sheetLoading = ref(false)
const isTouchDevice = window.matchMedia('(hover: none)').matches

export function useMovies() {
  async function fetchMovies() {
    loading.value = true
    error.value = ''
    tmdbKeyMissing.value = false
    try {
      const searchQuery = query.value.trim()
      const { data } = await api.get('/movies', {
        params: {
          ...(searchQuery ? { q: searchQuery } : {}),
          page: page.value,
        },
      })
      movies.value = data.results
      totalPages.value = data.totalPages
    } catch (e) {
      const detail = e.response?.data?.detail ?? e.response?.data?.error ?? e.message
      error.value = detail
      tmdbKeyMissing.value = e.response?.status === 503 && /TMDB API key/i.test(detail)
      movies.value = []
    } finally {
      loading.value = false
    }
  }

  function search() {
    page.value = 1
    movieSheetOpen.value = false
    return fetchMovies()
  }

  // Jump from a cast member on the detail sheet to a cast-mode search on the grid.
  function searchCast(name) {
    const person = (name ?? '').trim()
    if (!person) return
    query.value = `cast: ${person}`
    search()
  }

  function goToPage(p) {
    page.value = p
    movieSheetOpen.value = false
    fetchMovies()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function openDetails(movie) {
    sheetMovie.value = movie
    const localItem = movie.localItem ?? null
    const localDetails = localItem ? {
      title: localItem.title ?? movie.title,
      year: localItem.year ?? movie.year,
      overview: localItem.overview ?? movie.overview,
      posterUrl: localItem.imageUrl ?? movie.posterUrl,
      backdropUrl: localItem.backdropUrl ?? movie.backdropUrl,
      voteAverage: localItem.rating ?? movie.voteAverage ?? 0,
      genres: (localItem.tags ?? []).filter((tag) => tag.type?.toLowerCase() === 'genre').map((tag) => tag.value),
      cast: [],
    } : null
    sheetDetails.value = localDetails
    movieSheetOpen.value = true
    sheetLoading.value = true
    try {
      const localCatalogType = localItem?.catalogTypeSlug
      const supportsTmdbDetails = !localItem ||
        (['movies', 'tv-shows'].includes(localCatalogType) && /^\d+$/.test(String(localItem.externalId ?? '')))
      if (!supportsTmdbDetails) return
      const { data } = await api.get(`/movies/${movie.id}/details`)
      sheetDetails.value = localItem
        ? {
            ...data,
            ...localDetails,
            genres: data.genres?.length ? data.genres : localDetails.genres,
            cast: data.cast ?? [],
          }
        : data
    } catch {
      sheetDetails.value = localDetails
    } finally {
      sheetLoading.value = false
    }
  }

  function openLocalDetails(item) {
    const externalId = String(item.externalId ?? '')
    const externalNumber = Number(externalId)
    const supportsTmdbDetails = ['movies', 'tv-shows'].includes(item.catalogTypeSlug) &&
      Number.isSafeInteger(externalNumber) && externalNumber > 0
    return openDetails({
      id: supportsTmdbDetails ? externalNumber : item.id,
      title: item.title,
      year: item.year,
      overview: item.overview,
      posterUrl: item.imageUrl,
      backdropUrl: item.backdropUrl,
      voteAverage: item.rating ?? 0,
      localItem: item,
      localOnly: !supportsTmdbDetails,
    })
  }

  function clearList() {
    movies.value = []
  }

  return {
    movies,
    page,
    totalPages,
    query,
    loading,
    error,
    tmdbKeyMissing,
    movieSheetOpen,
    sheetMovie,
    sheetDetails,
    sheetLoading,
    isTouchDevice,
    fetchMovies,
    search,
    searchCast,
    goToPage,
    openDetails,
    openLocalDetails,
    clearList,
  }
}

export function formatRuntime(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
