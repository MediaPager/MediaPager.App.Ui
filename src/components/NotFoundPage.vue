<script setup>
import { useRoute, useRouter } from 'vue-router'

// 404: an unmatched URL (or a tab/catalog/plugin that no longer exists) lands here
// instead of silently bouncing home — the address bar keeps the bad URL so it's clear
// what was asked for. Design: user's retro-TV "NO SIGNAL" mockup.
const route = useRoute()
const router = useRouter()

function goHome() {
  router.push('/')
}

function goSearch() {
  router.push('/stream/movies')
}
</script>

<template>
  <main class="nf-page">
    <div class="nf-shell">
      <section class="nf-hero">
        <div class="nf-hero-visual">
          <div class="nf-error-code-wrap">
            <div class="nf-eyebrow">PAGE NOT FOUND</div>
            <div class="nf-error-code">404</div>
          </div>

          <div class="nf-tv-wrap" aria-hidden="true">
            <div class="nf-tv">
              <div class="nf-tv-frame">
                <div class="nf-tv-screen">
                  <div class="nf-static"></div>
                  <div class="nf-static-overlay"></div>
                  <div class="nf-vertical-roll"></div>
                  <div class="nf-glare"></div>
                  <div class="nf-screen-label">NO SIGNAL</div>
                </div>
              </div>

              <div class="nf-tv-controls">
                <span></span>
                <span></span>
                <span></span>
              </div>

              <div class="nf-tv-legs">
                <i></i>
                <i></i>
              </div>
            </div>
          </div>
        </div>

        <h1>
          Well...
          <span>that page is definitely not broadcasting.</span>
        </h1>

        <p class="nf-description">
          The page you requested is either missing, moved,
          unplugged, or currently acting like it never existed.
        </p>

        <div class="nf-diag-card">
          <div class="nf-diag-header">
            <div class="nf-diag-title">
              <span class="nf-pulse"></span>
              MediaPager Diagnostics
            </div>

            <div class="nf-diag-badge">
              TOTALLY SCIENTIFIC
            </div>
          </div>

          <div class="nf-diag-body">
            <div class="nf-row">
              <div>
                <div class="nf-label">Requested route</div>
                <div class="nf-sub">{{ route.fullPath }}</div>
              </div>

              <div class="nf-state nf-bad">MISSING</div>
            </div>

            <div class="nf-row">
              <div>
                <div class="nf-label">Asked the server</div>
                <div class="nf-sub">It gave us static.</div>
              </div>

              <div class="nf-state nf-warning">NO SIGNAL</div>
            </div>

            <div class="nf-row">
              <div>
                <div class="nf-label">Checked the library</div>
                <div class="nf-sub">Even the weird folders.</div>
              </div>

              <div class="nf-state nf-bad">NOT THERE</div>
            </div>
          </div>
        </div>

        <div class="nf-pager-message">
          <div class="nf-pager-symbol">📟</div>

          <div>
            <div class="nf-pager-label">PAGER RESPONSE</div>
            <div class="nf-pager-text">
              “Have you tried turning the URL off and on again?”
            </div>
          </div>
        </div>

        <div class="nf-actions">
          <button class="nf-primary" @click="goHome">
            BACK TO MEDIAPAGER
          </button>

          <button class="nf-secondary" @click="goSearch">
            SEARCH MEDIA
          </button>
        </div>

        <div class="nf-footer">
          ERR_PAGE_GHOSTED
          <span>•</span>
          NO BUGS GIVEN
          <span>•</span>
          PLEASE BLAME THE URL
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.nf-page {
  min-height: 100vh;
  padding: 60px 28px;
  display: flex;
  justify-content: center;
  background:
    radial-gradient(
      circle at 20% 15%,
      rgba(0, 174, 239, 0.08),
      transparent 26%
    ),
    radial-gradient(
      circle at 80% 75%,
      rgba(127, 224, 0, 0.04),
      transparent 26%
    ),
    #070d14;
}

.nf-shell {
  width: min(980px, 100%);
}

.nf-hero {
  margin-top: 20px;
}

.nf-hero-visual {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 30px;
  align-items: center;
}

.nf-error-code-wrap {
  min-width: 0;
}

.nf-eyebrow {
  color: #7fe000;
  font-size: 11px;
  font-weight: 850;
  letter-spacing: 2px;
  margin-bottom: 16px;
}

.nf-error-code {
  font-size: clamp(120px, 18vw, 220px);
  line-height: 0.82;
  font-weight: 900;
  letter-spacing: -12px;
  color: #f3f6fa;
  text-shadow:
    0 0 40px rgba(0, 174, 239, 0.08),
    0 0 80px rgba(0, 174, 239, 0.05);
}

