import assert from 'node:assert/strict'
import test from 'node:test'
import { detectTouchDevice } from './deviceCapabilities.js'

test('hover-none remains sufficient to identify touch-oriented devices', () => {
  assert.equal(detectTouchDevice({ hoverNone: true }), true)
})

test('iPadOS desktop-mode WebViews are touch devices when touch points are available', () => {
  assert.equal(detectTouchDevice({
    hoverNone: false,
    platform: 'MacIntel',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15',
    maxTouchPoints: 5,
  }), true)
})

test('iOS and Android device identifiers are recognized even with a hover-capable pointer', () => {
  assert.equal(detectTouchDevice({
    hoverNone: false,
    platform: 'iPhone',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)',
    maxTouchPoints: 5,
  }), true)
  assert.equal(detectTouchDevice({
    hoverNone: false,
    platform: 'Linux armv8l',
    userAgent: 'Mozilla/5.0 (Linux; Android 16; Pixel)',
    maxTouchPoints: 5,
  }), true)
})

test('mouse-only desktop remains on the desktop player path', () => {
  assert.equal(detectTouchDevice({
    hoverNone: false,
    platform: 'MacIntel',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',
    maxTouchPoints: 0,
  }), false)
})
