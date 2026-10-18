import { formatPluginError } from './pluginErrors.js'

const DEFAULT_SUBTITLE_ERROR = 'Could not fetch this subtitle.'

export async function subtitleFileErrorMessage(error) {
  const data = error?.response?.data
  if (data && typeof data.text === 'function') {
    try {
      const text = await data.text()
      if (text) {
        try {
          const body = JSON.parse(text)
          const message = formatPluginError(body)
          if (message) return message
        } catch {
          // Non-JSON error bodies are intentionally kept generic.
        }
      }
    } catch {
      // Fall through to the generic message when the error body cannot be read.
    }
    return DEFAULT_SUBTITLE_ERROR
  }

  return formatPluginError(error, DEFAULT_SUBTITLE_ERROR) || DEFAULT_SUBTITLE_ERROR
}
