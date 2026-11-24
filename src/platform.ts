// Device/platform checks shared by the UI.

/** Primary input is a finger (phones, tablets). */
export const isTouchDevice = () => matchMedia('(pointer: coarse)').matches

/** iPhone / iPad (iPadOS reports itself as a Mac, but with touch points). */
export function isIOS(): boolean {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

/** Running as an installed home-screen app rather than in a browser tab. */
export function isStandalone(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    matchMedia('(display-mode: standalone)').matches
}
