<script setup>
import { ref, watch } from 'vue'
import { Notify } from 'quasar'
import { usePlaylist } from '../composables/usePlaylist'

const open = defineModel({ type: Boolean, required: true })
const props = defineProps({ item: { type: Object, default: null } })
const { savedPlaylists, addToSavedPlaylist, createPlaylist } = usePlaylist()
const newPlaylistName = ref('')

watch(open, (isOpen) => {
  if (isOpen) newPlaylistName.value = ''
})

function addToPlaylist(playlist) {
  if (!props.item || !addToSavedPlaylist(playlist.id, props.item)) return
  Notify.create({ type: 'positive', message: `Added to ${playlist.name}.` })
  open.value = false
}

function createAndAdd() {
  const playlist = createPlaylist(newPlaylistName.value)
  if (!playlist) return
  if (props.item) addToSavedPlaylist(playlist.id, props.item)
  Notify.create({ type: 'positive', message: `Created ${playlist.name}.` })
  newPlaylistName.value = ''
  open.value = false
}
</script>

<template>
  <q-dialog v-model="open">
    <q-card dark class="add-playlist-dialog">
      <q-card-section class="row items-center">
        <div class="text-h6">Add to playlist</div>
        <q-space />
        <q-btn flat round dense icon="close" aria-label="Close" v-close-popup />
      </q-card-section>

      <q-card-section v-if="savedPlaylists.length" class="q-pt-none">
        <q-list dark bordered separator class="rounded-borders">
          <q-item v-for="playlist in savedPlaylists" :key="playlist.id">
            <q-item-section>
              <q-item-label>{{ playlist.name }}</q-item-label>
              <q-item-label caption>{{ playlist.items.length }} item{{ playlist.items.length === 1 ? '' : 's' }}</q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-btn flat round dense icon="playlist_add" aria-label="Add to playlist" @click="addToPlaylist(playlist)" />
            </q-item-section>
          </q-item>
        </q-list>
      </q-card-section>
      <q-card-section v-else class="text-grey-6 q-pt-none">
        No saved playlists yet. Create one below.
      </q-card-section>

      <q-card-section class="row items-center q-gutter-sm q-pt-none">
        <q-input
          v-model="newPlaylistName"
          dark
          dense
          outlined
          class="col"
          label="New playlist name"
          @keyup.enter="createAndAdd"
        />
        <q-btn unelevated color="primary" text-color="dark" icon="add" label="Create" :disable="!newPlaylistName.trim()" @click="createAndAdd" />
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.add-playlist-dialog {
  width: min(32rem, calc(100vw - 2rem));
  max-width: none;
  background: #0b1120;
  border: 1px solid #243149;
}
</style>
