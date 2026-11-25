import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPluginUiUrl,
  externalPluginUiUrl,
  validatePluginUiApiRequest,
} from './pluginUiBridge.js'

const pluginId = 'mediapager.actions.sample'

test('packaged UI uses the host-served plugin asset path', () => {
  assert.equal(
    buildPluginUiUrl(pluginId, 'settings/index.html', 'https://app.example'),
    'https://app.example/plugins/mediapager.actions.sample/ui/settings/index.html',
  )
  assert.equal(externalPluginUiUrl('/settings/index.html'), null)
})

test('only HTTPS external UI URLs are loaded, without enabling the bridge', () => {
  assert.equal(externalPluginUiUrl('https://plugins.example/ui/'), 'https://plugins.example/ui/')
  assert.equal(externalPluginUiUrl('http://plugins.example/ui/'), 'about:blank')
  assert.equal(externalPluginUiUrl('https://user:pass@plugins.example/ui/'), 'about:blank')
})

test('bridge allows this plugin settings/actions and sanitized catalog-picker data', () => {
  assert.deepEqual(validatePluginUiApiRequest({
    method: 'GET', url: `/plugins/${pluginId}/settings`,
  }, pluginId), { method: 'GET', path: `/plugins/${pluginId}/settings`, body: undefined })

  assert.deepEqual(validatePluginUiApiRequest({
    method: 'PUT', url: `/plugins/${pluginId}/settings`, body: { output: '/library' },
  }, pluginId), { method: 'PUT', path: `/plugins/${pluginId}/settings`, body: '{"output":"/library"}' })

  assert.deepEqual(validatePluginUiApiRequest({
    method: 'POST', url: `/plugins/${pluginId}/actions/run`, body: { externalId: '42' },
  }, pluginId), {
    method: 'POST', path: `/plugins/${pluginId}/actions/run`, body: '{"externalId":"42"}',
  })

  assert.deepEqual(validatePluginUiApiRequest({
    method: 'POST', url: `/plugins/${pluginId}/agents/catalog-refresh/run`,
  }, pluginId), {
    method: 'POST', path: `/plugins/${pluginId}/agents/catalog-refresh/run`, body: undefined,
  })
  assert.equal(validatePluginUiApiRequest({
    method: 'POST', url: `/plugins/${pluginId}/agents/catalog-refresh/run`, body: { arbitrary: true },
  }, pluginId), null)
})

test('plugin UIs can request only the sanitized read-only catalog picker data', () => {
  assert.deepEqual(validatePluginUiApiRequest({ method: 'GET', url: '/catalogs' }, pluginId), {
    method: 'GET', path: '/catalogs', body: undefined, catalogList: true,
  })
  assert.deepEqual(validatePluginUiApiRequest({ method: 'GET', url: '/catalogs' }, 'mediapager.stream.sample'), {
    method: 'GET', path: '/catalogs', body: undefined, catalogList: true,
  })
})

test('packaged main-nav UI can read only its own paged plugin data', () => {
  assert.deepEqual(validatePluginUiApiRequest({
    method: 'GET', url: `/plugins/${pluginId}/data/public.records?offset=250&limit=100`,
  }, pluginId), {
    method: 'GET',
    path: `/plugins/${pluginId}/data/public.records?offset=250&limit=100`,
    body: undefined,
    pluginData: true,
  })
  assert.equal(validatePluginUiApiRequest({
    method: 'GET', url: `/plugins/${pluginId}/data/public.records?includeUrls=true`,
  }, pluginId), null)
  assert.equal(validatePluginUiApiRequest({
    method: 'GET', url: `/plugins/${pluginId}/data/public.records?limit=501`,
  }, pluginId), null)
  assert.deepEqual(validatePluginUiApiRequest({
    method: 'GET', url: `/plugins/${pluginId}/data/public.records/record-1`,
  }, pluginId), {
    method: 'GET',
    path: `/plugins/${pluginId}/data/public.records/record-1`,
    body: undefined,
    pluginData: true,
  })
  assert.equal(validatePluginUiApiRequest({
    method: 'GET', url: `/plugins/${pluginId}/data/private.records/record-1`,
  }, pluginId), null)
})

test('packaged main-nav UI can browse and read details from its own declared source', () => {
  assert.deepEqual(validatePluginUiApiRequest({
    method: 'GET', url: `/plugins/${pluginId}/sources/source-one/browse?query=sample&page=2`,
  }, pluginId), {
    method: 'GET',
    path: `/plugins/${pluginId}/sources/source-one/browse?query=sample&page=2`,
    body: undefined,
    pluginSourceBrowse: true,
  })
  assert.deepEqual(validatePluginUiApiRequest({
    method: 'GET', url: `/plugins/${pluginId}/sources/source-one/details/item-1`,
  }, pluginId), {
    method: 'GET',
    path: `/plugins/${pluginId}/sources/source-one/details/item-1`,
    body: undefined,
    pluginSourceDetails: true,
  })
  assert.equal(validatePluginUiApiRequest({
    method: 'GET', url: `/plugins/${pluginId}/sources/source-one/browse?includePaths=true`,
  }, pluginId), null)
  assert.equal(validatePluginUiApiRequest({
    method: 'GET', url: '/plugins/mediapager.email.smtp/sources/source-one/browse',
  }, pluginId), null)
})

test('bridge rejects other plugins, arbitrary APIs, URL overrides, and unsafe methods', () => {
  const denied = [
    { method: 'GET', url: '/plugins' },
    { method: 'GET', url: '/catalogs/1' },
    { method: 'GET', url: '/catalogs/nav' },
    { method: 'POST', url: '/catalogs' },
    { method: 'GET', url: '/catalogs?includePaths=true' },
    { method: 'GET', url: '/me' },
    { method: 'GET', url: '/plugins/mediapager.email.smtp/settings' },
    { method: 'DELETE', url: `/plugins/${pluginId}/settings` },
    { method: 'GET', url: `https://app.example/plugins/${pluginId}/settings` },
    { method: 'GET', url: `/plugins/${pluginId}/settings?includeSecrets=true` },
    { method: 'POST', url: `/plugins/${pluginId}/actions/a%2Fb` },
    { method: 'POST', url: '/plugins/mediapager.email.smtp/agents/refresh/run' },
    { method: 'POST', url: `/plugins/${pluginId}/agents/../run` },
    { method: 'POST', url: `/plugins/${pluginId}/agents/refresh/run?force=true` },
  ]
  for (const request of denied) assert.equal(validatePluginUiApiRequest(request, pluginId), null)
})

test('bridge rejects invalid and oversized payloads', () => {
  assert.equal(validatePluginUiApiRequest({
    method: 'GET', url: `/plugins/${pluginId}/settings`, body: {},
  }, pluginId), null)
  assert.equal(validatePluginUiApiRequest({
    method: 'PUT', url: `/plugins/${pluginId}/settings`, body: { value: 'x'.repeat(65 * 1024) },
  }, pluginId), null)
})
