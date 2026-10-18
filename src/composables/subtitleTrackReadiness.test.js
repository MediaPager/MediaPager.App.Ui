import assert from 'node:assert/strict'
import test from 'node:test'
import { waitForSubtitleTrackLoad } from './subtitleTrackReadiness.js'

class FakeTrack extends EventTarget {
  readyState = 1
}

test('loaded text tracks are ready without waiting for an event', async () => {
  const track = new FakeTrack()
  track.readyState = 2

  assert.equal(await waitForSubtitleTrackLoad(track), true)
})

test('waits for the track load event before continuing', async () => {
  const track = new FakeTrack()
  const ready = waitForSubtitleTrackLoad(track, 100)
  track.readyState = 2
  track.dispatchEvent(new Event('load'))

  assert.equal(await ready, true)
})

test('a track error releases the native-player wait', async () => {
  const track = new FakeTrack()
  const ready = waitForSubtitleTrackLoad(track, 100)
  track.readyState = 3
  track.dispatchEvent(new Event('error'))

  assert.equal(await ready, false)
})

test('a stalled track releases the native-player wait after the timeout', async () => {
  const track = new FakeTrack()

  assert.equal(await waitForSubtitleTrackLoad(track, 5), false)
})

test('missing track elements do not block playback', async () => {
  assert.equal(await waitForSubtitleTrackLoad(null), false)
})
