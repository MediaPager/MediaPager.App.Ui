<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Notify } from 'quasar'
import { api } from '../composables/useApi'
import { useSources } from '../composables/useSources'
import { usePluginActivity } from '../composables/usePluginActivity'
import { formatPluginError } from '../composables/pluginErrors'
import { useAuth } from '../composables/useAuth'
import { useCatalogItems } from '../composables/useCatalogItems'

const props = defineProps({
  surface: { type: String, required: true },
  kind: { type: String, default: null },
  context: { type: Object, required: true },
})

const router = useRouter()
const { plugins } = useSources()
const { activityDrawerOpen, refreshActivity } = usePluginActivity()
const { canEditCatalogs } = useAuth()
const { requestEditItem } = useCatalogItems()
const EDIT_CATALOG_ITEM = 'catalog-item.edit'

const kindAliases = {
  movie: 'movie', movies: 'movie',
  tv: 'tv', 'tv-show': 'tv', 'tv-shows': 'tv', tvshows: 'tv',
  music: 'music', podcast: 'podcast', podcasts: 'podcast',
  audiobook: 'audiobook', audiobooks: 'audiobook', book: 'book', books: 'book',
}

function normalizeKind(kind) {
  const value = String(kind ?? '').trim().toLowerCase()
  return kindAliases[value] ?? value
}

const actionContext = computed(() => ({
  ...props.context,
  kind: props.context.kind ? normalizeKind(props.context.kind) : null,
}))

const declaredActions = computed(() => plugins.value.flatMap((plugin) =>
  (plugin.actions ?? [])
    .filter((action) => action.surface?.toLowerCase() === props.surface.toLowerCase())
    .filter((action) => !action.kinds?.length || !props.kind ||
      action.kinds.some((kind) => kind.toLowerCase() === normalizeKind(props.kind)))
    .filter((action) => action.scope?.toLowerCase() !== 'streamitem' || props.context.catalogItemId == null)
    .filter((action) => action.scope?.toLowerCase() !== 'libraryitem' || props.context.catalogItemId != null)
    .filter((action) => action.hostActionId !== EDIT_CATALOG_ITEM || canEditCatalogs.value)
    .map((action) => ({ plugin, action }))))

const actions = computed(() => {
  const entries = declaredActions.value.filter(({ plugin, action }) =>
    !declaredActions.value.some((candidate) =>
      candidate.plugin.id !== plugin.id &&
      candidate.action.actionId === action.actionId &&
      (candidate.action.label?.length ?? 0) > (action.label?.length ?? 0)))
  const canEditThisItem = props.context.catalogItemId != null && canEditCatalogs.value
  const hasDeclaredEdit = entries.some((entry) => entry.action.hostActionId === EDIT_CATALOG_ITEM)
  if (canEditThisItem && !hasDeclaredEdit) {
    entries.push({
      plugin: { id: 'mediapager.host', name: 'MediaPager' },
      action: {
        actionId: EDIT_CATALOG_ITEM,
        hostActionId: EDIT_CATALOG_ITEM,
        label: 'Edit metadata',
        icon: 'edit',
        surface: props.surface,
        position: 'TopRight',
        order: 100,
        click: 'HostAction',
      },
    })
  }
  return entries.sort((left, right) =>
    (left.action.position ?? '').localeCompare(right.action.position ?? '') ||
    (left.action.order ?? 0) - (right.action.order ?? 0) ||
    left.plugin.name.localeCompare(right.plugin.name))
})

function cssPosition(position) {
  return (position ?? 'TopRight').replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).replace(/^-/, '')
}

function positionStyle(entry) {
  const position = entry.action.position ?? 'TopRight'
  const stackIndex = actions.value
    .filter((candidate) => candidate.action.position === position)
    .findIndex((candidate) => candidate.plugin.id === entry.plugin.id && candidate.action.actionId === entry.action.actionId)
  const offset = `calc(0.5rem + ${Math.max(stackIndex, 0)} * 2.75rem)`
  return {
    top: position.startsWith('Top') ? offset : 'auto',
    right: position.endsWith('Right') ? offset : 'auto',
    bottom: position.startsWith('Bottom') ? offset : 'auto',
    left: position.endsWith('Left') ? offset : 'auto',
  }
}

function settingsRoute(entry) {
  return {
    name: 'settings',
    params: { tab: `plugin-nav:${entry.action.availabilityPluginId}` },
  }
}

async function activate(entry) {
  const { plugin, action } = entry
  if (action.enabled === false) {
    if (action.availabilityPluginId) router.push(settingsRoute(entry))
    return
  }

  if (action.click?.toLowerCase() === 'openui') {
    const pathMatch = (action.uiPath ?? '').split('/').filter(Boolean)
    router.push({ name: 'plugin', params: { pluginId: plugin.id, pathMatch } })
    return
  }

  if (action.click?.toLowerCase() === 'hostaction') {
    if (action.hostActionId === EDIT_CATALOG_ITEM && props.context.catalogItemId != null) {
      try {
        await requestEditItem(props.context.catalogItemId)
      } catch (error) {
        Notify.create({
          type: 'negative',
          icon: 'error',
          message: formatPluginError(error, 'Could not open catalog item metadata.'),
        })
      }
    }
    return
  }

  try {
    await api.post(
      `/plugins/${encodeURIComponent(plugin.id)}/actions/${encodeURIComponent(action.actionId)}`,
      actionContext.value,
    )
    await refreshActivity()
    activityDrawerOpen.value = true
  } catch (error) {
    Notify.create({
      type: 'negative',
      icon: 'error',
      message: formatPluginError(error, `Could not run ${action.label}.`),
    })
  }
}
</script>

<template>
  <div v-if="actions.length" class="plugin-action-buttons" :class="`plugin-actions-${surface.toLowerCase()}`">
    <q-btn
      v-for="entry in actions"
      :key="`${entry.plugin.id}:${entry.action.actionId}`"
      round
      unelevated
      :color="entry.action.enabled === false ? 'orange' : 'dark'"
      :text-color="entry.action.enabled === false ? 'dark' : 'primary'"
      size="sm"
      :icon="entry.action.icon || 'extension'"
      :class="`plugin-action-${cssPosition(entry.action.position)}`"
      :aria-label="entry.action.availabilityMessage || entry.action.label"
      :title="entry.action.availabilityMessage || entry.action.label"
      :style="positionStyle(entry)"
      @click.stop="activate(entry)"
    >
      <q-tooltip v-if="entry.action.enabled === false" class="action-availability-tooltip">
        <div>{{ entry.action.availabilityMessage || 'Set a destination catalog to enable this action.' }}</div>
        <router-link
          v-if="entry.action.availabilityPluginId"
          :to="settingsRoute(entry)"
          class="text-primary text-weight-bold"
          @click.stop
        >
          Plugin settings
        </router-link>
      </q-tooltip>
      <q-tooltip v-else>{{ entry.action.label }}</q-tooltip>
    </q-btn>
  </div>
</template>

<style scoped>
.plugin-action-buttons {
  position: absolute;
  inset: 0;
  z-index: 4;
  pointer-events: none;
}

.plugin-action-buttons :deep(.q-btn) {
  position: absolute;
  margin: 0;
  pointer-events: auto;
}

.plugin-action-top-left { top: 0; left: 0; }
.plugin-action-top-right { top: 0; right: 0; }
.plugin-action-bottom-left { bottom: 0; left: 0; }
.plugin-action-bottom-right { bottom: 0; right: 0; }

.plugin-actions-detailscreen {
  position: absolute;
  inset: 0;
  z-index: 4;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
