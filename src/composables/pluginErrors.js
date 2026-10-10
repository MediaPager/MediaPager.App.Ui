export function formatPluginError(value, fallback = '') {
  const body = value?.response?.data ?? value
  const pluginError = body?.pluginError
    ?? (body?.code && body?.message ? body : null)
  const message = pluginError?.message
    ?? body?.detail
    ?? (typeof body?.error === 'string' ? body.error : null)
    ?? body?.message
    ?? value?.message
    ?? fallback
  const remediation = pluginError?.remediation
  return [message, remediation].filter(Boolean).join(' ')
}
