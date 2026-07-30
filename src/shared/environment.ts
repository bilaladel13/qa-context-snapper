import type { ClientEnvironment, EnvironmentSnapshot, PageInfo } from '@/types'

interface HighEntropyValues {
  platform?: string
  platformVersion?: string
  uaFullVersion?: string
}

interface UserAgentBrand {
  brand: string
  version: string
}

interface UserAgentData {
  brands?: UserAgentBrand[]
  platform?: string
  getHighEntropyValues?: (hints: string[]) => Promise<HighEntropyValues>
}

const BRAND_PRIORITY = ['Microsoft Edge', 'Opera', 'Brave', 'Vivaldi', 'Google Chrome', 'Chromium']

const UA_BROWSERS: [string, RegExp][] = [
  ['Microsoft Edge', /Edg\/([\d.]+)/],
  ['Opera', /OPR\/([\d.]+)/],
  ['Firefox', /Firefox\/([\d.]+)/],
  ['Google Chrome', /Chrome\/([\d.]+)/],
  ['Safari', /Version\/([\d.]+).*Safari/],
]

function userAgentData(): UserAgentData | undefined {
  return (navigator as Navigator & { userAgentData?: UserAgentData }).userAgentData
}

function pickBrand(brands: UserAgentBrand[]): UserAgentBrand | undefined {
  const real = brands.filter((entry) => !/not.?a.?brand/i.test(entry.brand))

  for (const preferred of BRAND_PRIORITY) {
    const match = real.find((entry) => entry.brand === preferred)
    if (match) {
      return match
    }
  }

  return real[0]
}

function browserFromUserAgent(): { browser: string; browserVersion: string } {
  for (const [browser, pattern] of UA_BROWSERS) {
    const match = navigator.userAgent.match(pattern)
    if (match) {
      return { browser, browserVersion: match[1] ?? 'unknown' }
    }
  }

  return { browser: 'Unknown', browserVersion: 'unknown' }
}

function osFromUserAgent(): string {
  const ua = navigator.userAgent

  if (/Windows NT 10/.test(ua)) return 'Windows 10 or 11'
  if (/Windows NT 6.3/.test(ua)) return 'Windows 8.1'
  if (/Mac OS X ([\d_]+)/.test(ua)) {
    return `macOS ${(ua.match(/Mac OS X ([\d_]+)/)?.[1] ?? '').replace(/_/g, '.')}`.trim()
  }
  if (/Android ([\d.]+)/.test(ua)) return `Android ${ua.match(/Android ([\d.]+)/)?.[1]}`
  if (/(iPhone|iPad)/.test(ua)) return 'iOS'
  if (/CrOS/.test(ua)) return 'ChromeOS'
  if (/Linux/.test(ua)) return 'Linux'

  return 'Unknown'
}

function formatOs(platform: string, platformVersion: string): string {
  const major = Number.parseInt(platformVersion.split('.')[0] ?? '', 10)

  if (platform === 'Windows') {
    if (!Number.isFinite(major)) return 'Windows'
    return major >= 13 ? 'Windows 11' : 'Windows 10'
  }

  if (platform === 'macOS') {
    return platformVersion ? `macOS ${platformVersion}` : 'macOS'
  }

  return platformVersion ? `${platform} ${platformVersion}` : platform
}

// Everything here describes the browser itself, so it is identical whether it
// runs in the popup or in a page. The popup uses it to show environment data
// immediately, without needing to reach into a tab.
export async function detectClient(): Promise<ClientEnvironment> {
  const data = userAgentData()
  const brand = data?.brands ? pickBrand(data.brands) : undefined

  let browser = brand?.brand ?? 'Unknown'
  let browserVersion = brand?.version ?? 'unknown'
  let os = 'Unknown'

  if (data?.getHighEntropyValues) {
    try {
      const high = await data.getHighEntropyValues(['platform', 'platformVersion', 'uaFullVersion'])

      if (high.uaFullVersion) {
        browserVersion = high.uaFullVersion
      }
      if (high.platform) {
        os = formatOs(high.platform, high.platformVersion ?? '')
      }
    } catch {
      os = 'Unknown'
    }
  }

  if (browser === 'Unknown') {
    const parsed = browserFromUserAgent()
    browser = parsed.browser
    browserVersion = parsed.browserVersion
  }

  if (os === 'Unknown') {
    os = data?.platform ? formatOs(data.platform, '') : osFromUserAgent()
  }

  return {
    browser,
    browserVersion,
    os,
    screenSize: `${window.screen.width}x${window.screen.height}`,
    devicePixelRatio: window.devicePixelRatio,
    language: navigator.language,
    userAgent: navigator.userAgent,
  }
}

export function readPageInfo(): PageInfo {
  return {
    pageUrl: location.href,
    pageTitle: document.title,
    viewportSize: `${window.innerWidth}x${window.innerHeight}`,
  }
}

export function composeEnvironment(client: ClientEnvironment, page: PageInfo): EnvironmentSnapshot {
  return { ...client, ...page, capturedAt: new Date().toISOString() }
}

export async function captureEnvironment(): Promise<EnvironmentSnapshot> {
  return composeEnvironment(await detectClient(), readPageInfo())
}
