import { createRouter, createWebHistory } from 'vue-router'
import HomePage from './components/HomePage.vue'
import SettingsPage from './components/SettingsPage.vue'
import ProfilePage from './components/ProfilePage.vue'
import NotFoundPage from './components/NotFoundPage.vue'
import PluginRoutePage from './components/PluginRoutePage.vue'

// Bookmarkable URLs + back/forward for the page-level nav that used to be local refs.
// Tab state lives in route params so a refresh or pasted link lands exactly where you were:
//   /                          → stream home (movies tab)
//   /stream/:tab               → stream sub-tab ('movies', 'tv', 'music', …, 'source:{key}')
//   /catalog/:name             → a library catalog tab, keyed by its unique name
//                                ('Movies', 'My%20Movies') — never a numeric id
//   /settings/:tab?            → settings ('setup', 'general', …, 'plugin:{id}'), gated by scope
//   /profile                   → account profile
//   anything else              → 404 page (keeps the bad URL visible)
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/stream/movies' },
    { path: '/stream/:tab', component: HomePage, name: 'stream' },
    { path: '/catalog/:name', component: HomePage, name: 'catalog' },
    { path: '/settings/:tab?', component: SettingsPage, name: 'settings' },
    { path: '/plugin/:pluginId/:pathMatch(.*)*', component: PluginRoutePage, name: 'plugin' },
    { path: '/profile', component: ProfilePage, name: 'profile' },
    { path: '/:pathMatch(.*)*', component: NotFoundPage, name: 'not-found' },
  ],
})

// Auth gate: no route resolves without a token — the auth page replaces the router view.
// The settings screens additionally want a settings-capable scope; without one the user
// lands back on the stream tab rather than a 403 wall. Scopes are the same cached set
// useAuth maintains (localStorage 'mediapager.scopes').
router.beforeEach((to) => {
  const token = localStorage.getItem('mediapager.accessToken')
  if (!token) return false
  if (to.name === 'settings' && !canAccessSettings()) {
    return { name: 'stream', params: { tab: 'movies' } }
  }
  return true
})

function canAccessSettings() {
  try {
    const scopes = JSON.parse(localStorage.getItem('mediapager.scopes') ?? '[]')
    return scopes.includes('admin:super') ||
      scopes.includes('admin:settings-edit') ||
      scopes.includes('admin:catalogs-edit') ||
      scopes.includes('admin:can-invite')
  } catch {
    return false
  }
}
