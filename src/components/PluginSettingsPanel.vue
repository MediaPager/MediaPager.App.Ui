<script setup>
import { computed, ref, watch } from 'vue'
import { useSources } from '../composables/useSources'
import { useCatalogs } from '../composables/useCatalogs'

// Data-driven settings screen for one plugin: renders inputs from the plugin's declared
// settings schema (GET /sources → plugins[].settings) and reads/writes values through
// /plugins/{key}/settings. Secret fields never round-trip a value — the input stays
// blank with a "currently set" placeholder, and only a typed value is written.
const props = defineProps({
  plugin: { type: Object, required: true },
})

const { fetchPluginSettings, savePluginSettings, fetchSources } = useSources()
const { catalogs, fetchCatalogs } = useCatalogs()

const values = ref({})
const loading = ref(false)
const saving = ref(false)
const message = ref('')
const error = ref('')
const loaded = ref(false)

function catalogOptionsFor(field) {
  return catalogs.value
    .filter((catalog) => catalog.catalogType?.slug === field.catalogTypeSlug)
    .map((catalog) => ({
      label: catalog.name,
      value: catalog.id,
      path: catalog.path,
    }))
}

const visibleFields = computed(() => props.plugin.settings ?? [])

watch(() => props.plugin.id, load, { immediate: true })

async function load() {
  loading.value = true
  error.value = ''
  message.value = ''
  try {
    if (props.plugin.settings?.some((field) => field.type === 'catalog'))
      await fetchCatalogs()
    values.value = await fetchPluginSettings(props.plugin.id)
    loaded.value = true
  } catch (requestError) {
    error.value = requestError.response?.data?.detail ?? `Could not load ${props.plugin.name} settings.`
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  error.value = ''
  message.value = ''
  try {
    const payload = {}
    for (const field of props.plugin.settings) {
      const value = values.value[field.key]
      // Blank secret = keep the stored value (the server skips it); blank non-secret
      // = delete, which resets the field to its schema default.
      payload[field.key] = value === '' || value == null ? null : value
    }
    const data = await savePluginSettings(props.plugin.id, payload)
    // Reload so secret fields settle back to their blank placeholder state.
    await load()
    // Action visibility/availability can depend on these settings (e.g. a selected
    // destination catalog), so refresh the plugin action descriptors too.
    await fetchSources()
    message.value = data?.message ?? 'Saved.'
  } catch (requestError) {
    error.value = requestError.response?.data?.detail ?? `Could not save ${props.plugin.name} settings.`
  } finally {
    saving.value = false
  }
}

function placeholderFor(field) {
  if (field.secret) return '••••••••  (leave blank to keep the saved value)'
  return field.defaultValue ?? ''
}
</script>

<template>
  <div>
    <q-banner v-if="message" dense class="auth-message q-mb-md">{{ message }}</q-banner>
    <q-banner v-if="error" dense class="error-banner q-mb-md">{{ error }}</q-banner>

    <div v-if="loading && !loaded" class="flex flex-center q-pa-xl">
      <q-spinner-dots color="primary" size="2rem" />
    </div>

    <template v-else>
      <div v-if="!visibleFields.length" class="text-grey-6 q-mb-md">
        This plugin has no configurable settings.
      </div>
      <q-input
        v-for="field in visibleFields.filter((field) => field.type === 'string' || field.type === 'password')"
        :key="field.key"
        v-model="values[field.key]"
        :type="field.type === 'password' ? 'password' : 'text'"
        :label="field.label + (field.required ? ' *' : '')"
        :placeholder="placeholderFor(field)"
        dark
        dense
        outlined
        class="q-mb-md"
        autocomplete="off"
      />

      <q-select
        v-for="field in visibleFields.filter((field) => field.type === 'catalog')"
        :key="field.key"
        :model-value="values[field.key] ? Number(values[field.key]) : null"
         :options="catalogOptionsFor(field)"
        option-label="label"
        option-value="value"
        emit-value
        map-options
        :label="field.label"
        dark
        dense
        outlined
         clearable
         :disable="catalogOptionsFor(field).length === 0"
         class="q-mb-md"
        @update:model-value="(value) => { values[field.key] = value == null ? null : String(value) }"
      >
        <template #option="scope">
          <q-item v-bind="scope.itemProps">
            <q-item-section>
              <q-item-label>{{ scope.opt.label }}</q-item-label>
              <q-item-label v-if="scope.opt.path" caption>{{ scope.opt.path }}</q-item-label>
            </q-item-section>
          </q-item>
        </template>
      </q-select>

      <div
        v-if="visibleFields.some((field) => field.type === 'catalog' && catalogOptionsFor(field).length === 0)"
        class="text-caption text-grey-6 q-mb-md"
      >
        Create a matching catalog before choosing a storage destination.
        <router-link :to="{ name: 'settings', params: { tab: 'catalogs' } }" class="text-primary">
          Create catalog
        </router-link>
      </div>

      <q-toggle
        v-for="field in visibleFields.filter((field) => field.type === 'boolean')"
        :key="field.key"
        :model-value="String(values[field.key] ?? field.defaultValue ?? 'false').toLowerCase() === 'true'"
        :label="field.label"
        dark
        class="q-mb-md"
        @update:model-value="(value) => { values[field.key] = String(value) }"
      />

      <div v-if="visibleFields.length" class="q-mt-md">
        <q-btn
          unelevated
          color="primary"
          text-color="dark"
          icon="save"
          label="save"
          :loading="saving"
          @click="save"
        />
      </div>
    </template>
  </div>
</template>
