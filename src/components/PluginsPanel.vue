<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { api } from '../composables/useApi'
import { useSources } from '../composables/useSources'

// Settings > Plugins (admin:super only). GET /plugins returns the loaded plugins plus
// `available` — official / recognized-community catalog entries that are not active yet,
// so the screen can offer a uniform "Turn on" (POST /plugins/{key}/enable: instant when
// the files are still deployed, a polled deploy job otherwise). The top nav (left-aligned)
// filters installed plugins by type; uninstalled community entries and discoveries stay in
// the Community tab until their plugin is installed. "Add plugin" accepts a bare repo URL.
// Each loaded
// plugin with a settings schema shows a gear right after its official/community badge that
// EMITS open-settings — SettingsPage owns the dialog.
const emit = defineEmits(['open-settings'])

const { fetchSources } = useSources()

const plugins = ref([])
const available = ref([])
const loading = ref(false)
const error = ref('')
const message = ref('')
const uninstallingId = ref('')
const disablingId = ref('')
const enablingId = ref('')
const confirmTarget = ref(null)
const removeUnusedDependencies = ref(false)

const CATEGORY_ORDER = ['search', 'subtitles', 'email', 'metadata', 'stream', 'interface', 'actions', 'other']
const PLUGIN_TYPES = ['search', 'subtitles', 'email', 'metadata', 'stream', 'interface', 'actions']

function categoryLabel(category) {
  return category ? category.charAt(0).toUpperCase() + category.slice(1) : 'Other'
}

function categoryRank(category) {
  const index = CATEGORY_ORDER.indexOf(category)
  return index === -1 ? CATEGORY_ORDER.length : index
}

// Loaded rows (running plugins) + available rows (off / not installed), normalized so the
// list, the type filters and the Community tab all read from one source.
const allRows = computed(() => [
  ...plugins.value.map((plugin) => ({
    ...plugin,
    loaded: true,
    deployed: true,
    capabilities: plugin.capabilities ?? [],
    settings: plugin.settings ?? [],
    category: plugin.category || 'other',
  })),
  ...available.value.map((entry) => ({
    ...entry,
    loaded: false,
    version: null,
    description: null,
    capabilities: [],
    settings: [],
    category: entry.category || 'other',
  })),
])

const typeRows = computed(() => allRows.value.filter((row) => row.official !== false || row.deployed))

// Top nav: All · every type that has plugins (loaded or off) · Community.
const activeCategory = ref('all')
const categoryTabs = computed(() => {
  const present = [...new Set([
    ...PLUGIN_TYPES,
    ...typeRows.value.map((row) => row.category),
  ])]
  present.sort((a, b) => categoryRank(a) - categoryRank(b) || a.localeCompare(b))
  return [
    { name: 'all', label: 'All' },
    ...present.map((category) => ({ name: category, label: categoryLabel(category) })),
    { name: 'community', label: 'Community' },
  ]
})

const grouped = computed(() => {
  const groups = new Map()
  for (const row of typeRows.value) {
    if (!groups.has(row.category)) groups.set(row.category, [])
    groups.get(row.category).push(row)
  }
  for (const items of groups.values()) {
    items.sort((a, b) => Number(b.loaded) - Number(a.loaded) || String(a.name).localeCompare(String(b.name)))
  }
  return [...groups.entries()].sort(
    ([a], [b]) => categoryRank(a) - categoryRank(b) || a.localeCompare(b),
  )
})

const visibleGroups = computed(() => {
  if (activeCategory.value === 'community') {
    const items = allRows.value
      .filter((row) => row.official === false && row.discoverable !== false)
      .sort((a, b) => Number(b.loaded) - Number(a.loaded) || String(a.name).localeCompare(String(b.name)))
    return items.length ? [['community', items]] : []
  }
  if (activeCategory.value === 'all') return grouped.value
  const items = typeRows.value
    .filter((row) => row.category === activeCategory.value || row.capabilities.includes(activeCategory.value))
    .sort((a, b) => Number(b.loaded) - Number(a.loaded) || String(a.name).localeCompare(String(b.name)))
  return items.length ? [[activeCategory.value, items]] : []
})

