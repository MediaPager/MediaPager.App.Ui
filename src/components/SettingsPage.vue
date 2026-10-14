<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../composables/useApi'
import { useAuth } from '../composables/useAuth'
import { useCatalogs } from '../composables/useCatalogs'
import CatalogFormDialog from './CatalogFormDialog.vue'
import CatalogDeleteDialog from './CatalogDeleteDialog.vue'
import {
  useSettings,
  settingsGroups,
} from '../composables/useSettings'
import { useSources } from '../composables/useSources'
import PluginsPanel from './PluginsPanel.vue'
import PluginSettingsPanel from './PluginSettingsPanel.vue'
import PluginCustomUiFrame from './PluginCustomUiFrame.vue'
import NotFoundPage from './NotFoundPage.vue'
import UsersPanel from './UsersPanel.vue'

const { canInvite, canEditSettings, canEditCatalogs, isSuperAdmin } = useAuth()
const mobileNavOpen = defineModel('mobileNavOpen', { type: Boolean, default: false })
const {
  settingsTab,
  settingsValues,
  settingsLoading,
  settingsMessage,
  settingsError,
  browseLoadingKey,
  browseFolder,
  saveSettings,
  setupChecklist,
  setupLoading,
  setupReady,
  fetchSetupChecklist,
} = useSettings()

// Invite-a-user (admin only).
const inviteEmail = ref('')
const inviteMessage = ref('')
const inviteError = ref('')
const inviteLoading = ref(false)
const gitSshKeyConfigured = ref(false)
const gitSshKeyInput = ref('')
const gitSshKeyLoading = ref(false)
const gitSshKeyMessage = ref('')
const gitSshKeyError = ref('')

// Catalog management (scoped: admin:catalogs-edit / admin:super).
const { catalogs, catalogsLoading, fetchCatalogs } = useCatalogs()
const catalogFormOpen = ref(false)
const editingCatalog = ref(null)
const deleteCatalogTarget = ref(null)
const deleteCatalogOpen = ref(false)

// Catalog management is scoped to catalog administrators.
fetchCatalogs()

// Setup checklist admins see on the first Settings tab.
fetchSetupChecklist()

// Settings tab ⇆ route param (/settings/:tab). Tab state is the shared composable ref;
// the route is the source of truth on arrival so deep links + back/forward work.
// (The route watcher itself lives below, next to openPluginSettings — it needs both.)
const route = useRoute()
const router = useRouter()

watch(settingsTab, (tab) => {
  if (tab && tab !== route.params.tab) router.push({ name: 'settings', params: { tab } })
})

function openCreateCatalog() {
  editingCatalog.value = null
  catalogFormOpen.value = true
}

function goToSettingsTab(name) {
  settingsTab.value = name
}

function goToCatalogsTab() {
  settingsTab.value = 'catalogs'
}

function fixSetupItem(item) {
  if (item.action === 'catalogs') goToCatalogsTab()
  else if (item.action === 'general') goToSettingsTab('general')
  else if (item.action === 'plugins') goToSettingsTab('plugins')
  // Plugin-scoped items (e.g. the TMDB key) open that plugin's settings dialog —
  // plugin settings have no nav tabs of their own.
  else if (typeof item.action === 'string' && item.action.startsWith('plugin:')) {
    openPluginSettings(item.action.slice('plugin:'.length))
  }
}

async function saveAndRefresh() {
  await saveSettings()
  fetchSetupChecklist()
}

function openEditCatalog(catalog) {
  editingCatalog.value = catalog
  catalogFormOpen.value = true
}

function openDeleteCatalog(catalog) {
  deleteCatalogTarget.value = catalog
  deleteCatalogOpen.value = true
}

// Plugins may contribute a Settings nav entry; gear buttons remain a shortcut from
// plugin management and provider pickers.
const {
  plugins: sourcePlugins,
  pluginSettingsNav,
  officialPlugins,
  fetchSources,
  fetchOfficialPlugins,
  loaded: sourcesLoaded,
} = useSources()

// A `plugin:{id}` URL (legacy deep links) and the checklist's "Set up" actions open the
// plugin's settings dialog over whatever tab is current. Resolved from the loaded plugin
// list (each entry carries its settings schema); if the catalog isn't in yet, retry when
// it arrives.
const settingsDialogPlugin = ref(null)
let pendingSettingsId = null

