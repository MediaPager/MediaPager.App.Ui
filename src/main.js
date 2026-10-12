import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { Dark, Notify, Quasar } from 'quasar'
import {
  createQuasarInterop,
  createQuasarInteropPiniaPlugin,
  installQuasarInterop,
} from '@nobugsgiven/quasar-interop'

import '@quasar/extras/material-icons/material-icons.css'
import 'quasar/src/css/index.sass'
import './assets/css/index.css'

import App from './App.vue'
import { router } from './router'
import { api, loadRuntimeConfig } from './composables/useApi'

const app = createApp(App)
const apiBridge = createQuasarInterop(api)
const pinia = createPinia()
pinia.use(createQuasarInteropPiniaPlugin(apiBridge))

app.use(Quasar, { plugins: { Notify } })
app.use(router)
app.use(pinia)
installQuasarInterop(app, apiBridge)
Dark.set(true)

// Resolve the API base URL before the first render so no request races the config.
loadRuntimeConfig().finally(() => app.mount('#app'))
