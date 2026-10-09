import { createApp } from 'vue'
import { Dark, Notify, Quasar } from 'quasar'

import '@quasar/extras/material-icons/material-icons.css'
import 'quasar/src/css/index.sass'
import './assets/css/index.css'

import App from './App.vue'
import { router } from './router'
import { loadRuntimeConfig } from './composables/useApi'

const app = createApp(App)

app.use(Quasar, { plugins: { Notify } })
app.use(router)
Dark.set(true)

// Resolve the API base URL before the first render so no request races the config.
loadRuntimeConfig().finally(() => app.mount('#app'))
