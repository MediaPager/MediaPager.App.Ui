<script setup>
import { ref } from 'vue'
import { usePlayback } from '../composables/usePlayback'
import { usePlaylist } from '../composables/usePlaylist'

const {
  playerPaused,
  currentIndex,
  playQueueItem,
  playNextInQueue,
  playPreviousInQueue,
  togglePlayback,
} = usePlayback()
const {
  playlistDrawerOpen,
  queue,
  savedPlaylists,
  activePlaylistId,
  currentPlaylistName,
  loadSavedPlaylist,
  removeQueueItem,
  clearQueue,
  saveCurrentQueue,
  createPlaylist,
  removeSavedPlaylist,
} = usePlaylist()

const queueName = ref('')
const newPlaylistName = ref('')

function metadataText(item) {
  return (item.metadata ?? []).slice(0, 3).map((field) => field.value).filter(Boolean).join(' · ')
}

function saveQueue() {
  if (!saveCurrentQueue(queueName.value)) return
  queueName.value = ''
}

function createEmptyPlaylist() {
  if (!createPlaylist(newPlaylistName.value)) return
  newPlaylistName.value = ''
}

function choosePlaylist(playlist) {
  loadSavedPlaylist(playlist.id)
}

function playPlaylist(playlist) {
  if (!loadSavedPlaylist(playlist.id) || playlist.items.length === 0) return
  void playQueueItem(0)
}
</script>

<template>
  <q-drawer
    v-model="playlistDrawerOpen"
    side="right"
    overlay
    bordered
    :width="380"
    class="playlist-drawer"
  >
    <div class="playlist-drawer-header row items-center q-pa-md">
      <div class="text-h6">Playlist</div>
      <q-space />
      <q-btn flat round dense icon="close" aria-label="Close playlist" @click="playlistDrawerOpen = false" />
    </div>

    <q-scroll-area class="playlist-drawer-scroll">
      <section class="q-pa-md">
        <div class="row items-center q-mb-sm">
          <div class="text-subtitle1 text-weight-bold">{{ currentPlaylistName }}</div>
          <q-space />
          <q-btn v-if="queue.length" flat round dense icon="clear_all" aria-label="Clear queue" title="Clear queue" @click="clearQueue" />
        </div>

        <div v-if="queue.length === 0" class="text-grey-6 q-py-md">
          Your queue is empty. Play something or add an item to the queue.
        </div>
        <q-list v-else dark separator class="playlist-queue">
          <q-item
            v-for="(item, index) in queue"
            :key="item.queueEntryId"
            clickable
            :active="index === currentIndex"
            active-class="playlist-queue-active"
            @click="playQueueItem(index)"
          >
            <q-item-section avatar>
              <q-img :src="item.posterUrl ?? undefined" fit="cover" class="playlist-item-art">
                <template #error><div class="playlist-item-art-fallback flex flex-center"><q-icon name="music_note" /></div></template>
              </q-img>
            </q-item-section>
            <q-item-section>
              <q-item-label class="ellipsis">{{ item.title }}</q-item-label>
              <q-item-label v-if="metadataText(item)" caption class="ellipsis">{{ metadataText(item) }}</q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-btn
                flat
                round
                dense
                size="sm"
                icon="close"
                aria-label="Remove from queue"
                :disable="index === currentIndex"
                @click.stop="removeQueueItem(item.queueEntryId)"
              />
            </q-item-section>
          </q-item>
        </q-list>

        <div v-if="queue.length" class="row q-gutter-xs q-mt-sm">
          <q-input v-model="queueName" dark dense outlined class="col" label="Save queue as playlist" @keyup.enter="saveQueue" />
          <q-btn flat round dense icon="save" aria-label="Save queue as playlist" :disable="!queueName.trim()" @click="saveQueue" />
        </div>
      </section>

      <q-separator dark />

      <section class="q-pa-md">
        <div class="row items-center q-mb-sm">
          <div class="text-subtitle1 text-weight-bold">Saved playlists</div>
          <q-space />
          <q-badge color="grey-8">{{ savedPlaylists.length }}</q-badge>
        </div>

        <div v-if="savedPlaylists.length" class="column q-gutter-sm">
          <q-card v-for="playlist in savedPlaylists" :key="playlist.id" dark flat bordered class="saved-playlist-card">
            <q-card-section class="row items-center q-pa-sm">
              <div class="col cursor-pointer" @click="choosePlaylist(playlist)">
                <div class="text-weight-medium ellipsis">{{ playlist.name }}</div>
                <div class="text-caption text-grey-6">{{ playlist.items.length }} item{{ playlist.items.length === 1 ? '' : 's' }}</div>
              </div>
              <q-btn flat round dense icon="play_arrow" :aria-label="`Play ${playlist.name}`" :disable="playlist.items.length === 0" @click="playPlaylist(playlist)" />
              <q-btn flat round dense icon="delete_outline" :aria-label="`Delete ${playlist.name}`" @click="removeSavedPlaylist(playlist.id)" />
            </q-card-section>
          </q-card>
        </div>
        <div v-else class="text-grey-6 text-caption q-mb-sm">Saved playlists stay on this browser.</div>

        <div class="row q-gutter-xs q-mt-sm">
          <q-input v-model="newPlaylistName" dark dense outlined class="col" label="New playlist" @keyup.enter="createEmptyPlaylist" />
          <q-btn flat round dense icon="add" aria-label="Create playlist" :disable="!newPlaylistName.trim()" @click="createEmptyPlaylist" />
        </div>
      </section>

      <div class="playlist-drawer-controls row items-center justify-center q-gutter-sm q-pa-md">
        <q-btn flat round dense icon="skip_previous" aria-label="Previous item" :disable="!queue.length" @click="playPreviousInQueue" />
        <q-btn flat round dense :icon="playerPaused ? 'play_arrow' : 'pause'" :aria-label="playerPaused ? 'Resume playback' : 'Pause playback'" @click="togglePlayback" />
        <q-btn flat round dense icon="skip_next" aria-label="Next item" :disable="currentIndex < 0 || currentIndex >= queue.length - 1" @click="playNextInQueue" />
      </div>
    </q-scroll-area>
  </q-drawer>
</template>

<style scoped>
.playlist-drawer {
  background: #0b1120;
}

.playlist-drawer-header {
  border-bottom: 1px solid #1a2333;
}

.playlist-drawer-scroll {
  height: calc(100% - 4.25rem);
}

.playlist-item-art {
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 0.35rem;
}

.playlist-item-art-fallback {
  width: 100%;
  height: 100%;
  background: #121b2b;
  color: #64748b;
}

.playlist-queue-active,
.saved-playlist-card {
  border-color: rgba(134, 212, 17, 0.6);
}
</style>