.nf-tv-wrap {
  display: flex;
  justify-content: center;
}

.nf-tv {
  position: relative;
  width: 280px;
}

.nf-tv-frame {
  position: relative;
  padding: 14px;
  border-radius: 22px;
  background:
    linear-gradient(145deg, #182333, #0d1420);
  border: 1px solid #2a3b52;
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.02),
    0 10px 30px rgba(0, 0, 0, 0.45),
    0 0 24px rgba(0, 174, 239, 0.08);
}

.nf-tv-screen {
  position: relative;
  height: 220px;
  overflow: hidden;
  border-radius: 14px;
  background: #0b1119;
  border: 2px solid #334863;
  box-shadow:
    inset 0 0 24px rgba(0, 0, 0, 0.6),
    inset 0 0 80px rgba(255, 255, 255, 0.02);
}

.nf-static {
  position: absolute;
  inset: -20%;
  background:
    repeating-radial-gradient(
      circle at 20% 30%,
      rgba(255,255,255,0.08) 0 1px,
      transparent 1px 4px
    ),
    repeating-radial-gradient(
      circle at 70% 60%,
      rgba(255,255,255,0.06) 0 1px,
      transparent 1px 5px
    ),
    repeating-linear-gradient(
      0deg,
      rgba(255,255,255,0.03) 0 2px,
      rgba(0,0,0,0.03) 2px 4px
    );
  opacity: 0.9;
  filter: contrast(160%) brightness(120%) grayscale(100%);
  animation:
    nf-noiseShift 0.18s steps(6) infinite,
    nf-flicker 0.12s infinite alternate;
}

.nf-static-overlay {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(
      180deg,
      rgba(255,255,255,0.03),
      rgba(255,255,255,0.01) 20%,
      rgba(0,0,0,0.02) 50%,
      rgba(255,255,255,0.02) 80%,
      rgba(255,255,255,0.04)
    );
  mix-blend-mode: screen;
  pointer-events: none;
}

.nf-vertical-roll {
  position: absolute;
  top: -20%;
  bottom: -20%;
  width: 10px;
  left: -12%;
  background: linear-gradient(
    90deg,
    rgba(255,255,255,0),
    rgba(255,255,255,0.12),
    rgba(255,255,255,0.35),
    rgba(255,255,255,0.12),
    rgba(255,255,255,0)
  );
  filter: blur(1px);
  animation: nf-verticalRoll 2.8s linear infinite;
  opacity: 0.9;
}

.nf-glare {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(
      120deg,
      rgba(255,255,255,0.12) 0%,
      rgba(255,255,255,0.03) 18%,
      rgba(255,255,255,0) 32%
    );
  pointer-events: none;
}

.nf-screen-label {
  position: absolute;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(11, 17, 25, 0.8);
  border: 1px solid rgba(127, 224, 0, 0.25);
  color: #8dff00;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 1.2px;
  box-shadow: 0 0 18px rgba(127, 224, 0, 0.1);
}

