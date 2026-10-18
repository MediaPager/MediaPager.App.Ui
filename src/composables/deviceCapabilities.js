export function detectTouchDevice({ hoverNone, platform = '', userAgent = '', maxTouchPoints = 0 }) {
  const touchPoints = Number(maxTouchPoints) || 0
  const device = `${platform} ${userAgent}`
  const iosDevice = /iPhone|iPad|iPod/i.test(device)
  const ipadDesktopMode = platform === 'MacIntel' && touchPoints > 1
  const androidDevice = /Android/i.test(userAgent) && touchPoints > 0

  return Boolean(hoverNone || iosDevice || ipadDesktopMode || androidDevice)
}
