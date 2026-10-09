<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../composables/useApi'
import { useAuth } from '../composables/useAuth'
import { useUserSettings } from '../composables/useUserSettings'
import { usePlayback, languages } from '../composables/usePlayback'
import SubtitleStyleControls from './SubtitleStyleControls.vue'
import ChangePasswordDialog from './ChangePasswordDialog.vue'

const router = useRouter()

const { accessToken, userScopes, currentUserEmail, setSession } = useAuth()
const { autoplay, setAutoplay } = useUserSettings()
const { subLang } = usePlayback()

const profileTab = ref('player')
const changePasswordOpen = ref(false)

// ── Profile (GET /me) ──
const profile = ref(null)
const profileLoading = ref(false)
const profileError = ref('')

// ── Account: name + email change ──
const firstName = ref('')
const lastName = ref('')
const accountSaving = ref(false)
const accountMessage = ref('')
const accountError = ref('')

const emailFormOpen = ref(false)
const newEmail = ref('')
const emailPassword = ref('')
const emailLoading = ref(false)
const emailMessage = ref('')
const emailError = ref('')
const codePending = ref(false)
const verificationCode = ref('')
const confirming = ref(false)
const emailSuccess = ref('')

async function fetchProfile() {
  profileLoading.value = true
  profileError.value = ''
  try {
    const { data } = await api.get('/me')
    profile.value = data
    firstName.value = data.firstName ?? ''
    lastName.value = data.lastName ?? ''
  } catch (requestError) {
    profileError.value = requestError.response?.data?.detail ?? requestError.response?.data?.error ?? 'Could not load your profile.'
  } finally {
    profileLoading.value = false
  }
}

async function saveAccount() {
  accountSaving.value = true
  accountMessage.value = ''
  accountError.value = ''
  try {
    const { data } = await api.put('/me/profile', {
      firstName: firstName.value.trim() || null,
      lastName: lastName.value.trim() || null,
    })
    profile.value = data
    firstName.value = data.firstName ?? ''
    lastName.value = data.lastName ?? ''
    accountMessage.value = 'Profile saved.'
  } catch (requestError) {
    accountError.value = requestError.response?.data?.error ?? 'Could not save your profile.'
  } finally {
    accountSaving.value = false
  }
}

async function requestEmailChange() {
  emailLoading.value = true
  emailMessage.value = ''
  emailError.value = ''
  try {
    const { data } = await api.post('/me/email', { newEmail: newEmail.value, currentPassword: emailPassword.value })
    emailMessage.value = data.message
    codePending.value = true
    emailPassword.value = ''
  } catch (requestError) {
    emailError.value = requestError.response?.data?.error ?? requestError.response?.data?.detail ?? 'Could not start the email change.'
  } finally {
    emailLoading.value = false
  }
}

async function confirmEmailChange() {
  confirming.value = true
  emailMessage.value = ''
  emailError.value = ''
  try {
    const { data } = await api.post('/me/email/confirm', { code: verificationCode.value })
    profile.value = data.profile
    emailSuccess.value = data.message
    setSession(data.profile.email, accessToken.value, userScopes.value)
    newEmail.value = ''
    verificationCode.value = ''
    codePending.value = false
    emailFormOpen.value = false
  } catch (requestError) {
    emailError.value = requestError.response?.data?.error ?? 'That code did not verify.'
  } finally {
    confirming.value = false
  }
}

function cancelEmailChange() {
  emailFormOpen.value = false
  codePending.value = false
  newEmail.value = ''
  emailPassword.value = ''
  verificationCode.value = ''
  emailMessage.value = ''
  emailError.value = ''
}

function openEmailForm() {
  emailSuccess.value = ''
  emailFormOpen.value = true
}

onMounted(fetchProfile)
</script>