onMounted(load)
onBeforeUnmount(stopPolling)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const { data } = await api.get('/plugins')
    plugins.value = data?.plugins ?? []
    available.value = data?.available ?? []
    // A type that disappeared under the active filter falls back to All.
    if (activeCategory.value !== 'community' && activeCategory.value !== 'all' &&
        !visibleGroups.value.length && allRows.value.length) {
      activeCategory.value = 'all'
    }
  } catch (requestError) {
    error.value = requestError.response?.data?.detail ?? 'Could not load plugins.'
  } finally {
    loading.value = false
  }
}

async function uninstall(plugin) {
  confirmTarget.value = null
  uninstallingId.value = plugin.id
  error.value = ''
  message.value = ''
  try {
    const { data } = await api.delete(`/plugins/${encodeURIComponent(plugin.id)}`, {
      params: { removeDependencies: removeUnusedDependencies.value },
    })
    message.value = data?.message ?? `Turned off ${plugin.name}.`
    await load()
    fetchSources()
  } catch (requestError) {
    error.value = requestError.response?.data?.detail ?? `Could not turn off ${plugin.name}.`
  } finally {
    uninstallingId.value = ''
  }
}

function askUninstall(plugin) {
  removeUnusedDependencies.value = false
  confirmTarget.value = plugin
}

async function disablePlugin(plugin) {
  disablingId.value = plugin.id
  error.value = ''
  message.value = ''
  try {
    const { data } = await api.post(`/plugins/${encodeURIComponent(plugin.id)}/disable`)
    message.value = data?.message ?? `${plugin.name} is off.`
    await load()
    fetchSources()
  } catch (requestError) {
    error.value = requestError.response?.data?.detail ?? `Could not turn off ${plugin.name}.`
  } finally {
    disablingId.value = ''
  }
}

// Turn a listed-but-inactive plugin on. When its files are still deployed the server
// activates it instantly (community: clear the .disabled marker; official: add to the
// required set) and replies with a message. When nothing is deployed yet it returns a
// jobId and we reuse the same polled deploy dialog as an install.
async function enablePlugin(plugin) {
  enablingId.value = plugin.id
  error.value = ''
  message.value = ''
  try {
    const { data } = await api.post(`/plugins/${encodeURIComponent(plugin.id)}/enable`)
    if (data.jobId) {
      job.value = { jobId: data.jobId, stage: 'queued', percent: 0, done: false, failed: false, log: [], error: null, title: `Turn on ${plugin.name}` }
      jobDialogOpen.value = true
      stopPolling()
      pollTimer = setInterval(pollJob, 400)
    } else {
      message.value = data?.message ?? `${plugin.name} is active.`
      await load()
      fetchSources()
    }
  } catch (requestError) {
    error.value = requestError.response?.data?.detail ?? `Could not turn on ${plugin.name}.`
  } finally {
    enablingId.value = ''
  }
}

// --- Jobs: turn on / install / add — one polled progress dialog ----------------------
const jobDialogOpen = ref(false)
const job = ref(null)
let pollTimer = null

const jobStageLabel = computed(() => {
  if (!job.value) return ''
  if (job.value.failed) return 'Failed'
  if (job.value.done) return 'Done'
  const stage = job.value.stage ?? 'queued'
  return stage.charAt(0).toUpperCase() + stage.slice(1)
})

async function startJob({ key, repo, branch: branchName }) {
  error.value = ''
  try {
    const body = key
      ? { key }
      : { repo, ...(branchName ? { branch: branchName } : {}) }
    const { data } = await api.post('/plugins/jobs', body)
    addDialogOpen.value = false
    addError.value = ''
    job.value = { jobId: data.jobId, stage: 'queued', percent: 0, done: false, failed: false, log: [], error: null, title: null }
    jobDialogOpen.value = true
    stopPolling()
    pollTimer = setInterval(pollJob, 400)
  } catch (requestError) {
    const detail = requestError.response?.data?.detail
      ?? requestError.response?.data?.title
      ?? 'Could not start the plugin job.'
    if (repo && addDialogOpen.value) addError.value = detail
    else error.value = detail
  }
}