function openPluginSettings(pluginId) {
  const found = sourcePlugins.value.find((plugin) => plugin.id === pluginId)
  if (found) {
    settingsDialogPlugin.value = found
    pendingSettingsId = null
  } else {
    pendingSettingsId = pluginId
  }
}

watch(sourcePlugins, () => {
  if (!pendingSettingsId) return
  const found = sourcePlugins.value.find((plugin) => plugin.id === pendingSettingsId)
  if (found) {
    settingsDialogPlugin.value = found
    pendingSettingsId = null
  }
})

// route ⇆ settingsTab (after openPluginSettings: the immediate run must not hit a
// temporal-dead-zone reference).
watch(() => route.params.tab, (tab) => {
  if (typeof tab !== 'string' || !tab) return
  if (tab.startsWith('plugin:')) {
    openPluginSettings(tab.slice('plugin:'.length))
    if (settingsTab.value !== 'plugins') settingsTab.value = 'plugins'
    router.replace({ name: 'settings', params: { tab: 'plugins' } })
    return
  }
  if (tab !== settingsTab.value) settingsTab.value = tab
}, { immediate: true })
if (!sourcesLoaded.value) fetchSources()
if (canEditSettings.value) fetchOfficialPlugins()
if (isSuperAdmin.value) loadGitSshKeyStatus()

async function loadGitSshKeyStatus() {
  try {
    const { data } = await api.get('/settings/git-ssh-key')
    gitSshKeyConfigured.value = !!data?.configured
  } catch { /* keep the settings page usable if the status check fails */ }
}

async function saveGitSshKey() {
  gitSshKeyLoading.value = true
  gitSshKeyMessage.value = ''
  gitSshKeyError.value = ''
  try {
    const { data } = await api.put('/settings/git-ssh-key', { privateKey: gitSshKeyInput.value })
    gitSshKeyConfigured.value = true
    gitSshKeyInput.value = ''
    gitSshKeyMessage.value = data?.message ?? 'Encrypted SSH key saved.'
  } catch (requestError) {
    gitSshKeyError.value = requestError.response?.data?.error ?? requestError.response?.data?.detail ?? 'Could not save the SSH key.'
  } finally {
    gitSshKeyLoading.value = false
  }
}

async function clearGitSshKey() {
  gitSshKeyLoading.value = true
  gitSshKeyMessage.value = ''
  gitSshKeyError.value = ''
  try {
    const { data } = await api.delete('/settings/git-ssh-key')
    gitSshKeyConfigured.value = false
    gitSshKeyMessage.value = data?.message ?? 'Saved SSH key removed.'
  } catch (requestError) {
    gitSshKeyError.value = requestError.response?.data?.detail ?? 'Could not remove the SSH key.'
  } finally {
    gitSshKeyLoading.value = false
  }
}

// Email providers are plugins: the provider dropdown lists every loaded plugin with the
// "email" capability, the active one's settings render through its own schema panel, and
// the official-provider note offers the ones that aren't installed yet (links from
// GET /plugins/official, the appsettings catalog).
const emailPlugins = computed(() =>
  sourcePlugins.value.filter((plugin) => (plugin.capabilities ?? []).includes('email')))
const emailProviderOptions = computed(() =>
  emailPlugins.value.map((plugin) => ({ label: plugin.name, value: plugin.id })))
const activeEmailPlugin = computed(() =>
  emailPlugins.value.find((plugin) => plugin.id === settingsValues.value['Settings:Email:Provider']) ??
  emailPlugins.value[0] ?? null)
const officialEmailProviders = computed(() =>
  officialPlugins.value.filter((entry) => entry.category === 'email'))

async function pickEmailProvider(pluginId) {
  settingsValues.value['Settings:Email:Provider'] = pluginId
  settingsError.value = ''
  try {
    // Persisted immediately: the settings panel below swaps to the picked provider.
    const { data } = await api.put('/settings', { 'Settings:Email:Provider': pluginId })
    settingsMessage.value = data?.message ?? 'Settings saved.'
    await fetchSetupChecklist()
  } catch (requestError) {
    settingsError.value = requestError.response?.data?.detail ?? 'Could not save the email provider.'
  }
}