<template>
  <q-page class="settings-page">
    <div class="settings-layout">
      <div class="settings-topbar">
        <div class="settings-title">Profile</div>
        <q-btn flat dense color="grey-5" label="back" icon="arrow_back" @click="router.push('/')" />
      </div>

      <div class="settings-body">
        <q-tabs
          v-model="profileTab"
          vertical
          dark
          class="settings-nav"
          active-color="primary"
          indicator-color="primary"
        >
          <q-tab name="player" label="Player" />
          <q-tab name="account" label="Account" />
          <q-tab name="security" label="Security" />
        </q-tabs>

        <div class="settings-panel">
          <div v-if="profileLoading" class="flex flex-center q-pa-xl">
            <q-spinner-dots color="primary" size="2rem" />
          </div>
          <q-banner v-else-if="profileError" dense class="error-banner q-mb-md">{{ profileError }}</q-banner>

          <q-tab-panels v-else v-model="profileTab" animated class="settings-panels">
            <q-tab-panel name="player">
              <div class="panel-title q-mb-md">Player</div>

              <div class="profile-section">
                <div class="profile-section-title">Autoplay</div>
                <q-toggle
                  :model-value="autoplay"
                  @update:model-value="(value) => setAutoplay(value)"
                  dark
                  label="Autoplay next episode (TV shows)"
                />
              </div>

              <div class="profile-section">
                <div class="profile-section-title">Subtitle options</div>
                <q-select
                  v-model="subLang"
                  :options="languages"
                  dark
                  dense
                  outlined
                  emit-value
                  map-options
                  label="Default subtitle language"
                  class="q-mb-md"
                />
                <div class="text-caption text-grey-6 q-mb-sm">Appearance</div>
                <SubtitleStyleControls />
              </div>
            </q-tab-panel>

            <q-tab-panel name="account">
              <div class="panel-title q-mb-md">Account</div>

              <div class="profile-section">
                <div class="profile-section-title">Name</div>
                <div class="profile-form-grid">
                  <q-input v-model="firstName" dark dense outlined label="First name" />
                  <q-input v-model="lastName" dark dense outlined label="Last name" />
                </div>
                <q-btn
                  unelevated
                  color="primary"
                  text-color="dark"
                  icon="save"
                  label="save profile"
                  :loading="accountSaving"
                  class="q-mt-sm"
                  @click="saveAccount"
                />
                <q-banner v-if="accountMessage" dense class="auth-message q-mt-sm">{{ accountMessage }}</q-banner>
                <q-banner v-if="accountError" dense class="error-banner q-mt-sm">{{ accountError }}</q-banner>
              </div>

              <div class="profile-section">
                <div class="profile-section-title">Email</div>
                <div class="row items-center q-gutter-sm">
                  <span class="text-body1">{{ profile?.email ?? currentUserEmail }}</span>
                  <q-badge
                    v-if="profile?.emailConfirmed"
                    color="positive"
                    text-color="dark"
                    label="verified"
                  />
                  <q-badge v-else color="warning" text-color="dark" label="unverified" />
                </div>
                <div class="text-caption text-grey-6 q-mt-xs">
                  Changing the email requires a verification code sent to the new address.
                </div>
                <q-banner v-if="emailSuccess" dense class="auth-message q-mt-sm">{{ emailSuccess }}</q-banner>
                <q-btn
                  v-if="!emailFormOpen"
                  flat
                  dense
                  color="primary"
                  icon="edit"
                  label="change email"
                  class="q-mt-xs"
                  @click="openEmailForm"
                />

                <div v-if="emailFormOpen" class="profile-email-form q-mt-sm">
                  <q-input v-model="newEmail" dark dense outlined type="email" label="New email" />
                  <q-input
                    v-model="emailPassword"
                    dark
                    dense
                    outlined
                    type="password"
                    label="Current password"
                    autocomplete="current-password"
                  />
                  <div class="row items-center q-gutter-sm">
                    <q-btn
                      v-if="!codePending"
                      unelevated
                      color="primary"
                      text-color="dark"
                      label="send verification code"
                      :loading="emailLoading"
                      @click="requestEmailChange"
                    />
                    <template v-else>
                      <q-input
                        v-model="verificationCode"
                        dark
                        dense
                        outlined
                        label="Verification code"
                        class="code-input"
                        autocomplete="one-time-code"
                      />
                      <q-btn
                        unelevated
                        color="primary"
                        text-color="dark"
                        label="confirm"
                        :loading="confirming"
                        @click="confirmEmailChange"
                      />
                    </template>
                    <q-btn flat dense color="grey-5" label="cancel" @click="cancelEmailChange" />
                  </div>
                  <q-banner v-if="emailMessage" dense class="auth-message q-mt-sm">{{ emailMessage }}</q-banner>
                  <q-banner v-if="emailError" dense class="error-banner q-mt-sm">{{ emailError }}</q-banner>
                </div>
              </div>

              <div class="profile-section">
                <div class="profile-section-title">Scopes</div>
                <div class="row q-col-gutter-sm">
                  <q-badge
                    v-for="scope in userScopes"
                    :key="scope"
                    outline
                    color="primary"
                    text-color="primary"
                    :label="scope"
                    class="q-mb-xs"
                  />
                  <q-badge v-if="!userScopes.length" outline color="grey" text-color="grey" label="member" />
                </div>
              </div>
            </q-tab-panel>

            <q-tab-panel name="security">
              <div class="panel-title q-mb-md">Security</div>

              <div class="profile-section">
                <div class="profile-section-title">Password</div>
                <q-btn
                  unelevated
                  color="primary"
                  text-color="dark"
                  icon="lock_reset"
                  label="change password"
                  @click="changePasswordOpen = true"
                />
                <div class="text-caption text-grey-6 q-mt-xs">
                  Requires your current password. Other sessions are signed out after a change.
                </div>
              </div>
            </q-tab-panel>
          </q-tab-panels>
        </div>
      </div>
    </div>

    <ChangePasswordDialog v-model:open="changePasswordOpen" />
  </q-page>
</template>