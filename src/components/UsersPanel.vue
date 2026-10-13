<script setup>
import { computed, onMounted, ref } from 'vue'
import { Dialog, Notify } from 'quasar'
import { api } from '../composables/useApi'
import { useAuth } from '../composables/useAuth'

const { currentUserEmail } = useAuth()
const users = ref([])
const availableScopes = ref([])
const loading = ref(true)
const savingScopes = ref(false)
const searchText = ref('')
const statusFilter = ref('all')
const scopeDialogOpen = ref(false)
const scopeTarget = ref(null)
const selectedScopes = ref([])
const scopeError = ref('')

const counts = computed(() => ({
  all: users.value.length,
  active: users.value.filter((user) => user.status === 'active').length,
  inactive: users.value.filter((user) => user.status === 'inactive').length,
  deleted: users.value.filter((user) => user.status === 'deleted').length,
}))

const filteredUsers = computed(() => {
  const query = searchText.value.trim().toLowerCase()
  return users.value.filter((user) => {
    if (statusFilter.value !== 'all' && user.status !== statusFilter.value) return false
    if (!query) return true
    return [user.email, user.firstName, user.lastName, ...(user.scopes ?? [])]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(query))
  })
})

function errorMessage(error, fallback) {
  return error.response?.data?.error ?? error.response?.data?.detail ?? fallback
}

async function loadUsers() {
  loading.value = true
  try {
    const [userResponse, scopeResponse] = await Promise.all([
      api.get('/users'),
      api.get('/users/scopes'),
    ])
    users.value = userResponse.data ?? []
    availableScopes.value = scopeResponse.data ?? []
  } catch (error) {
    Notify.create({ type: 'negative', message: errorMessage(error, 'Could not load users.') })
  } finally {
    loading.value = false
  }
}

function displayName(user) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ')
  return name || user.email
}

function initials(user) {
  const parts = [user.firstName, user.lastName].filter(Boolean)
  if (parts.length) return parts.map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  return (user.email?.[0] ?? '?').toUpperCase()
}

function isCurrentUser(user) {
  return user.email?.toLowerCase() === currentUserEmail.value.toLowerCase()
}

function editScopes(user) {
  scopeTarget.value = user
  selectedScopes.value = [...(user.scopes ?? [])]
  scopeError.value = ''
  scopeDialogOpen.value = true
}

async function saveScopes() {
  if (!scopeTarget.value) return
  savingScopes.value = true
  scopeError.value = ''
  try {
    await api.put(`/users/${encodeURIComponent(scopeTarget.value.id)}/scopes`, { scopes: selectedScopes.value })
    Notify.create({ type: 'positive', message: 'Access updated.' })
    scopeDialogOpen.value = false
    await loadUsers()
  } catch (error) {
    scopeError.value = errorMessage(error, 'Could not update access.')
  } finally {
    savingScopes.value = false
  }
}

function confirmAction(user, { title, message, label, color, path, method = 'post' }) {
  Dialog.create({
    dark: true,
    title,
    message,
    cancel: { flat: true, label: 'Cancel' },
    ok: { unelevated: true, label, color },
    persistent: true,
  }).onOk(async () => {
    try {
      await api[method](`/users/${encodeURIComponent(user.id)}${path}`)
      Notify.create({ type: 'positive', message: `${displayName(user)} updated.` })
      await loadUsers()
    } catch (error) {
      Notify.create({ type: 'negative', message: errorMessage(error, 'Could not update this account.') })
    }
  })
}

function deactivate(user) {
  confirmAction(user, {
    title: 'Deactivate this account?',
    message: `${displayName(user)} will be signed out and won’t be able to sign in until reactivated.`,
    label: 'Deactivate', color: 'warning', path: '/deactivate',
  })
}

function removeUser(user) {
  confirmAction(user, {
    title: 'Move this account to deleted?',
    message: `${displayName(user)} will be soft-deleted. You can restore the account later.`,
    label: 'Soft delete', color: 'negative', path: '', method: 'delete',
  })
}