// Subtitle providers are plugins too: the dropdown lists every loaded plugin with the
// "subtitles" capability, the active one's credentials render through its own schema
// panel (plugins.opensubtitles.* / plugins.subdl.*), and the pick persists immediately.
const subtitlePlugins = computed(() =>
  sourcePlugins.value.filter((plugin) => (plugin.capabilities ?? []).includes('subtitles')))
const subtitleProviderOptions = computed(() =>
  subtitlePlugins.value.map((plugin) => ({ label: plugin.name, value: plugin.id })))
const activeSubtitlePlugin = computed(() => {
  const wanted = settingsValues.value['Settings:Subtitles:Provider'] ?? ''
  // Full plugin id, or a legacy short value ("subdl") matched by last id segment.
  return subtitlePlugins.value.find((plugin) => plugin.id === wanted) ??
    (wanted ? subtitlePlugins.value.find((plugin) => plugin.id.endsWith(`.${wanted}`)) : null) ??
    subtitlePlugins.value[0] ?? null
})

async function pickSubtitleProvider(pluginId) {
  settingsValues.value['Settings:Subtitles:Provider'] = pluginId
  settingsError.value = ''
  try {
    // Persisted immediately: the settings panel below swaps to the picked provider.
    const { data } = await api.put('/settings', { 'Settings:Subtitles:Provider': pluginId })
    settingsMessage.value = data?.message ?? 'Settings saved.'
    fetchSetupChecklist()
  } catch (requestError) {
    settingsError.value = requestError.response?.data?.detail ?? 'Could not save the subtitle provider.'
  }
}

const storageFields = settingsGroups.find((group) => group.name === 'storage').fields
const applicationDataFields = storageFields.filter((field) => [
  'Settings:Storage:Root',
  'Settings:Storage:Config:Directory',
  'Settings:Storage:Security:DataProtectionKeysDirectory',
].includes(field.key))
const artworkFields = storageFields.filter((field) => [
  'Settings:Storage:Artwork:PosterDirectory',
  'Settings:Storage:Artwork:BackgroundDirectory',
].includes(field.key))
const managedStorageFields = storageFields.filter((field) => [
  'Settings:Storage:Tools:Directory',
  'Settings:Storage:Plugins:CommunityDirectory',
  'Settings:Storage:Plugins:InstalledOfficialDirectory',
].includes(field.key))

const isPluginTab = computed(() => settingsTab.value.startsWith('plugin-nav:'))

// The plugin-management screen (install/uninstall, per-plugin settings gear) is
// admin:super only — a fixed tab alongside the core settings sections.
const manageGroup = computed(() =>
  isSuperAdmin.value ? [{ name: 'plugins', label: 'Plugins', manage: true }] : [])

const pluginNavGroups = computed(() => pluginSettingsNav.value.map((entry) => ({
  name: entry.key,
  label: entry.label,
  icon: entry.icon,
  pluginNav: true,
  pluginId: entry.pluginId,
  uiPath: entry.uiPath,
})))

// Tabs are permission-filtered: a catalogs-only user must not see (or 403-load)
// the settings panels that require admin:settings-edit. Setup retires from the nav
// once every checklist item is satisfied — there is nothing left to do there.
const visibleGroups = computed(() => [
  ...settingsGroups.filter((group) =>
    group.name === 'catalogs'
      ? canEditCatalogs.value
      : group.name === 'users'
        ? canInvite.value
        : group.name === 'storage'
          ? canEditSettings.value
        : group.name === 'setup'
          ? canEditSettings.value && !setupReady.value
          : canEditSettings.value),
  ...(canEditSettings.value ? pluginNavGroups.value : []),
  ...manageGroup.value,
])

// If Setup vanishes while the user is sitting on it (last item just got satisfied),
// move along to General — never leave a dead tab or an inline 404 behind.
watch(setupReady, (ready) => {
  if (ready && settingsTab.value === 'setup') goToSettingsTab('general')
})

// Keep the active tab pointing at something visible (e.g. catalogs-only users
// would otherwise land on 'general', which is hidden for them). A settings tab that
// matches no visible group once the plugin catalog is in is a bad URL → 404 inline.
const settingsTabNotFound = computed(() =>
  sourcesLoaded.value &&
  visibleGroups.value.length > 0 &&
  !visibleGroups.value.some((group) => group.name === settingsTab.value))