.nf-tv-controls {
  position: absolute;
  right: -16px;
  top: 28px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.nf-tv-controls span {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: linear-gradient(145deg, #334863, #1a2636);
  border: 1px solid #405671;
  box-shadow: inset 0 1px 2px rgba(255,255,255,0.06);
}

.nf-tv-legs {
  display: flex;
  justify-content: space-between;
  padding: 0 58px;
  margin-top: -1px;
}

.nf-tv-legs i {
  display: block;
  width: 4px;
  height: 34px;
  background: linear-gradient(180deg, #405671, #263649);
  transform-origin: top center;
}

.nf-tv-legs i:first-child {
  transform: rotate(18deg);
}

.nf-tv-legs i:last-child {
  transform: rotate(-18deg);
}

h1 {
  margin: 34px 0 0;
  color: #f3f6fa;
  font-size: clamp(38px, 6vw, 58px);
  line-height: 1.02;
  letter-spacing: -2.6px;
  font-weight: 750;
  max-width: 760px;
}

h1 span {
  color: #00d4ff;
}

.nf-description {
  max-width: 640px;
  margin: 18px 0 0;
  color: #9aa7b5;
  font-size: 17px;
  line-height: 1.65;
}

.nf-diag-card {
  margin-top: 38px;
  border: 1px solid #2a3b52;
  border-radius: 14px;
  overflow: hidden;
  background: #0e1625;
  box-shadow:
    0 0 0 1px rgba(0, 174, 239, 0.05),
    0 0 28px rgba(0, 174, 239, 0.10),
    0 28px 70px rgba(0, 0, 0, 0.35);
}

.nf-diag-header {
  min-height: 60px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #2a3b52;
}

.nf-diag-title {
  display: flex;
  align-items: center;
  gap: 9px;
  color: #f3f6fa;
  font-size: 13px;
  font-weight: 700;
}

.nf-pulse {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #7fe000;
  box-shadow:
    0 0 8px #7fe000,
    0 0 16px rgba(127, 224, 0, 0.55);
}

.nf-diag-badge {
  padding: 6px 8px;
  border-radius: 6px;
  background: #121c2d;
  border: 1px solid #2a3b52;
  color: #00d4ff;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 1px;
}

.nf-diag-body {
  padding: 5px 16px;
}

.nf-row {
  min-height: 78px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  border-bottom: 1px solid rgba(42, 59, 82, 0.7);
}

.nf-row:last-child {
  border-bottom: 0;
}

.nf-label {
  color: #f3f6fa;
  font-size: 13px;
  font-weight: 700;
}

.nf-sub {
  margin-top: 5px;
  color: #718092;
  font-size: 11px;
  word-break: break-word;
}

.nf-state {
  padding: 7px 9px;
  border-radius: 6px;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.8px;
  white-space: nowrap;
}

.nf-state.nf-bad {
  color: #8dff00;
  background: rgba(127, 224, 0, 0.08);
  border: 1px solid rgba(127, 224, 0, 0.2);
}

.nf-state.nf-warning {
  color: #00d4ff;
  background: rgba(0, 174, 239, 0.08);
  border: 1px solid rgba(0, 174, 239, 0.2);
}

.nf-pager-message {
  margin-top: 16px;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 14px;
  border-radius: 12px;
  background: #0e1625;
  border: 1px dashed #2a3b52;
}

.nf-pager-symbol {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: #121c2d;
  font-size: 22px;
}

.nf-pager-label {
  color: #7fe000;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 1.5px;
}

.nf-pager-text {
  margin-top: 4px;
  color: #f3f6fa;
  font-size: 15px;
  font-weight: 650;
}

.nf-actions {
  margin-top: 28px;
  display: flex;
  gap: 12px;
}

.nf-actions button {
  min-height: 48px;
  padding: 0 20px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 850;
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease;
}

.nf-actions button:hover {
  transform: translateY(-2px);
}

.nf-primary {
  flex: 1;
  border: 1px solid #7fe000;
  background: #7fe000;
  color: #07100a;
  box-shadow: 0 0 18px rgba(127, 224, 0, 0.13);
}

.nf-primary:hover {
  background: #8dff00;
  box-shadow: 0 0 26px rgba(127, 224, 0, 0.23);
}

.nf-secondary {
  border: 1px solid #2a3b52;
  background: #0e1625;
  color: #f3f6fa;
}

.nf-secondary:hover {
  box-shadow: 0 0 20px rgba(0, 174, 239, 0.11);
}

.nf-footer {
  margin-top: 38px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: #536274;
  font-family:
    "SFMono-Regular",
    Consolas,
    monospace;
  font-size: 10px;
}

.nf-footer span {
  color: #2a3b52;
}

@keyframes nf-noiseShift {
  0% {
    transform: translate(0, 0) scale(1.02);
  }
  25% {
    transform: translate(-2%, 1%) scale(1.03);
  }
  50% {
    transform: translate(2%, -1%) scale(1.01);
  }
  75% {
    transform: translate(-1%, 2%) scale(1.02);
  }
  100% {
    transform: translate(1%, -2%) scale(1.03);
  }
}

@keyframes nf-flicker {
  0% {
    opacity: 0.82;
  }
  100% {
    opacity: 0.98;
  }
}

@keyframes nf-verticalRoll {
  0% {
    left: -12%;
  }
  100% {
    left: 112%;
  }
}

@media (max-width: 820px) {
  .nf-hero-visual {
    grid-template-columns: 1fr;
    gap: 18px;
  }

  .nf-tv-wrap {
    justify-content: flex-start;
  }

  .nf-tv {
    width: 240px;
  }

  .nf-tv-screen {
    height: 190px;
  }
}

@media (max-width: 650px) {
  .nf-page {
    padding: 34px 20px;
  }

  .nf-error-code {
    letter-spacing: -7px;
  }

  h1 {
    letter-spacing: -1.8px;
  }

  .nf-actions {
    flex-direction: column;
  }

  .nf-actions button {
    width: 100%;
  }

  .nf-diag-badge {
    display: none;
  }

  .nf-row {
    align-items: flex-start;
    padding: 16px 0;
  }
}
</style>
