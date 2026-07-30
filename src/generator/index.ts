import { DEFAULT_SETTINGS } from '@/settings/schema'
import type { Settings } from '@/settings/schema'
import type { ContextSnapshot, GeneratedReport } from '@/types'
import { generateMarkdownReport } from './generateMarkdownReport'
import { generatePlaywrightScript } from './generatePlaywrightScript'

export function generateReport(
  snapshot: ContextSnapshot,
  settings: Settings = DEFAULT_SETTINGS,
): GeneratedReport {
  return {
    markdown: generateMarkdownReport(snapshot),
    playwrightScript: generatePlaywrightScript(snapshot, settings.playwright),
  }
}

export { generateMarkdownReport, generatePlaywrightScript }
