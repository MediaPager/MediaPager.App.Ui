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

const { canInvite, canEditSettings, canEditCatalogs, isSuperAdmin } = useAuth()
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

// Email providers are plugins: the provider dropdown lists every loaded plugin with the
// "email" capability, the active one's settings render through its own schema panel, and
// the official-provider note offers the ones that aren't installed yet (links from
// GET /plugins/official, the appsettings catalog).
const emailPlugins = computed(() =>
  sourcePlugins.value.filter((plugin) => (plugin.capabilities ?? []).includes('email')))
const emailProviderOptions = computed(() =>
  emailPlugins.value.map((plugin) => ({ label: plugin.name, value: plugin.id })))
const activeEmailPlugin = computed(() =>
  emailPlugins.value.find((plugin) => plugin.id === settingsValues.value['Email:Provider']) ??
  emailPlugins.value[0] ?? null)
const officialEmailProviders = computed(() =>
  officialPlugins.value.filter((entry) => entry.category === 'email'))

async function pickEmailProvider(pluginId) {
  settingsValues.value['Email:Provider'] = pluginId
  settingsError.value = ''
  try {
    // Persisted immediately: the settings panel below swaps to the picked provider.
    const { data } = await api.put('/settings', { 'Email:Provider': pluginId })
    settingsMessage.value = data?.message ?? 'Settings saved.'
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
  const wanted = settingsValues.value['Subtitles:Provider'] ?? ''
  // Full plugin id, or a legacy short value ("subdl") matched by last id segment.
  return subtitlePlugins.value.find((plugin) => plugin.id === wanted) ??
    (wanted ? subtitlePlugins.value.find((plugin) => plugin.id.endsWith(`.${wanted}`)) : null) ??
    subtitlePlugins.value[0] ?? null
})

async function pickSubtitleProvider(pluginId) {
  settingsValues.value['Subtitles:Provider'] = pluginId
  settingsError.value = ''
  try {
    // Persisted immediately: the settings panel below swaps to the picked provider.
    const { data } = await api.put('/settings', { 'Subtitles:Provider': pluginId })
    settingsMessage.value = data?.message ?? 'Settings saved.'
    fetchSetupChecklist()
  } catch (requestError) {
    settingsError.value = requestError.response?.data?.detail ?? 'Could not save the subtitle provider.'
  }
}

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
      : group.name === 'setup'
        ? canEditSettings.value && !setupReady.value
        : canInvite.value || canEditSettings.value),
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
      <div class="settings-topbar">
        <div class="settings-title">Settings</div>
        <q-btn
          v-if="canEditSettings && settingsTab !== 'catalogs' && settingsTab !== 'setup' && settingsTab !== 'plugins' && !isPluginTab"
          unelevated
          color="primary"
          text-color="dark"
          icon="save"
          label="save"
          :loading="settingsLoading"
          @click="saveAndRefresh"
        />
        <q-btn
          v-else-if="settingsTab === 'catalogs' && canEditCatalogs"
          unelevated
          color="primary"
          text-color="dark"
          icon="add"
          label="new catalog"
          @click="openCreateCatalog"
        />
      </div>

      <div class="settings-body">
        <q-tabs
          v-model="settingsTab"
          vertical
          dark
          class="settings-nav"
          active-color="primary"
          indicator-color="primary"
        >
          <q-tab v-for="group in visibleGroups" :key="group.name" :name="group.name" :label="group.label" :icon="group.icon" />
        </q-tabs>

        <div class="settings-panel">
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
              :class="{ 'plugins-tab-panel': group.manage }"
            >
              <div class="panel-title q-mb-md">{{ group.label }}</div>

              <template v-if="group.manage">
                <PluginsPanel @open-settings="openPluginSettings" />
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

              <template v-else-if="group.name === 'general'">
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

                <q-separator spaced class="q-mt-none" />
                <div class="panel-title q-mb-md">Providers</div>

                <q-select
                  :model-value="settingsValues['Email:Provider'] || activeEmailPlugin?.id || null"
                  :options="emailProviderOptions"
                  dark
                  dense
                  outlined
                  emit-value
                  map-options
                  label="Email provider"
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
                <q-banner v-if="officialEmailProviders.length" dense class="email-providers-note q-mb-md">
                  <div class="text-caption">
                    <template v-for="(provider, index) in officialEmailProviders" :key="provider.id">
                      <span v-if="index"> · </span>
                      <a v-if="!provider.installed" :href="provider.repo" target="_blank" rel="noopener noreferrer">{{ provider.name }}</a>
                      <span v-else>{{ provider.name }} <q-icon name="check_circle" color="positive" size="14px" /></span>
                    </template>
                  </div>
                  <div class="text-caption text-grey-6">
                    SMTP is the default and ships ready. Mailgun, Gmail and Office 365 are
                    optional — open a link for install instructions; a loaded provider's
                    settings open from the gear next to the dropdown.
                  </div>
                </q-banner>

                <q-select
                  :model-value="activeSubtitlePlugin?.id || settingsValues['Subtitles:Provider'] || null"
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
          />
        </q-card-section>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<style scoped>
.plugin-settings-card {
  min-width: 420px;
  width: 480px;
  max-width: 92vw;
}
</style>
