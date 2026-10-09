<script setup>
import { ref, computed } from 'vue'
import { useCatalogs } from '../composables/useCatalogs'

// Two-way bound dialog visibility, driven by the "+" button in the home side nav
// and by the edit action in settings. Bind :catalog for edit mode (null = create).
const open = defineModel('open', { type: Boolean, required: true })
const catalog = defineModel('catalog', { type: Object, default: null })

const { catalogTypes, fetchCatalogTypes, createCatalog, updateCatalog } = useCatalogs()

const name = ref('')
const description = ref('')
const catalogTypeId = ref(null)
const path = ref('')
const error = ref('')
const loading = ref(false)

const isEdit = computed(() => Boolean(catalog.value))
const title = computed(() => (isEdit.value ? 'Edit catalog' : 'New catalog'))
const submitLabel = computed(() => (isEdit.value ? 'save changes' : 'create catalog'))

async function onShow() {
  error.value = ''
  await fetchCatalogTypes()
  if (catalog.value) {
    name.value = catalog.value.name ?? ''
    description.value = catalog.value.description ?? ''
    catalogTypeId.value = catalog.value.catalogType?.id ?? null
    path.value = catalog.value.path ?? ''
  }
}

function reset() {
  name.value = ''
  description.value = ''
  catalogTypeId.value = null
  path.value = ''
  error.value = ''
}

async function submit() {
  error.value = ''
  if (!name.value.trim()) {
    error.value = 'A name is required.'
    return
  }
  if (!catalogTypeId.value) {
    error.value = 'Choose a catalog type.'
    return
  }
  if (!path.value.trim()) {
    error.value = 'A folder path is required — every catalog points at a folder for its media.'
    return
  }
  loading.value = true
  try {
    const payload = {
      name: name.value.trim(),
      description: description.value.trim(),
      catalogTypeId: catalogTypeId.value,
      path: path.value.trim(),
    }
    if (isEdit.value) await updateCatalog(catalog.value.id, payload)
    else await createCatalog(payload)
    reset()
    open.value = false
  } catch (requestError) {
    error.value = requestError.response?.data?.detail ?? requestError.response?.data?.error ?? 'Could not save catalog.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <q-dialog v-model="open" @show="onShow" @hide="reset">
    <q-card dark class="auth-card catalog-dialog-card">
      <div class="auth-title">{{ title }}</div>
      <q-banner v-if="error" dense class="error-banner q-mb-md">{{ error }}</q-banner>
      <q-form class="column q-gutter-sm" @submit.prevent="submit">
        <q-input
          v-model="name"
          dark
          outlined
          dense
          label="Name (e.g. My Movies)"
          required
        />
        <q-select
          v-model="catalogTypeId"
          :options="catalogTypes.map((type) => ({
            label: `${type.name} · ${type.mediaType.name}`,
            value: type.id,
          }))"
          dark
          dense
          outlined
          emit-value
          map-options
          label="Catalog type"
          required
        >
          <template #option="scope">
            <q-item v-bind="scope.itemProps">
              <q-item-section>
                <q-item-label>{{ scope.opt.label }}</q-item-label>
              </q-item-section>
            </q-item>
          </template>
        </q-select>
        <q-input
          v-model="description"
          dark
          outlined
          dense
          label="Description (optional)"
        />
        <q-input
          v-model="path"
          dark
          outlined
          dense
          label="Folder path (required)"
          required
          placeholder="/mnt/media/my-movies or ~/Movies"
        >
          <template #append>
            <q-icon name="folder" color="primary" />
          </template>
        </q-input>
        <div class="row q-gutter-sm justify-end q-mt-sm">
          <q-btn flat dense color="grey-5" label="cancel" @click="open = false" />
          <q-btn
            type="submit"
            unelevated
            color="primary"
            text-color="dark"
            :loading="loading"
            :label="submitLabel"
          />
        </div>
      </q-form>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.catalog-dialog-card {
  padding: 1.25rem;
  min-width: 340px;
}
</style>
