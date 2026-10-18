import test from 'node:test'
import assert from 'node:assert/strict'
import { subtitleFileErrorMessage } from './subtitleErrors.js'

test('subtitle file error decodes a problem-details Blob', async () => {
  const error = {
    response: {
      data: new Blob([JSON.stringify({ detail: 'OpenSubtitles account login was rejected.' })], {
        type: 'application/problem+json',
      }),
    },
  }

  assert.equal(await subtitleFileErrorMessage(error), 'OpenSubtitles account login was rejected.')
})

test('subtitle file error formats a structured plugin error Blob', async () => {
  const error = {
    response: {
      data: new Blob([JSON.stringify({
        pluginError: { message: 'Subtitle download failed.', remediation: 'Check the provider settings.' },
      })], { type: 'application/problem+json' }),
    },
  }

  assert.equal(await subtitleFileErrorMessage(error), 'Subtitle download failed. Check the provider settings.')
})

test('subtitle file error falls back for unparseable Blob bodies', async () => {
  const error = { response: { data: new Blob(['upstream stack trace']) } }

  assert.equal(await subtitleFileErrorMessage(error), 'Could not fetch this subtitle.')
})
