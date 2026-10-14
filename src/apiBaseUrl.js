export function configuredApiBaseUrl(value) {
  const configured = typeof value === 'string' ? value.trim() : ''
  return configured || '/'
}