watch(visibleGroups, (groups) => {
  if (settingsTabNotFound.value) return
  if (groups.length && !groups.some((group) => group.name === settingsTab.value)) {
    settingsTab.value = groups[0].name
  }
}, { immediate: true })

async function sendInvite() {
  inviteLoading.value = true
  inviteMessage.value = ''
  inviteError.value = ''
  try {
    const { data } = await api.post('/auth/invites', { email: inviteEmail.value })
    inviteMessage.value = data.message
    inviteEmail.value = ''
  } catch (requestError) {
    inviteError.value = requestError.response?.data?.detail ?? requestError.response?.data?.error ?? 'Could not send invitation.'
  } finally {
    inviteLoading.value = false
  }
}
</script>

<template>
  <q-page class="settings-page">
    <div class="settings-layout">
      <div class="settings-body">
        <q-tabs
          v-model="settingsTab"
          vertical
          dark
          class="settings-nav"
          :class="{ 'settings-nav--mobile-open': mobileNavOpen }"
          active-color="primary"
          indicator-color="primary"
          @update:model-value="mobileNavOpen = false"
        >
          <q-tab v-for="group in visibleGroups" :key="group.name" :name="group.name" :label="group.label" :icon="group.icon" />
        </q-tabs>
        <div
          v-if="mobileNavOpen"
          class="settings-nav-backdrop"
          @click="mobileNavOpen = false"
        />

        <div class="settings-panel" :class="{ 'settings-panel--plugin-ui': isPluginTab }">
          <NotFoundPage v-if="settingsTabNotFound" />
          <template v-else>
          <q-banner v-if="settingsMessage" dense class="auth-message q-mb-md">{{ settingsMessage }}</q-banner>
          <q-banner v-if="settingsError" dense class="error-banner q-mb-md">{{ settingsError }}</q-banner>

          <div v-if="settingsLoading && !Object.keys(settingsValues).length" class="flex flex-center q-pa-xl">
            <q-spinner-dots color="primary" size="2rem" />
          </div>

          <q-tab-panels v-else v-model="settingsTab" animated class="settings-panels">
            <q-tab-panel
              v-for="group in visibleGroups"
              :key="group.name"
              :name="group.name"
              :class="{
                'plugins-tab-panel': group.manage,
                'users-tab-panel': group.name === 'users',
                'plugin-ui-tab-panel': group.pluginNav && group.uiPath,
              }"
            >
              <div class="settings-panel-heading row items-center justify-between q-mb-md">
                <div class="panel-title">{{ group.label }}</div>
                <q-btn
                  v-if="canEditSettings && group.name === settingsTab && group.name !== 'catalogs' && group.name !== 'setup' && group.name !== 'plugins' && !group.pluginNav"
                  unelevated
                  color="primary"
                  text-color="dark"
                  icon="save"
                  label="save"
                  :loading="settingsLoading"
                  @click="saveAndRefresh"
                />
                <q-btn
                  v-else-if="group.name === 'catalogs' && canEditCatalogs"
                  unelevated
                  color="primary"
                  text-color="dark"
                  icon="add"
                  label="new catalog"
                  @click="openCreateCatalog"
                />
              </div>

              <template v-if="group.manage">
                <PluginsPanel @open-settings="openPluginSettings" />
              </template>

              <template v-else-if="group.name === 'users'">
                <UsersPanel v-if="isSuperAdmin" />
                <div v-else class="invite-only-intro q-mb-lg">
                  <div class="text-h5 text-weight-bold">Invite someone to your library</div>
                  <div class="text-grey-5 q-mt-sm">New accounts start with basic access and can’t open administration settings.</div>
                </div>
              </template>

              <template v-else-if="group.pluginNav">
                <div v-if="group.uiPath" class="plugin-settings-frame">
                  <PluginCustomUiFrame
                    :key="group.pluginId"
                    :plugin-key="group.pluginId"
                    :ui-url="group.uiPath"
                  />
                </div>
                <PluginSettingsPanel
                  v-else
                  :key="group.pluginId"
                  :plugin="sourcePlugins.find((plugin) => plugin.id === group.pluginId)"
                  @saved="fetchSetupChecklist"
                />
              </template>

              <template v-else-if="group.name === 'setup'">
                <q-banner v-if="setupLoading" dense rounded class="q-mb-md">
                  <template #avatar>
                    <q-spinner-dots color="primary" size="1rem" />
                  </template>
                  Checking setup…
                </q-banner>
                <q-banner v-else-if="setupReady" dense rounded class="q-mb-md setup-ok-banner">
                  <template #avatar>
                    <q-icon name="check_circle" color="positive" />
                  </template>
                  <span class="text-weight-medium">Everything is set up.</span>
                  <span> Your configured plugins and library are ready to go.</span>
                </q-banner>
                <div v-else-if="setupChecklist.length" class="setup-checklist">
                  <div
                    v-for="item in setupChecklist"
                    :key="item.key"
                    class="setup-item row items-center q-gutter-sm"
                  >
                    <q-icon
                      :name="item.ok ? 'check_circle' : 'error'"
                      :color="item.ok ? 'positive' : 'warning'"
                      size="22px"
                    />
                    <div class="col">
                      <div class="text-weight-medium">{{ item.label }}</div>
                      <div v-if="!item.ok" class="text-grey-6 text-body2">{{ item.hint }}</div>
                    </div>
                    <q-btn
                      v-if="!item.ok && item.action"
                      flat
                      dense
                      color="primary"
                      label="Set up"
                      @click="fixSetupItem(item)"
                    />
                  </div>
                </div>
                <div v-else class="text-grey-6">
                  Setup check is unavailable right now — make sure settings are reachable.
                </div>
              </template>

              <template v-else-if="group.name === 'storage'">
                <div class="storage-settings-intro q-mb-lg">
                  <div class="text-body2 text-grey-6">
                    Application-managed files are grouped below. These paths are read-only here and come from your deployment configuration. Catalog media remains at the path set on each catalog.
                  </div>
                </div>

                <q-card flat bordered dark class="storage-card q-mb-md">
                  <q-card-section class="row items-center no-wrap q-gutter-md storage-card__header">
                    <q-avatar rounded class="storage-card__icon storage-card__icon--blue">
                      <q-icon name="inventory_2" />
                    </q-avatar>
                    <div class="col">
                      <div class="text-subtitle1 text-weight-bold">Application data</div>
                      <div class="text-caption text-grey-6">Persistent root, runtime configuration, and security keys.</div>
                    </div>
                    <q-badge outline color="grey-5" label="deployment managed" />
                  </q-card-section>
                  <q-separator dark />
                  <q-card-section class="row q-col-gutter-md">
                    <q-input
                      v-for="field in applicationDataFields"
                      :key="field.key"
                      v-model="settingsValues[field.key]"
                      dark outlined dense readonly
                      :label="field.label"
                      class="col-12 col-xl-4 storage-path-field"
                    />
                  </q-card-section>
                </q-card>

                <q-card flat bordered dark class="storage-card q-mb-md">
                  <q-card-section class="row items-center no-wrap q-gutter-md storage-card__header">
                    <q-avatar rounded class="storage-card__icon storage-card__icon--green">
                      <q-icon name="folder_open" />
                    </q-avatar>
                    <div class="col">
                      <div class="text-subtitle1 text-weight-bold">Managed file locations</div>
                      <div class="text-caption text-grey-6">Directories for local artwork, tools, and installed plugins.</div>
                    </div>
                  </q-card-section>
                  <q-separator dark />
                  <q-card-section class="row q-col-gutter-xl">
                    <div class="col-12 col-xl-6 storage-path-group">
                      <div class="storage-path-group__title">Artwork</div>
                      <q-input
                        v-for="field in artworkFields"
                        :key="field.key"
                        v-model="settingsValues[field.key]"
                        dark outlined dense readonly
                        :label="field.label"
                        class="q-mb-md storage-path-field"
                      />
                    </div>
                    <div class="col-12 col-xl-6 storage-path-group">
                      <div class="storage-path-group__title">Tools & plugins</div>
                      <q-input
                        v-for="field in managedStorageFields"
                        :key="field.key"
                        v-model="settingsValues[field.key]"
                        dark outlined dense readonly
                        :label="field.label"
                        class="q-mb-md storage-path-field"
                      />
                    </div>
                  </q-card-section>
                </q-card>

                <q-banner dense rounded class="storage-media-note">
                  <template #avatar><q-icon name="video_library" color="primary" /></template>
                  <div class="text-weight-medium">Keep large media libraries separate</div>
                  <div class="text-caption text-grey-6 q-mt-xs">
                    Catalog media is not stored in the application data directories. Mount a host or NAS library at a stable path such as <code>/mnt/media</code>, then use that container path when configuring a catalog.
                  </div>
                </q-banner>
              </template>

              <template v-else-if="group.name === 'general'">
                <template v-for="field in group.fields" :key="field.key">
                  <q-input
                    v-model="settingsValues[field.key]"
                    dark
                    outlined
                    dense
                    :type="field.type === 'password' ? 'password' : 'text'"
                    :label="field.label"
                    :readonly="field.readonly"
                    class="q-mb-md"
                    :class="{ 'field-required-empty': field.required && !(settingsValues[field.key] ?? '').trim() }"
                  >
                    <template #append>
                      <q-btn
                        v-if="field.browse"
                        flat
                        round
                        dense
                        icon="more_vert"
                        color="primary"
                        :loading="browseLoadingKey === field.key"
                        aria-label="Choose folder"
                        title="Choose folder"
                        @click.prevent="browseFolder(field.key)"
                      />
                    </template>
                  </q-input>
                  <div v-if="field.key === 'Settings:Site:BaseUrl'" class="text-caption text-grey-6 q-mt-negative q-mb-md">
                    Saved in this site’s runtime settings and used for new email links, taking precedence over the environment fallback.
                  </div>
                </template>
                <div v-if="isSuperAdmin" class="git-key-card q-mb-lg">
                  <div class="row items-center no-wrap q-gutter-sm">
                    <q-icon name="key" color="primary" size="20px" />
                    <div class="col">
                      <div class="text-weight-medium">Private Git access</div>
                      <div class="text-caption text-grey-6">
                        {{ gitSshKeyConfigured ? 'An SSH key is saved and encrypted in the settings database.' : 'Add a deploy key to install plugins from private repositories.' }}
                      </div>
                    </div>
                    <q-badge v-if="gitSshKeyConfigured" color="positive" label="configured" />
                  </div>
                  <q-input
                    v-model="gitSshKeyInput"
                    type="textarea"
                    dark outlined dense autogrow
                    label="Paste SSH private key"
                    autocomplete="new-password"
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                    class="q-mt-md"
                  />
                  <div class="row justify-end q-gutter-sm q-mt-sm">
                    <q-btn v-if="gitSshKeyConfigured" flat dense no-caps color="negative" label="Remove saved key" :loading="gitSshKeyLoading" @click="clearGitSshKey" />
                    <q-btn unelevated dense no-caps color="primary" text-color="dark" icon="lock" label="Save encrypted key" :disable="!gitSshKeyInput.trim()" :loading="gitSshKeyLoading" @click="saveGitSshKey" />
                  </div>
                  <q-banner v-if="gitSshKeyMessage" dense rounded class="auth-message q-mt-sm">{{ gitSshKeyMessage }}</q-banner>
                  <q-banner v-if="gitSshKeyError" dense rounded class="error-banner q-mt-sm">{{ gitSshKeyError }}</q-banner>
                </div>

                <q-separator spaced class="q-mt-none" />
                <div class="panel-title q-mb-md">Providers</div>

                <q-select
                  :model-value="settingsValues['Settings:Email:Provider'] || activeEmailPlugin?.id || null"
                  :options="emailProviderOptions"
                  dark
                  dense
                  outlined
                  emit-value
                  map-options
                  label="System email provider"
                  class="q-mb-xs"
                  @update:model-value="pickEmailProvider"
                >
                  <template #append>
                    <q-btn
                      flat
                      round
                      dense
                      icon="settings"
                      color="grey-4"
                      :disable="!activeEmailPlugin"
                      :aria-label="activeEmailPlugin ? `Settings for ${activeEmailPlugin.name}` : 'No email provider loaded'"
                      :title="activeEmailPlugin ? `${activeEmailPlugin.name} settings` : 'No email provider loaded'"
                      @click="activeEmailPlugin && openPluginSettings(activeEmailPlugin.id)"
                    />
                  </template>
                </q-select>
                <div class="text-caption text-grey-6 q-mb-md">
                  Used for invitations and password resets. If the selected provider is not configured, MediaPager uses another configured provider when available.
                </div>
                <q-banner v-if="officialEmailProviders.length" dense class="email-providers-note q-mb-md">
                  <div class="text-caption">
                    <template v-for="(provider, index) in officialEmailProviders" :key="provider.id">
                      <span v-if="index"> · </span>
                      <a v-if="!provider.installed" :href="provider.repo" target="_blank" rel="noopener noreferrer">{{ provider.name }}</a>
                      <span v-else>{{ provider.name }} <q-icon name="check_circle" color="positive" size="14px" /></span>
                    </template>
                  </div>
                  <div class="text-caption text-grey-6">
                    SMTP ships with the app. Enable another provider under Settings → Plugins,
                    then select it here. Open the selected provider's settings with the gear.
                  </div>
                </q-banner>

                <q-select
                  :model-value="activeSubtitlePlugin?.id || settingsValues['Settings:Subtitles:Provider'] || null"
                  :options="subtitleProviderOptions"
                  dark
                  dense
                  outlined
                  emit-value
                  map-options
                  label="Subtitle provider"
                  class="q-mb-xs"
                  @update:model-value="pickSubtitleProvider"
                >
                  <template #append>
                    <q-btn
                      flat
                      round
                      dense
                      icon="settings"
                      color="grey-4"
                      :disable="!activeSubtitlePlugin"
                      :aria-label="activeSubtitlePlugin ? `Settings for ${activeSubtitlePlugin.name}` : 'No subtitle provider loaded'"
                      :title="activeSubtitlePlugin ? `${activeSubtitlePlugin.name} settings` : 'No subtitle provider loaded'"
                      @click="activeSubtitlePlugin && openPluginSettings(activeSubtitlePlugin.id)"
                    />
                  </template>
                </q-select>
                <div v-if="!subtitleProviderOptions.length" class="text-caption text-grey-6 q-mb-md">
                  No subtitle provider is loaded yet — add one under Settings → Plugins.
                </div>
                <div v-else class="q-mb-md"></div>
              </template>

              <template v-else-if="group.name === 'catalogs'">
                <div v-if="catalogsLoading" class="flex flex-center q-pa-xl">
                  <q-spinner-dots color="primary" size="2rem" />
                </div>

                <div v-else-if="!catalogs.length" class="text-grey-6 q-mb-md">
                  No catalogs yet. Create one with the button above.
                </div>

                <q-list v-else bordered separator class="catalog-manage-list">
                  <q-item
                    v-for="catalog in catalogs"
                    :key="catalog.id"
                    class="catalog-manage-item"
                  >
                    <q-item-section>
                      <q-item-label>{{ catalog.name }}</q-item-label>
                      <q-item-label caption>
                        {{ catalog.catalogType.name }} · {{ catalog.catalogType.mediaType.name }}
                      </q-item-label>
                      <q-item-label v-if="catalog.path" caption class="text-grey-7" style="word-break: break-all">
                        <q-icon name="folder" size="12px" /> {{ catalog.path }}
                      </q-item-label>
                    </q-item-section>
                    <q-item-section side>
                      <div class="row q-gutter-xs">
                        <q-btn
                          flat
                          round
                          dense
                          icon="edit"
                          size="sm"
                          color="grey-5"
                          aria-label="Edit catalog"
                          title="Edit"
                          @click="openEditCatalog(catalog)"
                        />
                        <q-btn
                          flat
                          round
                          dense
                          icon="delete"
                          size="sm"
                          color="negative"
                          aria-label="Delete catalog"
                          title="Delete"
                          @click="openDeleteCatalog(catalog)"
                        />
                      </div>
                    </q-item-section>
                  </q-item>
                </q-list>
              </template>

              <template v-else>
                <q-input
                  v-for="field in group.fields"
                  :key="field.key"
                  v-model="settingsValues[field.key]"
                  dark
                  outlined
                  dense
                  :type="field.type === 'password' ? 'password' : 'text'"
                  :label="field.label"
                  class="q-mb-md"
                  :class="{ 'field-required-empty': field.required && !(settingsValues[field.key] ?? '').trim() }"
                >
                  <template #append>
                    <q-btn
                      v-if="field.browse"
                      flat
                      round
                      dense
                      icon="more_vert"
                      color="primary"
                      :loading="browseLoadingKey === field.key"
                      aria-label="Choose folder"
                      title="Choose folder"
                      @click.prevent="browseFolder(field.key)"
                    />
                  </template>
                </q-input>
              </template>

              <div v-if="group.name === 'users' && canInvite" class="settings-invite q-mt-lg">
                <div class="panel-title">Invite a user</div>
                <q-form class="invite-form" @submit.prevent="sendInvite">
                  <q-input
                    v-model="inviteEmail"
                    dark
                    outlined
                    dense
                    type="email"
                    autocomplete="email"
                    label="Email address"
                    required
                  />
                  <q-btn
                    type="submit"
                    unelevated
                    color="primary"
                    text-color="dark"
                    icon="send"
                    label="send invite"
                    :loading="inviteLoading"
                  />
                </q-form>
                <q-banner v-if="inviteMessage" dense class="auth-message q-mt-md">{{ inviteMessage }}</q-banner>
                <q-banner v-if="inviteError" dense class="error-banner q-mt-md">{{ inviteError }}</q-banner>
                <div class="text-grey-6 q-mt-sm">Invitation links expire after 24 hours and can only be used once.</div>
              </div>
            </q-tab-panel>
          </q-tab-panels>
          </template>
        </div>
      </div>
    </div>

    <CatalogFormDialog v-model:open="catalogFormOpen" v-model:catalog="editingCatalog" />
    <CatalogDeleteDialog v-model:open="deleteCatalogOpen" :catalog="deleteCatalogTarget" />

    <q-dialog :model-value="!!settingsDialogPlugin" @update:model-value="settingsDialogPlugin = null">
      <q-card dark class="plugin-settings-card">
        <q-card-section class="row items-center">
          <div class="text-h6">{{ settingsDialogPlugin?.name }} settings</div>
          <q-space />
          <q-btn flat round dense icon="close" aria-label="Close" v-close-popup />
        </q-card-section>
        <q-card-section>
          <PluginSettingsPanel
            v-if="settingsDialogPlugin"
            :key="settingsDialogPlugin.id"
            :plugin="settingsDialogPlugin"
            @saved="fetchSetupChecklist"
          />
        </q-card-section>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<style scoped>