async function pollJob() {
  if (!job.value?.jobId) return
  try {
    const { data } = await api.get(`/plugins/jobs/${job.value.jobId}`)
    job.value = { ...job.value, ...data }
    if (data.done || data.failed) {
      stopPolling()
      if (data.done) {
        message.value = data.log?.[data.log.length - 1] ?? `${data.title ?? 'Plugin job'} finished.`
        await load()
        fetchSources()
      }
    }
  } catch {
    // Transient poll failure — keep trying until the dialog closes.
  }
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function closeJobDialog() {
  jobDialogOpen.value = false
  job.value = null
}

// --- Add plugin: a bare https repo URL + optional branch -------------------------
const addDialogOpen = ref(false)
const repoUrl = ref('')
const addError = ref('')
const branch = ref('')
const branchOptions = ref([])
const branchDefault = ref('')
const branchesLoading = ref(false)
const branchesError = ref('')
let branchesLoadedFor = ''

function openAddDialog() {
  repoUrl.value = ''
  addError.value = ''
  branch.value = ''
  branchOptions.value = []
  branchDefault.value = ''
  branchesError.value = ''
  branchesLoadedFor = ''
  addDialogOpen.value = true
}

// List the repo's branches when the URL field loses focus (once per URL): the picker
// preselects the remote default (HEAD, else main/master). Until then — and if the
// listing fails — a plain branch field stays available.
async function loadBranches() {
  const repo = repoUrl.value.trim()
  if (!repo || repo === branchesLoadedFor) return
  branchesLoadedFor = repo
  branch.value = ''
  branchOptions.value = []
  branchDefault.value = ''
  branchesError.value = ''
  if (!/^https:\/\/[^/\s]+\/\S+/.test(repo)) return
  branchesLoading.value = true
  try {
    const { data } = await api.get('/plugins/branches', { params: { repo } })
    branchOptions.value = data.branches ?? []
    branchDefault.value = data.default ?? ''
    if (branchDefault.value) branch.value = branchDefault.value
  } catch (requestError) {
    branchesError.value = requestError.response?.data?.detail
      ?? 'Could not list branches — you can still type one.'
  } finally {
    branchesLoading.value = false
  }
}

// --- Community discovery: GitHub search in the Community tab ----------------------
// The Community tab auto-lists every manifest-valid MediaPager.Plugins.* repo (top 10 —
// the server vets each candidate with a web query + manifest fetch only, never the code);
// typing in the box filters that same set with the same requirements. Queries are
// debounced to 400 ms and need 2+ characters to trigger a search; clearing returns to the
// auto-list. The anonymous GitHub APIs are rate-limited and the server caches each query
// for 30 minutes anyway.
const githubQuery = ref('')
const discoverResults = ref([])
const discoverLoading = ref(false)
const discoverError = ref('')

function normalizeRepo(url) {
  return String(url ?? '').trim().replace(/\/+$/, '').replace(/\.git$/i, '').toLowerCase()
}

const knownRepos = computed(() => {
  const known = new Set()
  for (const row of allRows.value) {
    if (row.repo) known.add(normalizeRepo(row.repo))
  }
  return known
})

const knownPluginIds = computed(() => new Set(
  allRows.value.map((row) => String(row.id ?? '').toLowerCase()),
))

// Discovery is an install catalog, not a second rendering of plugins already present in
// the loaded or available lists. Match by manifest id and normalized clone URL.
const styledResults = computed(() => discoverResults.value.filter((result) =>
  !knownPluginIds.value.has(String(result.pluginId ?? '').toLowerCase()) &&
  !knownRepos.value.has(normalizeRepo(result.cloneUrl))))

const discoveryResultsForCategory = computed(() =>
  activeCategory.value === 'community' ? styledResults.value : [])

async function loadDiscover(term) {
  discoverError.value = ''
  discoverLoading.value = true
  try {
    const { data } = await api.get('/plugins/discover', term ? { params: { q: term } } : {})
    discoverResults.value = data?.results ?? []
  } catch (requestError) {
    discoverResults.value = []
    discoverError.value = requestError.response?.data?.detail ?? 'Could not search GitHub.'
  } finally {
    discoverLoading.value = false
  }
}

function onGithubQuery(query) {
  const term = String(query ?? '').trim()
  loadDiscover(term.length < 2 ? '' : term)
}

// Auto-list the first time the Community tab opens (and again when it is re-entered with
// an empty box) — the server cache makes repeat opens cheap.
watch(activeCategory, (category) => {
  if (category === 'community' && !discoverResults.value.length && !discoverLoading.value)
    loadDiscover('')
})

function addFromDiscover(result) {
  startJob({ repo: result.cloneUrl, branch: result.defaultBranch })
}
</script>

<template>
  <div>
    <q-banner v-if="message" dense class="auth-message q-mb-md">{{ message }}</q-banner>
    <q-banner v-if="error" dense class="error-banner q-mb-md">{{ error }}</q-banner>

    <div v-if="loading && !allRows.length" class="flex flex-center q-pa-xl">
      <q-spinner-dots color="primary" size="2rem" />
    </div>

    <template v-else>
      <div class="row items-center no-wrap plugin-toolbar q-mb-xs">
        <div class="col plugin-cat-tabs">
          <q-tabs
            v-model="activeCategory"
            dense
            no-caps
            align="left"
            active-color="primary"
            indicator-color="primary"
            class="text-grey-4"
          >
            <q-tab v-for="tab in categoryTabs" :key="tab.name" :name="tab.name" :label="tab.label" />
          </q-tabs>
        </div>
        <q-btn
          class="col-auto q-ml-sm"
          flat
          dense
          color="primary"
          icon="add"
          label="Add plugin"
          @click="openAddDialog"
        />
      </div>

      <q-input
        v-if="activeCategory === 'community'"
        v-model="githubQuery"
        dark
        outlined
        dense
        clearable
        debounce="400"
        class="discover-search q-mb-xs"
        placeholder="Filter community plugins on GitHub…"
        :loading="discoverLoading"
        @update:model-value="onGithubQuery"
      >
        <template v-slot:prepend><q-icon name="search" /></template>
      </q-input>

      <div v-if="discoveryResultsForCategory.length" class="discover-results q-mb-sm">
        <div class="text-caption discover-header q-mb-xs">Community plugins on GitHub</div>
        <q-list dark separator dense class="rounded-borders">
          <q-item v-for="result in discoveryResultsForCategory" :key="result.id" class="discover-row">
            <q-item-section avatar>
              <q-avatar size="28px" color="grey-8">
                <img
                  v-if="result.ownerAvatarUrl"
                  :src="result.ownerAvatarUrl"
                  :alt="`${result.owner} avatar`"
                />
                <q-icon v-else name="extension" color="grey-5" />
              </q-avatar>
            </q-item-section>
            <q-item-section>
              <q-item-label class="discover-name">
                {{ result.name }}
                <q-chip
                  v-for="type in result.types ?? []"
                  :key="type"
                  :label="type"
                  outline
                  color="grey-5"
                  size="sm"
                  dense
                />
              </q-item-label>
              <q-item-label caption class="text-grey-6">
                {{ result.fullName }}<template v-if="result.stars"> · ★ {{ result.stars }}</template>
              </q-item-label>
              <q-item-label
                v-if="result.description"
                caption
                class="text-grey-6"
                style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap"
              >
                {{ result.description }}
              </q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-btn
                flat
                dense
                color="primary"
                icon="add"
                :label="`add @ ${result.defaultBranch || 'default'}`"
                @click="addFromDiscover(result)"
              />
            </q-item-section>
          </q-item>
        </q-list>
      </div>

      <q-banner v-if="activeCategory === 'community' && discoverError" dense class="error-banner q-mb-sm">
        {{ discoverError }}
      </q-banner>

      <div
        v-if="activeCategory === 'community' && !discoverLoading && !discoverError && !discoveryResultsForCategory.length"
        class="text-grey-6 q-mb-sm"
      >
        No uninstalled community plugins found.
      </div>

      <q-list v-if="visibleGroups.length" dark separator class="rounded-borders plugin-list">
        <template v-for="[category, items] in visibleGroups" :key="category">
          <q-item-label v-if="activeCategory === 'all'" header class="plugin-group-header">{{ categoryLabel(category) }}</q-item-label>

          <q-item v-for="plugin in items" :key="plugin.id" class="plugin-row">
          <q-item-section avatar>
            <q-icon
              :name="plugin.official ? 'verified' : 'extension'"
              :color="plugin.loaded && plugin.official ? 'primary' : 'grey-5'"
              size="24px"
            />
          </q-item-section>

          <q-item-section>
            <q-item-label class="plugin-name">
              {{ plugin.name }}
              <span v-if="plugin.version" class="plugin-version">v{{ plugin.version }}</span>
              <q-chip
                v-if="plugin.loaded"
                :label="plugin.official ? 'official' : 'community'"
                :color="plugin.official ? 'primary' : 'grey-7'"
                text-color="dark"
                size="sm"
                dense
                class="plugin-badge"
              />
              <q-chip
                v-else
                :label="plugin.deployed ? 'off' : 'not installed'"
                :color="plugin.deployed ? 'orange-8' : 'grey-7'"
                :text-color="plugin.deployed ? 'dark' : 'grey-1'"
                size="sm"
                dense
                class="plugin-badge"
              />
              <q-btn
                v-if="plugin.loaded && plugin.settings?.length"
                flat
                round
                dense
                size="sm"
                icon="settings"
                color="grey-4"
                class="plugin-settings-gear"
                :aria-label="`Settings for ${plugin.name}`"
                :title="`Settings for ${plugin.name}`"
                @click="emit('open-settings', plugin.id)"
              />
            </q-item-label>
            <q-item-label caption class="plugin-id">{{ plugin.id }}</q-item-label>
            <q-item-label v-if="!plugin.loaded && plugin.repo" caption class="text-grey-6" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
              {{ plugin.repo }}<span v-if="plugin.author"> · {{ plugin.author }}</span>
            </q-item-label>
            <q-item-label v-else-if="plugin.description" caption class="text-grey-6">{{ plugin.description }}</q-item-label>
            <q-item-label v-if="plugin.loaded" caption class="plugin-caps">
              <q-chip
                v-for="cap in plugin.capabilities"
                :key="cap"
                :label="cap"
                outline
                color="grey-5"
                size="sm"
                dense
              />
            </q-item-label>
          </q-item-section>

          <q-item-section side>
            <div class="row items-center no-wrap q-gutter-xs">
              <q-btn
                v-if="!plugin.loaded"
                flat
                dense
                color="primary"
                icon="power_settings_new"
                label="turn on"
                :loading="enablingId === plugin.id"
                @click="enablePlugin(plugin)"
              />
              <q-icon
                v-else-if="plugin.locked"
                name="lock"
                color="grey-5"
                size="20px"
                :aria-label="plugin.lockReason || 'Required plugin'"
              >
                <q-tooltip>{{ plugin.lockReason || 'This plugin is required and cannot be turned off.' }}</q-tooltip>
              </q-icon>
              <q-btn
                v-else
                flat
                dense
                color="negative"
                icon="power_settings_new"
                label="turn off"
                :loading="disablingId === plugin.id || uninstallingId === plugin.id"
                @click="plugin.official ? disablePlugin(plugin) : askUninstall(plugin)"
              />
            </div>
          </q-item-section>
          </q-item>
        </template>
      </q-list>
      <div v-else-if="activeCategory !== 'community' && !discoveryResultsForCategory.length" class="text-grey-6">Nothing in this category yet.</div>
    </template>

    <q-dialog :model-value="!!confirmTarget" @update:model-value="confirmTarget = null">
      <q-card dark class="confirm-card">
        <q-card-section class="text-h6">Turn off {{ confirmTarget?.name }}?</q-card-section>
        <q-card-section class="text-grey-6">
          The plugin is unloaded now and stays off after a restart. Its files are kept, so
          you can turn it back on later.
        </q-card-section>
        <q-card-section v-if="confirmTarget?.requires?.length" class="q-pt-none">
          <q-checkbox
            v-model="removeUnusedDependencies"
            dark
            label="Also uninstall dependencies no other loaded plugin needs"
          />
          <div class="text-caption text-grey-6 q-ml-lg">
            {{ confirmTarget.requires.join(', ') }}
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="cancel" color="grey-5" v-close-popup />
          <q-btn unelevated label="turn off" color="negative" @click="uninstall(confirmTarget)" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog :model-value="addDialogOpen" @update:model-value="addDialogOpen = false">
      <q-card dark class="plugin-job-card">
        <q-card-section class="text-h6">Add plugin</q-card-section>
        <q-card-section>
          <div class="text-caption q-mb-sm">
            Paste the plugin's GitHub repository URL — https (public repos, no setup) or
            an ssh URL like git@github.com:owner/repo (private repos need
            MEDIAPAGER_GIT_SSH_PRIVATE_KEY_PATH on the server). It is cloned, built and
            verified, then registered as a community plugin.
          </div>
          <q-input
            v-model="repoUrl"
            dark
            outlined
            dense
            label="Repository URL"
            placeholder="https://github.com/owner/repo"
            @blur="loadBranches"
            @keyup.enter="repoUrl.trim() && startJob({ repo: repoUrl.trim(), branch })"
          />
          <q-select
            v-if="branchOptions.length"
            v-model="branch"
            dark
            outlined
            dense
            clearable
            options-dense
            label="Branch"
            class="q-mt-sm"
            :options="branchOptions"
            :loading="branchesLoading"
            :hint="branchDefault ? `Defaults to ${branchDefault}` : undefined"
          />
          <q-input
            v-else
            v-model="branch"
            dark
            outlined
            dense
            label="Branch (optional)"
            class="q-mt-sm"
            placeholder="repo default — usually main or master"
            :disable="branchesLoading"
          />
          <div v-if="branchesError" class="text-caption text-orange-4 q-mt-xs">{{ branchesError }}</div>
          <q-banner v-if="addError" dense class="error-banner q-mt-sm">{{ addError }}</q-banner>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="cancel" color="grey-5" v-close-popup />
          <q-btn
            unelevated
            label="add"
            color="primary"
            text-color="dark"
            icon="add"
            :disable="!repoUrl.trim()"
            @click="startJob({ repo: repoUrl.trim(), branch })"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog :model-value="jobDialogOpen" persistent>
      <q-card dark class="plugin-job-card">
        <q-card-section class="row items-center no-wrap">
          <div class="text-h6">{{ job?.title ?? 'Plugin job' }}</div>
          <q-space />
          <q-btn
            flat
            round
            dense
            icon="close"
            aria-label="Close"
            :disable="!!job && !job.done && !job.failed"
            @click="closeJobDialog"
          />
        </q-card-section>
        <q-card-section>
          <q-linear-progress
            :value="(job?.percent ?? 0) / 100"
            color="primary"
            track-color="grey-8"
            class="q-mb-sm"
            :indeterminate="!!job && job.percent < 3 && !job.done && !job.failed"
          />
          <div class="row items-center q-gutter-xs q-mb-sm">
            <q-icon
              :name="job?.failed ? 'error' : job?.done ? 'check_circle' : 'pending'"
              :color="job?.failed ? 'negative' : job?.done ? 'positive' : 'primary'"
              size="16px"
            />
            <span class="text-caption text-grey-4">{{ jobStageLabel }}</span>
            <q-space />
            <span class="text-caption text-grey-6">{{ job?.percent ?? 0 }}%</span>
          </div>
          <div class="plugin-job-log">
            <div v-for="(line, index) in job?.log ?? []" :key="index" class="plugin-job-log-line">{{ line }}</div>
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn
            v-if="job?.done || job?.failed"
            flat
            label="close"
            color="grey-4"
            @click="closeJobDialog"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<style scoped>
.plugin-toolbar {
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.plugin-cat-tabs {
  overflow-x: auto;
  min-width: 0;
}

.plugin-list {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.plugin-group-header {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #9e9e9e;
  background: rgba(255, 255, 255, 0.03);
}

.plugin-name {
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.plugin-version {
  color: #9e9e9e;
  font-weight: 400;
  font-size: 0.85em;
}

.plugin-badge {
  text-transform: uppercase;
  font-size: 0.65rem;
  letter-spacing: 0.5px;
}

.plugin-settings-gear {
  margin-left: 2px;
}

.discover-search {
  max-width: 460px;
}

.discover-header {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #9e9e9e;
}

.discover-results {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 4px;
}

.discover-name {
  font-weight: 600;
}

.plugin-id {
  font-family: monospace;
  font-size: 0.75rem;
}

.plugin-caps {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}

.confirm-card {
  min-width: 320px;
}

.plugin-job-card {
  min-width: 440px;
  width: 520px;
  max-width: 92vw;
}

.plugin-job-log {
  max-height: 220px;
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 4px;
  padding: 8px 10px;
  font-family: monospace;
  font-size: 0.78rem;
  line-height: 1.5;
}

.plugin-job-log-line {
  color: #bdbdbd;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
