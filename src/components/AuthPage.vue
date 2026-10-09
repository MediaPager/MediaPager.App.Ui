<script setup>
import { ref } from 'vue'
import { api } from '../composables/useApi'
import { useAuth } from '../composables/useAuth'
import appIcon from '../assets/images/icon.png'

const emit = defineEmits(['logged-in'])
const { setSession } = useAuth()

const authParams = new URLSearchParams(window.location.search)
const authMode = ref(['login', 'forgot', 'reset', 'register'].includes(authParams.get('mode'))
  ? authParams.get('mode')
  : 'login')
const authEmail = ref(authParams.get('email') ?? '')
const authPassword = ref('')
const authToken = authParams.get('token') ?? ''
const authMessage = ref('')
const authError = ref('')
const authLoading = ref(false)

async function submitAuth() {
  authLoading.value = true
  authError.value = ''
  authMessage.value = ''
  try {
    if (authMode.value === 'login') {
      const { data } = await api.post('/auth/login', { email: authEmail.value, password: authPassword.value })
      setSession(authEmail.value, data.accessToken, data.scopes)
      authPassword.value = ''
      emit('logged-in')
    } else if (authMode.value === 'forgot') {
      const { data } = await api.post('/auth/forgot-password', { email: authEmail.value })
      authMessage.value = data.message
    } else if (authMode.value === 'register') {
      const { data } = await api.post('/auth/register', {
        email: authEmail.value,
        token: authToken,
        password: authPassword.value,
      })
      authMode.value = 'login'
      authPassword.value = ''
      authMessage.value = data.message
      window.history.replaceState({}, '', window.location.pathname)
    } else {
      const { data } = await api.post('/auth/reset-password', {
        email: authEmail.value,
        token: authToken,
        password: authPassword.value,
      })
      authMode.value = 'login'
      authPassword.value = ''
      authMessage.value = data.message
      window.history.replaceState({}, '', window.location.pathname)
    }
  } catch (requestError) {
    const details = requestError.response?.data?.errors
    authError.value = Array.isArray(details)
      ? details.join(' ')
      : requestError.response?.data?.error ?? requestError.response?.data?.detail ?? 'Request failed. Check your details and try again.'
  } finally {
    authLoading.value = false
  }
}

function changeAuthMode(mode) {
  authMode.value = mode
  authMessage.value = ''
  authError.value = ''
}
</script>

<template>
  <q-page class="auth-page flex flex-center q-pa-md">
    <q-card dark class="auth-card">
      <div class="brand auth-brand">
        <img :src="appIcon" alt="" class="auth-brand-icon" />
        <span>mediapager<span class="text-primary">_</span></span>
      </div>
      <div class="auth-title">
        {{ authMode === 'login' ? 'Sign in' : authMode === 'forgot' ? 'Reset password' : authMode === 'register' ? 'Accept invitation' : 'Choose a new password' }}
      </div>
      <q-banner v-if="authMessage" dense class="auth-message q-mb-md">
        {{ authMessage }}
      </q-banner>
      <q-banner v-if="authError" dense class="error-banner q-mb-md">
        {{ authError }}
      </q-banner>
      <q-form class="column q-gutter-sm" @submit.prevent="submitAuth">
        <q-input
          v-model="authEmail"
          dark
          outlined
          dense
          type="email"
          autocomplete="email"
          label="Email"
          :readonly="authMode === 'register' || authMode === 'reset'"
          required
        />
        <q-input
          v-if="authMode !== 'forgot'"
          v-model="authPassword"
          dark
          outlined
          dense
          type="password"
          :autocomplete="authMode === 'login' ? 'current-password' : 'new-password'"
          :label="authMode === 'login' ? 'Password' : 'New password (6 characters minimum)'"
          :required="authMode !== 'forgot'"
          minlength="6"
        />
        <q-btn
          type="submit"
          unelevated
          color="primary"
          text-color="dark"
          :loading="authLoading"
          :label="authMode === 'login' ? 'sign in' : authMode === 'forgot' ? 'send reset link' : authMode === 'register' ? 'create account' : 'reset password'"
        />
      </q-form>
      <div class="auth-actions">
        <q-btn
          v-if="authMode === 'login'"
          flat
          dense
          color="grey-5"
          label="forgot password?"
          @click="changeAuthMode('forgot')"
        />
        <q-btn
          v-else-if="authMode === 'forgot'"
          flat
          dense
          color="grey-5"
          label="back to sign in"
          @click="changeAuthMode('login')"
        />
      </div>
    </q-card>
  </q-page>
</template>
