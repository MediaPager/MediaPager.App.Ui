const TRACK_LOADED = 2
const TRACK_ERROR = 3

export function waitForSubtitleTrackLoad(trackElement, timeoutMs = 2000) {
  if (!trackElement || typeof trackElement.addEventListener !== 'function')
    return Promise.resolve(false)
  if (trackElement.readyState === TRACK_LOADED) return Promise.resolve(true)
  if (trackElement.readyState === TRACK_ERROR) return Promise.resolve(false)

  return new Promise((resolve) => {
    let settled = false
    let timeoutId

    const finish = (loaded) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      trackElement.removeEventListener?.('load', onLoad)
      trackElement.removeEventListener?.('error', onError)
      resolve(loaded)
    }
    const onLoad = () => finish(true)
    const onError = () => finish(false)

    trackElement.addEventListener('load', onLoad)
    trackElement.addEventListener('error', onError)

    if (!settled) {
      if (trackElement.readyState === TRACK_LOADED) finish(true)
      else if (trackElement.readyState === TRACK_ERROR) finish(false)
      else {
        timeoutId = setTimeout(() => finish(trackElement.readyState === TRACK_LOADED), timeoutMs)
      }
    }
  })
}
