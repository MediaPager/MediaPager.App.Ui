<script setup>
import { ref, computed, watch } from 'vue'
import { api } from '../composables/useApi'
import { useCatalogs } from '../composables/useCatalogs'

// Two-way bound dialog visibility, driven from the settings Catalogs tab.
const open = defineModel('open', { type: Boolean, required: true })
const props = defineProps({ catalog: { type: Object, default: null } })

const { fetchCatalogs } = useCatalogs()

// Stage 1: "Are you sure?" with an optional delete-all-data checkbox.
// Stage 2: checking the box pops the irreversible-data-loss warning.
const purgeChecked = ref(false)
const dangerOpen = ref(false)
const error = ref('')
const loading = ref(false)

const hasPath = computed(() => Boolean(props.catalog?.path))

watch(open, (isOpen) => {
  if (!isOpen) {
    purgeChecked.value = false
    dangerOpen.value = false
    error.value = ''
  }
})

// Checking the box immediately demands the second, harsher confirmation.
// Unchecking (or cancelling the warning) returns to the plain delete flow.
function onPurgeToggle(checked) {
  if (checked) dangerOpen.value = true
  else dangerOpen.value = false
}

function cancelDanger() {
  purgeChecked.value = false
  dangerOpen.value = false
}

async function confirmDelete() {
  if (!props.catalog) return
  // A checked box must have survived the danger dialog, or the flow restarts there.
  if (purgeChecked.value && !dangerOpen.value && !purgeConfirmed.value) {
    dangerOpen.value = true
    return
  }
  error.value = ''
  loading.value = true
  try {
    await api.delete(`/catalogs/${props.catalog.id}`, {
      params: purgeChecked.value ? { purge: true } : {},
    })
    await fetchCatalogs()
    open.value = false
  } catch (requestError) {
    error.value = requestError.response?.data?.detail ?? requestError.response?.data?.error ?? 'Could not delete catalog.'
  } finally {
    loading.value = false
  }
}

// True once the user explicitly accepted the data-loss warning while the box is checked.
const purgeConfirmed = ref(false)
watch(dangerOpen, (isOpen) => {
  if (!isOpen && purgeChecked.value) purgeConfirmed.value = true
})
watch(purgeChecked, (checked) => {
  if (!checked) purgeConfirmed.value = false
})
</script>

<template>
  <q-dialog v-model="open" @hide="purgeConfirmed = false">
    <q-card dark class="auth-card catalog-delete-card">
      <div class="auth-title">Delete catalog</div>
      <q-banner v-if="error" dense class="error-banner q-mb-md">{{ error }}</q-banner>

      <div class="delete-confirm-text">
        Are you sure you want to delete
        <strong>“{{ catalog?.name }}”</strong>?
      </div>
      <div class="text-grey-6 text-caption q-mt-sm">
        The catalog will be removed from MediaPager. Files on disk are kept unless you ask
        otherwise.
      </div>

      <q-checkbox
        v-if="hasPath"
        v-model="purgeChecked"
        dense
        class="q-mt-md"
        color="negative"
        label="Delete all data in this folder too"
        @update:model-value="onPurgeToggle"
      />
      <div v-if="hasPath" class="text-grey-7 text-caption q-mb-xs" style="word-break: break-all">
        {{ catalog?.path }}
      </div>

      <div class="row q-gutter-sm justify-end q-mt-md">
        <q-btn flat dense color="grey-5" label="cancel" @click="open = false" />
        <q-btn
          unelevated
          color="negative"
          text-color="white"
          icon="delete"
          label="delete"
          :loading="loading"
          @click="confirmDelete"
        />
      </div>
    </q-card>
  </q-dialog>

  <!-- Stage 2: pops when "delete all data" is checked. Persistent until decided. -->
  <q-dialog v-model="dangerOpen" persistent>
    <q-card dark class="auth-card catalog-danger-card">
      <div class="auth-title text-negative">Are you sure?</div>
      <div class="delete-confirm-text">
        This can't be undone and could potentially be <strong>massive data loss</strong>.
      </div>
      <div class="text-grey-6 text-caption q-mt-sm" style="word-break: break-all">
        Deleting “{{ catalog?.name }}” will permanently erase everything in
        {{ catalog?.path }}.
      </div>
      <div class="row q-gutter-sm justify-end q-mt-md">
        <q-btn flat dense color="grey-5" label="go back" @click="cancelDanger" />
        <q-btn
          unelevated
          color="negative"
          text-color="white"
          label="yes, delete everything"
          @click="dangerOpen = false"
        />
      </div>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.catalog-delete-card,
.catalog-danger-card {
  padding: 1.25rem;
  min-width: 360px;
  max-width: 440px;
}

.delete-confirm-text {
  font-size: 1rem;
  line-height: 1.45;
  color: #e2e8f0;
}
</style>