.plugin-settings-frame {
  position: relative;
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
  overflow: auto;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: #0e1525;
}

.settings-panels :deep(.q-tab-panel.users-tab-panel) {
  width: 100%;
  max-width: none;
}

.storage-settings-intro {
  max-width: 850px;
}

.storage-card {
  overflow: hidden;
  border-color: rgba(150, 174, 211, 0.14);
  border-radius: 15px;
  background: linear-gradient(145deg, rgba(20, 30, 49, 0.96), rgba(13, 21, 36, 0.96));
}

.storage-card__header {
  min-height: 82px;
  padding: 17px 20px;
}

.storage-card__icon {
  width: 42px;
  height: 42px;
  font-size: 21px;
}

.storage-card__icon--blue {
  color: #91bdff;
  background: rgba(75, 139, 229, 0.15);
}

.storage-card__icon--green {
  color: #78d6b0;
  background: rgba(62, 190, 139, 0.13);
}

.storage-path-group__title {
  margin: 0 0 13px;
  color: #aab8ce;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.storage-path-field :deep(.q-field__control) {
  border-radius: 10px;
  background: rgba(6, 12, 22, 0.28);
}

.storage-media-note {
  max-width: 980px;
  border: 1px solid rgba(115, 161, 224, 0.12);
  border-radius: 12px;
}

.settings-panel--plugin-ui {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.settings-panel--plugin-ui .settings-panels {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}

.settings-panel--plugin-ui .settings-panels :deep(.q-panel-parent),
.settings-panel--plugin-ui .settings-panels :deep(.q-panel),
.settings-panel--plugin-ui .settings-panels :deep(.q-tab-panel.plugin-ui-tab-panel) {
  flex: 1 1 auto;
  width: 100%;
  max-width: none;
  height: 100%;
  min-height: 0;
}

.settings-panel--plugin-ui .settings-panels :deep(.q-tab-panel.plugin-ui-tab-panel) {
  display: flex;
  flex-direction: column;
}

.plugin-settings-card {
  min-width: 420px;
  width: 480px;
  max-width: 92vw;
}
</style>
