export function externalPluginUiUrl(uiUrl) {
  const value = uiUrl?.trim()
  if (!/^https?:\/\//i.test(value ?? '')) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : 'about:blank'
  } catch {
    return 'about:blank'
  }
}

export function buildPluginUiUrl(pluginKey, uiUrl, apiOrigin) {
  const external = externalPluginUiUrl(uiUrl)
  if (external !== null) return external
  const base = `${apiOrigin}/plugins/${encodeURIComponent(pluginKey)}/ui/`
  return uiUrl ? base + uiUrl.replace(/^\//, '') : base
}

export function validatePluginUiApiRequest(message, pluginKey) {
  if (!message || typeof message.method !== 'string' || typeof message.url !== 'string' || message.url.length > 2048)
    return null
  const method = message.method.toUpperCase()
  if (!['GET', 'PUT', 'POST'].includes(method)) return null

  let url
  try { url = new URL(message.url, 'https://plugin-bridge.invalid') } catch { return null }
  if (url.origin !== 'https://plugin-bridge.invalid' || url.search || url.hash) return null

  const ownKey = encodeURIComponent(pluginKey)
  const settingsPath = `/plugins/${ownKey}/settings`
  const ownActionPrefix = `/plugins/${ownKey}/actions/`
  const isSettingsRequest = url.pathname === settingsPath && ['GET', 'PUT'].includes(method)
  const isDownloadsCatalogList = pluginKey === 'mediapager.actions.downloads' &&
    method === 'GET' && url.pathname === '/catalogs'
  const actionId = url.pathname.startsWith(ownActionPrefix)
    ? url.pathname.slice(ownActionPrefix.length)
    : ''
  const isOwnAction = method === 'POST' && /^[a-zA-Z0-9._-]{1,128}$/.test(actionId)
  if (!isSettingsRequest && !isDownloadsCatalogList && !isOwnAction) return null

  if (message.body != null) {
    if (method === 'GET' || typeof message.body !== 'object' || Array.isArray(message.body)) return null
    const prototype = Object.getPrototypeOf(message.body)
    if (prototype !== Object.prototype && prototype !== null) return null
  }
  let body
  try { body = message.body == null ? undefined : JSON.stringify(message.body) } catch { return null }
  if (body && body.length > 64 * 1024) return null
  if (isDownloadsCatalogList) return { method, path: url.pathname, body, catalogList: true }
  return { method, path: url.pathname, body }
}
