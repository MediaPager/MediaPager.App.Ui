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
  if (url.origin !== 'https://plugin-bridge.invalid' || url.hash) return null

  const ownKey = encodeURIComponent(pluginKey)
  const settingsPath = `/plugins/${ownKey}/settings`
  const ownActionPrefix = `/plugins/${ownKey}/actions/`
  const ownAgentPrefix = `/plugins/${ownKey}/agents/`
  const ownDataPrefix = `/plugins/${ownKey}/data/`
  const ownSourcesPrefix = `/plugins/${ownKey}/sources/`
  const isSettingsPath = url.pathname === settingsPath && ['GET', 'PUT'].includes(method)
  const agentRunId = url.pathname.startsWith(ownAgentPrefix)
    ? url.pathname.slice(ownAgentPrefix.length).match(/^([a-zA-Z0-9._-]{1,128})\/run$/)?.[1] ?? null
    : null
  const isOwnAgentRun = method === 'POST' && agentRunId !== null
  const isCatalogList = method === 'GET' && url.pathname === '/catalogs'
  const dataPath = url.pathname.startsWith(ownDataPrefix)
    ? url.pathname.slice(ownDataPrefix.length)
    : ''
  const isPluginDataRequest = method === 'GET' && /^public\.[a-z0-9][a-z0-9._-]{0,63}$/i.test(dataPath)
  const dataRecordMatch = dataPath.match(/^(public\.[a-z0-9][a-z0-9._-]{0,63})\/([^/]{1,256})$/i)
  const isPluginDataRecordRequest = method === 'GET' && dataRecordMatch !== null && !/%2f|%5c/i.test(dataRecordMatch[2])
  const sourcePath = url.pathname.startsWith(ownSourcesPrefix)
    ? url.pathname.slice(ownSourcesPrefix.length)
    : ''
  const sourceBrowseMatch = sourcePath.match(/^([a-zA-Z0-9._-]{1,128})\/browse$/)
  const sourceDetailsMatch = sourcePath.match(/^([a-zA-Z0-9._-]{1,128})\/details\/([^/]{1,256})$/)
  const isPluginSourceBrowse = method === 'GET' && sourceBrowseMatch !== null
  const isPluginSourceDetails = method === 'GET' && sourceDetailsMatch !== null && !/%2f|%5c/i.test(sourceDetailsMatch[2])
  const actionId = url.pathname.startsWith(ownActionPrefix)
    ? url.pathname.slice(ownActionPrefix.length)
    : ''
  const isOwnAction = method === 'POST' && /^[a-zA-Z0-9._-]{1,128}$/.test(actionId)
  if (!isSettingsPath && !isOwnAgentRun && !isCatalogList && !isPluginDataRequest && !isPluginDataRecordRequest &&
      !isPluginSourceBrowse && !isPluginSourceDetails && !isOwnAction) return null

  const queryEntries = [...url.searchParams.entries()]
  if (isPluginDataRequest) {
    if (queryEntries.some(([key]) => !['offset', 'limit'].includes(key)) ||
        queryEntries.some(([key], index) => queryEntries.findIndex(([candidate]) => candidate === key) !== index))
      return null
    const offset = url.searchParams.get('offset')
    const limit = url.searchParams.get('limit')
    if (offset != null && (!/^\d{1,7}$/.test(offset) || Number(offset) > 1_000_000)) return null
    if (limit != null && (!/^\d{1,3}$/.test(limit) || Number(limit) < 1 || Number(limit) > 500)) return null
  } else if (isPluginSourceBrowse) {
    if (queryEntries.some(([key]) => !['query', 'page'].includes(key)) ||
        queryEntries.some(([key], index) => queryEntries.findIndex(([candidate]) => candidate === key) !== index))
      return null
    const query = url.searchParams.get('query')
    const page = url.searchParams.get('page')
    if (query != null && query.length > 512) return null
    if (page != null && (!/^\d{1,6}$/.test(page) || Number(page) < 1)) return null
  } else if (queryEntries.length > 0) {
    return null
  }

  if (isOwnAgentRun && message.body != null) return null
  if (message.body != null) {
    if (method === 'GET' || typeof message.body !== 'object' || Array.isArray(message.body)) return null
    const prototype = Object.getPrototypeOf(message.body)
    if (prototype !== Object.prototype && prototype !== null) return null
  }
  let body
  try { body = message.body == null ? undefined : JSON.stringify(message.body) } catch { return null }
  if (body && body.length > 64 * 1024) return null
  const path = `${url.pathname}${url.search}`
  if (isCatalogList) return { method, path, body, catalogList: true }
  if (isPluginDataRequest || isPluginDataRecordRequest) return { method, path, body, pluginData: true }
  if (isPluginSourceBrowse) return { method, path, body, pluginSourceBrowse: true }
  if (isPluginSourceDetails) return { method, path, body, pluginSourceDetails: true }
  return { method, path, body }
}
