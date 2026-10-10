<script setup>
import { computed, ref } from 'vue'
import { Notify } from 'quasar'
import { usePlayback } from '../composables/usePlayback'
import { usePlaylist } from '../composables/usePlaylist'
import AddToPlaylistDialog from './AddToPlaylistDialog.vue'
import PluginActionButtons from './PluginActionButtons.vue'

const props = defineProps({
  kind: { type: String, required: true },
  item: { type: Object, required: true },
  sourceKey: { type: String, default: null },
  playHandler: { type: Function, default: null },
  queueHandler: { type: Function, default: null },
  playlistItemHandler: { type: Function, default: null },
  queueItem: { type: Object, default: null },
  actionContext: { type: Object, default: null },
  compact: { type: Boolean, default: false },
})

const { onPlay, onPlaySourceItem } = usePlayback()
const { addToQueue } = usePlaylist()
const addPlaylistOpen = ref(false)
const playlistItem = ref(null)
const playableItem = computed(() => props.queueItem ?? {
  ...props.item,
  kind: props.kind,
  sourceKey: props.sourceKey,
})

function play() {
  if (props.playHandler) return props.playHandler()
  if (props.sourceKey) return onPlaySourceItem(playableItem.value, props.sourceKey)
  return onPlay(playableItem.value)
}

function queue() {
  if (props.queueHandler) return props.queueHandler()
  if (!addToQueue(playableItem.value)) return
  Notify.create({ type: 'positive', message: 'Added to the queue.' })
}

async function openPlaylistPicker() {
  playlistItem.value = props.playlistItemHandler
    ? await props.playlistItemHandler()
    : playableItem.value
  addPlaylistOpen.value = Boolean(playlistItem.value)
}
</script>

<template>
  <div class="media-details-actions row items-center q-gutter-sm" :class="{ 'media-details-actions-compact': compact }">
    <q-btn unelevated color="primary" text-color="dark" icon="play_arrow" :label="compact ? undefined : 'Play'" :aria-label="compact ? 'Play now' : undefined" @click="play" />
    <q-btn outline color="primary" icon="playlist_add" :label="compact ? undefined : 'Add to queue'" :aria-label="compact ? 'Add to queue' : undefined" @click="queue" />
    <q-btn outline color="grey-5" icon="queue_music" :label="compact ? undefined : 'Add to playlist'" :aria-label="compact ? 'Add to playlist' : undefined" @click="openPlaylistPicker" />
    <PluginActionButtons
      v-if="actionContext"
      surface="DetailScreen"
      :kind="kind"
      :context="actionContext"
    />
    <AddToPlaylistDialog v-model="addPlaylistOpen" :item="playlistItem" />
  </div>
</template>

<style scoped>
.media-details-actions-compact {
  justify-content: flex-end;
}
</style>
