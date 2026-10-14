import assert from 'node:assert/strict'
import test from 'node:test'
import { configuredApiBaseUrl } from '../apiBaseUrl.js'

test('uses the SPA-configured API URL', () => {
  assert.equal(configuredApiBaseUrl('https://api.custom.example'), 'https://api.custom.example')
})

test('defaults to same-origin API routing', () => {
  assert.equal(configuredApiBaseUrl(undefined), '/')
  assert.equal(configuredApiBaseUrl('  '), '/')
})
