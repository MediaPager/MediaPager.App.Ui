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
})

test('plugin UIs can request only the sanitized read-only catalog picker data', () => {
  assert.deepEqual(validatePluginUiApiRequest({ method: 'GET', url: '/catalogs' }, pluginId), {
    method: 'GET', path: '/catalogs', body: undefined, catalogList: true,
  })
  assert.deepEqual(validatePluginUiApiRequest({ method: 'GET', url: '/catalogs' }, 'mediapager.stream.sample'), {
    method: 'GET', path: '/catalogs', body: undefined, catalogList: true,
  })
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
