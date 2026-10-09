<script setup>
import { ref } from 'vue'
import { api } from '../composables/useApi'

// Two-way bound dialog visibility, driven by the avatar menu in AppHeader.
const open = defineModel('open', { type: Boolean, required: true })

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const message = ref('')
const error = ref('')
const loading = ref(false)

function reset() {
  currentPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
  message.value = ''
  error.value = ''
}

async function submit() {
  error.value = ''
  message.value = ''
  if (newPassword.value !== confirmPassword.value) {
    error.value = 'New passwords do not match.'
    return
  }
  loading.value = true
  try {
    const { data } = await api.post('/auth/change-password', {
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
    })
    message.value = data.message ?? 'Password changed.'
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  } catch (requestError) {
    const details = requestError.response?.data?.errors
    error.value = Array.isArray(details)
      ? details.join(' ')
      : requestError.response?.data?.error ?? requestError.response?.data?.detail ?? 'Could not change password. Check your current password and try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <q-dialog v-model="open" @hide="reset">
    <q-card dark class="auth-card change-password-card">
      <div class="auth-title">Change password</div>
      <q-banner v-if="message" dense class="auth-message q-mb-md">{{ message }}</q-banner>
      <q-banner v-if="error" dense class="error-banner q-mb-md">{{ error }}</q-banner>
      <q-form class="column q-gutter-sm" @submit.prevent="submit">
        <q-input
          v-model="currentPassword"
          dark
          outlined
          dense
          type="password"
          autocomplete="current-password"
          label="Current password"
          required
        />
        <q-input
          v-model="newPassword"
          dark
          outlined
          dense
          type="password"
          autocomplete="new-password"
          label="New password (6 characters minimum)"
          required
          minlength="6"
        />
        <q-input
          v-model="confirmPassword"
          dark
          outlined
          dense
          type="password"
          autocomplete="new-password"
          label="Confirm new password"
          required
          minlength="6"
        />
        <div class="row q-gutter-sm justify-end q-mt-sm">
          <q-btn flat dense color="grey-5" label="cancel" @click="open = false" />
          <q-btn
            type="submit"
            unelevated
            color="primary"
            text-color="dark"
            :loading="loading"
            label="change password"
          />
        </div>
      </q-form>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.change-password-card {
  padding: 1.25rem;
  min-width: 320px;
}
</style>