function activate(user) {
  confirmAction(user, {
    title: 'Reactivate this account?',
    message: `${displayName(user)} will be able to sign in again.`,
    label: 'Reactivate', color: 'positive', path: '/activate',
  })
}

function restore(user) {
  confirmAction(user, {
    title: 'Restore this account?',
    message: `${displayName(user)} will be restored with their previous active status and access.`,
    label: 'Restore', color: 'positive', path: '/restore',
  })
}

onMounted(loadUsers)
</script>

<template>
  <section class="users-admin">
    <div class="users-admin__heading row items-end justify-between q-col-gutter-md">
      <div class="col">
        <div class="eyebrow">ACCESS & MEMBERS</div>
        <h1 class="users-admin__title">People in your library</h1>
        <p class="users-admin__subtitle">Manage access, roles, and account status from one place.</p>
      </div>
      <div class="users-admin__total">{{ counts.all }} <span>accounts</span></div>
    </div>

    <div class="users-stats">
      <button
        v-for="item in [
          { key: 'all', label: 'All members', icon: 'groups', tone: 'blue' },
          { key: 'active', label: 'Active', icon: 'check_circle', tone: 'green' },
          { key: 'inactive', label: 'Inactive', icon: 'pause_circle', tone: 'amber' },
          { key: 'deleted', label: 'Deleted', icon: 'delete_outline', tone: 'rose' },
        ]"
        :key="item.key"
        class="users-stat"
        :class="[`users-stat--${item.tone}`, { 'users-stat--selected': statusFilter === item.key }]"
        @click="statusFilter = item.key"
      >
        <span class="users-stat__icon"><q-icon :name="item.icon" /></span>
        <span class="users-stat__copy"><span class="users-stat__label">{{ item.label }}</span><strong>{{ counts[item.key] }}</strong></span>
      </button>
    </div>

    <div class="users-toolbar">
      <q-input
        v-model="searchText"
        dark
        outlined
        dense
        clearable
        placeholder="Search name, email, or access…"
        class="users-search"
      >
        <template #prepend><q-icon name="search" /></template>
      </q-input>
      <div class="users-toolbar__hint"><q-icon name="shield" /> Access changes take effect immediately</div>
    </div>

    <div v-if="loading" class="users-loading"><q-spinner-dots color="primary" size="2.5rem" /><span>Loading members…</span></div>
    <div v-else-if="!filteredUsers.length" class="users-empty">
      <div class="users-empty__icon"><q-icon :name="searchText ? 'person_search' : 'group_add'" /></div>
      <div class="text-h6">{{ searchText ? 'No matching members' : 'No accounts here yet' }}</div>
      <div class="text-grey-6 q-mt-xs">{{ searchText ? 'Try a different search or status filter.' : 'Invited people will appear here after they join.' }}</div>
    </div>

    <div v-else class="users-list">
      <article v-for="user in filteredUsers" :key="user.id" class="user-card" :class="`user-card--${user.status}`">
        <div class="user-card__identity">
          <q-avatar size="46px" class="user-avatar">{{ initials(user) }}</q-avatar>
          <div class="user-card__name-wrap">
            <div class="user-card__name">
              {{ displayName(user) }}
              <span v-if="isCurrentUser(user)" class="you-pill">YOU</span>
            </div>
            <div class="user-card__email">{{ user.email }}</div>
          </div>
        </div>

        <div class="user-card__access">
          <div class="user-card__section-label">ACCESS</div>
          <div v-if="user.scopes?.length" class="scope-pills">
            <span v-for="scope in user.scopes" :key="scope" class="scope-pill" :class="{ 'scope-pill--super': scope === 'admin:super' }">
              {{ scope.replace('admin:', '') }}
            </span>
          </div>
          <span v-else class="member-access"><q-icon name="visibility" /> Library member</span>
        </div>

        <div class="user-card__status-wrap">
          <span class="status-pill" :class="`status-pill--${user.status}`">
            <span class="status-pill__dot" /> {{ user.status }}
          </span>
          <span v-if="!user.emailConfirmed" class="email-pending">Email not verified</span>
        </div>

        <div class="user-card__actions">
          <q-btn
            v-if="user.status !== 'deleted'"
            unelevated
            dense
            no-caps
            icon="tune"
            label="Access"
            class="access-button"
            @click="editScopes(user)"
          />
          <q-btn flat round dense icon="more_horiz" class="more-button" aria-label="More account actions">
            <q-menu dark anchor="bottom right" self="top right" class="user-actions-menu">
              <q-list dense style="min-width: 190px">
                <q-item v-if="user.status === 'active'" clickable v-close-popup :disable="isCurrentUser(user)" @click="deactivate(user)">
                  <q-item-section avatar><q-icon name="pause_circle_outline" /></q-item-section>
                  <q-item-section>Deactivate</q-item-section>
                </q-item>
                <q-item v-if="user.status === 'inactive'" clickable v-close-popup @click="activate(user)">
                  <q-item-section avatar><q-icon name="play_circle_outline" /></q-item-section>
                  <q-item-section>Reactivate</q-item-section>
                </q-item>
                <q-item v-if="user.status !== 'deleted'" clickable v-close-popup :disable="isCurrentUser(user)" class="text-negative" @click="removeUser(user)">
                  <q-item-section avatar><q-icon name="delete_outline" color="negative" /></q-item-section>
                  <q-item-section>Soft delete</q-item-section>
                </q-item>
                <q-item v-if="user.status === 'deleted'" clickable v-close-popup @click="restore(user)">
                  <q-item-section avatar><q-icon name="restore" color="positive" /></q-item-section>
                  <q-item-section>Restore account</q-item-section>
                </q-item>
              </q-list>
            </q-menu>
          </q-btn>
        </div>
      </article>
    </div>

    <q-dialog v-model="scopeDialogOpen">
      <q-card dark class="scope-dialog">
        <q-card-section class="scope-dialog__header">
          <div class="scope-dialog__mark"><q-icon name="admin_panel_settings" /></div>
          <div class="col">
            <div class="text-h6 text-weight-bold">Manage access</div>
            <div class="text-caption text-grey-5">{{ scopeTarget?.email }}</div>
          </div>
          <q-btn flat round dense icon="close" v-close-popup aria-label="Close" />
        </q-card-section>
        <q-separator dark />
        <q-card-section class="q-pt-md">
          <div class="text-caption text-grey-5 q-mb-sm">Choose only the permissions this person needs. Changes sign out their existing sessions.</div>
          <div v-for="scope in availableScopes" :key="scope.id" class="scope-option">
            <q-checkbox v-model="selectedScopes" :val="scope.id" dark color="primary" />
            <div class="scope-option__copy">
              <div class="scope-option__label">{{ scope.label }}</div>
              <div class="scope-option__description">{{ scope.description }}</div>
            </div>
          </div>
          <q-banner v-if="scopeError" dense rounded class="error-banner q-mt-md">{{ scopeError }}</q-banner>
        </q-card-section>
        <q-card-actions align="right" class="scope-dialog__actions">
          <q-btn flat no-caps label="Cancel" v-close-popup />
          <q-btn unelevated no-caps color="primary" text-color="dark" icon="save" label="Save access" :loading="savingScopes" @click="saveScopes" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </section>
