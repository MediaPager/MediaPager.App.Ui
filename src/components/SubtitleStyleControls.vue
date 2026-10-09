<script setup>
import { computed, ref, watch } from 'vue'
import {
  subtitleStyle,
  fontFamilyOptions,
  fontWeightOptions,
  subtitleStyleReset,
} from '../composables/usePlayback'

// ── Subtitle style color-channel helpers (view-only, operate on subtitleStyle) ──

function parseColor(color) {
  const rgbaMatch = (color || '').match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\)/)
  if (rgbaMatch) {
    return {
      r: Number(rgbaMatch[1]),
      g: Number(rgbaMatch[2]),
      b: Number(rgbaMatch[3]),
      a: rgbaMatch[4] === undefined ? 1 : Number(rgbaMatch[4]),
    }
  }
  const hex = (color || '').replace('#', '')
  const expanded = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
  if (/^[0-9a-fA-F]{6}$/.test(expanded)) {
    return {
      r: parseInt(expanded.slice(0, 2), 16),
      g: parseInt(expanded.slice(2, 4), 16),
      b: parseInt(expanded.slice(4, 6), 16),
      a: 1,
    }
  }
  return null
}

function toRgbaString({ r, g, b, a }) {
  const alpha = Math.min(1, Math.max(0, Number.isFinite(a) ? a : 1))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function toHex({ r, g, b }) {
  const to2 = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0').toUpperCase()
  return `#${to2(r)}${to2(g)}${to2(b)}`
}

function makeChannel(key, channel) {
  return computed({
    get() {
      return parseColor(subtitleStyle.value[key])?.[channel] ?? (channel === 'a' ? 1 : 0)
    },
    set(value) {
      const current = parseColor(subtitleStyle.value[key]) ?? { r: 0, g: 0, b: 0, a: 1 }
      const numeric = Number(value)
      current[channel] = channel === 'a'
        ? Math.min(1, Math.max(0, Number.isFinite(numeric) ? numeric : current.a))
        : Math.min(255, Math.max(0, Math.round(Number.isFinite(numeric) ? numeric : current[channel])))
      subtitleStyle.value[key] = toRgbaString(current)
    },
  })
}

const textR = makeChannel('color', 'r')
const textG = makeChannel('color', 'g')
const textB = makeChannel('color', 'b')
const textA = makeChannel('color', 'a')
const bgR = makeChannel('background', 'r')
const bgG = makeChannel('background', 'g')
const bgB = makeChannel('background', 'b')
const bgA = makeChannel('background', 'a')

const textHexInput = ref('')
const backgroundHexInput = ref('')
const textHexFocused = ref(false)
const backgroundHexFocused = ref(false)

function hexDigitsOnly(value) {
  return String(value ?? '').replace(/#/g, '').replace(/[^0-9a-fA-F]/g, '').slice(0, 6)
}

function commitHex(channels, raw) {
  const digits = hexDigitsOnly(raw).toUpperCase()
  if (!/^[0-9A-F]{3}$|^[0-9A-F]{6}$/.test(digits)) return
  const expanded = digits.length === 3 ? digits.split('').map((c) => c + c).join('') : digits
  channels.r.value = parseInt(expanded.slice(0, 2), 16)
  channels.g.value = parseInt(expanded.slice(2, 4), 16)
  channels.b.value = parseInt(expanded.slice(4, 6), 16)
}

function syncHexFromModel() {
  textHexInput.value = toHex({ r: textR.value, g: textG.value, b: textB.value }).slice(1)
  backgroundHexInput.value = toHex({ r: bgR.value, g: bgG.value, b: bgB.value }).slice(1)
}

function commitTextHex() {
  commitHex({ r: textR, g: textG, b: textB }, textHexInput.value)
  syncHexFromModel()
}

function commitBackgroundHex() {
  commitHex({ r: bgR, g: bgG, b: bgB }, backgroundHexInput.value)
  syncHexFromModel()
}

syncHexFromModel()
watch([textR, textG, textB], () => { if (!textHexFocused.value) syncHexFromModel() })
watch([bgR, bgG, bgB], () => { if (!backgroundHexFocused.value) syncHexFromModel() })
</script>

<template>
  <div>
    <div class="panel-title">Size</div>
    <q-slider v-model="subtitleStyle.size" :min="0.5" :max="2.5" :step="0.1" color="primary" dark />

    <div class="panel-title">Position</div>
    <q-slider v-model="subtitleStyle.position" :min="0" :max="150" :step="5" color="primary" dark />

    <div class="panel-title q-mt-md">Font</div>
    <q-select
      v-model="subtitleStyle.fontFamily"
      :options="fontFamilyOptions"
      dark
      dense
      outlined
      emit-value
      map-options
    />

    <div class="panel-title q-mt-md">Weight</div>
    <q-select
      v-model="subtitleStyle.fontWeight"
      :options="fontWeightOptions"
      dark
      dense
      outlined
      emit-value
      map-options
    />

    <div class="color-row q-mt-md">
      <span class="color-label">Text color</span>
      <q-btn unelevated class="color-swatch" :style="{ background: subtitleStyle.color }">
        <q-popup-proxy cover transition-show="scale" transition-hide="scale">
          <div class="q-pa-sm color-popup">
            <q-input
              :model-value="textHexInput"
              dark
              dense
              outlined
              label="hex"
              class="q-mb-sm"
              @update:model-value="(v) => { textHexInput = hexDigitsOnly(v) }"
              @focus="textHexFocused = true"
              @focusout="textHexFocused = false; commitTextHex()"
              @keydown.enter="commitTextHex()"
            >
              <template #prepend>
                <span class="hex-prefix">#</span>
              </template>
            </q-input>
            <div class="rgba-fields">
              <q-input v-model.number="textR" dark dense outlined type="number" min="0" max="255" label="R" class="rgba-field" />
              <q-input v-model.number="textG" dark dense outlined type="number" min="0" max="255" label="G" class="rgba-field" />
              <q-input v-model.number="textB" dark dense outlined type="number" min="0" max="255" label="B" class="rgba-field" />
              <q-input v-model.number="textA" dark dense outlined type="number" min="0" max="1" step="0.05" label="A" class="rgba-field" />
            </div>
            <q-color
              v-model="subtitleStyle.color"
              dark
              format-model="rgba"
              no-header
              no-footer
              class="style-color"
            />
          </div>
        </q-popup-proxy>
      </q-btn>
    </div>

    <div class="color-row q-mt-md">
      <span class="color-label">Background color</span>
      <q-btn unelevated class="color-swatch" :style="{ background: subtitleStyle.background }">
        <q-popup-proxy cover transition-show="scale" transition-hide="scale">
          <div class="q-pa-sm color-popup">
            <q-input
              :model-value="backgroundHexInput"
              dark
              dense
              outlined
              label="hex"
              class="q-mb-sm"
              @update:model-value="(v) => { backgroundHexInput = hexDigitsOnly(v) }"
              @focus="backgroundHexFocused = true"
              @focusout="backgroundHexFocused = false; commitBackgroundHex()"
              @keydown.enter="commitBackgroundHex()"
            >
              <template #prepend>
                <span class="hex-prefix">#</span>
              </template>
            </q-input>
            <div class="rgba-fields">
              <q-input v-model.number="bgR" dark dense outlined type="number" min="0" max="255" label="R" class="rgba-field" />
              <q-input v-model.number="bgG" dark dense outlined type="number" min="0" max="255" label="G" class="rgba-field" />
              <q-input v-model.number="bgB" dark dense outlined type="number" min="0" max="255" label="B" class="rgba-field" />
              <q-input v-model.number="bgA" dark dense outlined type="number" min="0" max="1" step="0.05" label="A" class="rgba-field" />
            </div>
            <q-color
              v-model="subtitleStyle.background"
              dark
              format-model="rgba"
              no-header
              no-footer
              class="style-color"
            />
          </div>
        </q-popup-proxy>
      </q-btn>
    </div>

    <q-btn
      flat
      dense
      color="grey-5"
      label="reset style"
      class="q-mt-md"
      @click="subtitleStyleReset"
    />
  </div>
</template>