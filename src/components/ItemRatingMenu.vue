<script setup>
import { ref } from 'vue'
import { useCatalogItems } from '../composables/useCatalogItems'

// Star button + menu for a user's personal rating of a catalog item (0–10). The shared
// "official" rating is separate — that lives on the item and is edited via the edit dialog.
const props = defineProps({
  item: { type: Object, required: true },
  size: { type: String, default: 'sm' },
})

const { setRating, clearRating } = useCatalogItems()
const menuOpen = ref(false)
const saving = ref(false)

async function pick(value) {
  saving.value = true
  try {
    await setRating(props.item.id, value)
    menuOpen.value = false
  } catch { /* keep the menu open so the user can retry */ } finally {
    saving.value = false
  }
}

async function remove() {
  saving.value = true
  try {
    await clearRating(props.item.id)
    menuOpen.value = false
  } catch { } finally {
    saving.value = false
  }
}

const RATING_OPTIONS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
</script>

<template>
  <div class="item-rating-wrap">
    <q-btn
      round
      unelevated
      :color="item.userRating ? 'secondary' : 'dark'"
      :text-color="item.userRating ? 'dark' : 'grey-5'"
      icon="star"
      :size="size"
      :label="item.userRating != null ? item.userRating.toFixed(1) : ''"
      :aria-label="`Rate ${item.title || item.id}`"
      :title="item.userRating != null ? `Your rating: ${item.userRating.toFixed(1)}` : 'Rate this'"
      :loading="saving"
      @click.stop="menuOpen = !menuOpen"
    />
    <q-menu
      v-model="menuOpen"
      dark
      fit
      :offset="[4, 4]"
      @click.stop
    >
      <q-list dense class="item-rating-list">
        <q-item v-for="value in RATING_OPTIONS" :key="value" clickable v-close-popup @click="pick(value)">
          <q-item-section side>
            <q-icon name="star" :color="value <= (item.userRating ?? 0) ? 'secondary' : 'grey-6'" size="14px" />
          </q-item-section>
          <q-item-section>{{ value.toFixed(1) }}</q-item-section>
        </q-item>
        <q-item v-if="item.userRating != null" clickable v-close-popup @click="remove">
          <q-item-section side>
            <q-icon name="delete_outline" color="negative" size="16px" />
          </q-item-section>
          <q-item-section class="text-negative">Remove my rating</q-item-section>
        </q-item>
      </q-list>
    </q-menu>
  </div>
</template>