</template>

<style scoped>
.users-admin { --line: rgba(166, 186, 221, .11); --muted: #8b9ab4; color: #f2f5fb; width: 100%; }
.users-admin__heading { margin: 0 0 25px; }
.eyebrow { color: #8b9ab4; font-size: 10px; font-weight: 800; letter-spacing: .18em; }
.users-admin__title { margin: 7px 0 5px; font-size: clamp(25px, 3vw, 34px); font-weight: 750; letter-spacing: -.035em; }
.users-admin__subtitle { margin: 0; color: var(--muted); font-size: 14px; }
.users-admin__total { padding: 9px 13px; border: 1px solid var(--line); border-radius: 12px; background: rgba(255,255,255,.025); color: #f5f7fb; font-size: 18px; font-weight: 750; }
.users-admin__total span { color: var(--muted); font-size: 12px; font-weight: 500; }
.users-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 11px; margin-bottom: 20px; }
.users-stat { display: flex; align-items: center; gap: 12px; min-height: 80px; padding: 13px 15px; border: 1px solid var(--line); border-radius: 14px; background: linear-gradient(145deg, rgba(24,35,56,.94), rgba(13,21,36,.94)); color: #f3f6fb; text-align: left; cursor: pointer; transition: border-color .18s, transform .18s, background .18s; }
.users-stat:hover { transform: translateY(-1px); border-color: rgba(135,169,220,.35); }
.users-stat--selected { border-color: rgba(97,161,255,.65); box-shadow: 0 0 0 1px rgba(97,161,255,.18), 0 8px 28px rgba(25,83,160,.12); }
.users-stat__icon { display: grid; width: 39px; height: 39px; place-items: center; border-radius: 12px; font-size: 20px; }
.users-stat--blue .users-stat__icon { color: #8bbaff; background: rgba(75,139,229,.14); }
.users-stat--green .users-stat__icon { color: #68d8ac; background: rgba(62,190,139,.13); }
.users-stat--amber .users-stat__icon { color: #f2bd69; background: rgba(219,158,66,.13); }
.users-stat--rose .users-stat__icon { color: #f18b9a; background: rgba(220,91,115,.13); }
.users-stat__copy { display: flex; flex-direction: column; gap: 2px; }
.users-stat__label { color: var(--muted); font-size: 11px; font-weight: 650; }
.users-stat__copy strong { font-size: 21px; line-height: 1.05; }
.users-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 11px; }
.users-search { width: min(430px, 100%); }
.users-search :deep(.q-field__control) { border-radius: 12px; background: rgba(12,19,32,.65); }
.users-toolbar__hint { display: flex; align-items: center; gap: 6px; color: #8090aa; font-size: 11px; white-space: nowrap; }
.users-toolbar__hint .q-icon { color: #70cfa7; }
.users-list { display: flex; flex-direction: column; gap: 9px; }
.user-card { display: grid; grid-template-columns: minmax(210px, 1.4fr) minmax(155px, 1fr) minmax(120px, .7fr) auto; align-items: center; gap: 18px; min-height: 88px; padding: 13px 15px; border: 1px solid var(--line); border-radius: 14px; background: linear-gradient(110deg, rgba(20,30,49,.96), rgba(14,22,37,.96)); transition: border-color .18s, background .18s; }
.user-card:hover { border-color: rgba(135,169,220,.28); background: linear-gradient(110deg, rgba(23,35,57,.98), rgba(15,24,40,.98)); }
.user-card--inactive, .user-card--deleted { opacity: .73; }
.user-card__identity { display: flex; align-items: center; gap: 12px; min-width: 0; }
.user-avatar { flex: 0 0 auto; color: #dceaff; background: linear-gradient(145deg, #315d94, #253d66); font-size: 14px; font-weight: 750; }
.user-card__name-wrap { min-width: 0; }
.user-card__name { overflow: hidden; color: #f2f5fb; font-size: 14px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.user-card__email { overflow: hidden; margin-top: 4px; color: var(--muted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.you-pill { margin-left: 6px; padding: 2px 5px; border-radius: 5px; background: rgba(85,157,255,.14); color: #91bdff; font-size: 8px; letter-spacing: .07em; vertical-align: 2px; }
.user-card__section-label { margin-bottom: 6px; color: #71819a; font-size: 9px; font-weight: 800; letter-spacing: .12em; }
.scope-pills { display: flex; flex-wrap: wrap; gap: 5px; }
.scope-pill { padding: 4px 7px; border: 1px solid rgba(127,153,191,.16); border-radius: 6px; background: rgba(108,132,171,.09); color: #afbdd3; font-size: 10px; font-weight: 600; }
.scope-pill--super { border-color: rgba(173,128,255,.25); background: rgba(147,101,235,.12); color: #c4a5ff; }
.member-access { display: inline-flex; align-items: center; gap: 5px; color: #a8b5c9; font-size: 12px; }
.member-access .q-icon { color: #6e95c9; font-size: 15px; }
.status-pill { display: inline-flex; align-items: center; gap: 7px; padding: 6px 9px; border: 1px solid transparent; border-radius: 99px; font-size: 10px; font-weight: 700; text-transform: capitalize; }
.status-pill__dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.status-pill--active { border-color: rgba(58,197,139,.2); background: rgba(46,174,121,.1); color: #6cdbab; }
.status-pill--inactive { border-color: rgba(231,180,85,.19); background: rgba(198,148,51,.1); color: #e9bf6b; }
.status-pill--deleted { border-color: rgba(231,109,129,.2); background: rgba(196,70,91,.1); color: #ef91a0; }
.email-pending { display: block; margin-top: 6px; color: #dda85d; font-size: 10px; }
.user-card__actions { display: flex; align-items: center; gap: 3px; }
.access-button { min-height: 34px; padding: 0 10px; border: 1px solid rgba(124,153,197,.19); border-radius: 9px; background: rgba(255,255,255,.035); color: #c3d2e9; font-size: 11px; }
.access-button:hover { background: rgba(87,145,225,.12); color: #e4efff; }
.more-button { color: #a4b2c8; }
.users-loading, .users-empty { display: flex; min-height: 230px; align-items: center; justify-content: center; flex-direction: column; gap: 9px; border: 1px dashed rgba(140,163,197,.17); border-radius: 16px; background: rgba(13,20,34,.42); color: #aab8cd; }
.users-empty__icon { display: grid; width: 48px; height: 48px; margin-bottom: 3px; place-items: center; border: 1px solid var(--line); border-radius: 15px; color: #8bbaff; background: rgba(72,123,197,.1); font-size: 23px; }
.scope-dialog { width: min(540px, 95vw); border: 1px solid rgba(140,163,197,.16); border-radius: 18px; background: linear-gradient(145deg, #151f32, #0e1625); box-shadow: 0 28px 90px rgba(0,0,0,.55); }
.scope-dialog__header { display: flex; align-items: center; gap: 12px; padding: 19px 20px; }
.scope-dialog__mark { display: grid; width: 42px; height: 42px; place-items: center; border: 1px solid rgba(114,162,232,.19); border-radius: 13px; background: rgba(83,139,219,.13); color: #8bbaff; font-size: 22px; }
.scope-option { display: flex; align-items: flex-start; gap: 6px; padding: 9px 4px; border-bottom: 1px solid rgba(155,178,212,.08); }
.scope-option:last-child { border-bottom: 0; }
.scope-option__copy { padding-top: 8px; }
.scope-option__label { color: #eaf0fa; font-size: 13px; font-weight: 650; }
.scope-option__description { margin-top: 3px; color: #8796ad; font-size: 11px; line-height: 1.45; }
.scope-dialog__actions { padding: 12px 20px 18px; }
@media (max-width: 900px) {
  .users-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .user-card { grid-template-columns: minmax(0, 1fr) auto; gap: 12px; }
  .user-card__identity { grid-column: 1; }
  .user-card__access { grid-column: 1; }
  .user-card__status-wrap { grid-column: 2; grid-row: 1; justify-self: end; }
  .user-card__actions { grid-column: 2; grid-row: 2; justify-self: end; }
  .user-card__section-label { display: none; }
}
@media (max-width: 600px) {
  .users-admin__heading { align-items: flex-start; }
  .users-admin__total { padding: 7px 9px; font-size: 15px; }
  .users-stats { gap: 7px; margin-bottom: 14px; }
  .users-stat { min-height: 68px; gap: 9px; padding: 9px; border-radius: 11px; }
  .users-stat__icon { width: 32px; height: 32px; border-radius: 10px; }
  .users-stat__label { font-size: 10px; }
  .users-stat__copy strong { font-size: 18px; }
  .users-toolbar { align-items: stretch; flex-direction: column; gap: 8px; }
  .users-search { width: 100%; }
  .users-toolbar__hint { justify-content: flex-end; font-size: 10px; }
  .user-card { gap: 10px; padding: 12px; }
  .user-card__access { padding-left: 58px; }
}
</style>
