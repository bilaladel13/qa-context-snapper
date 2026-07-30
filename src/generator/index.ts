import type { ContextSnapshot, GeneratedReport } from '@/types'
import { generateMarkdownReport } from './generateMarkdownReport'
import { generatePlaywrightScript } from './generatePlaywrightScript'

export function generateReport(snapshot: ContextSnapshot): GeneratedReport {
  return {
    markdown: generateMarkdownReport(snapshot),
    playwrightScript: generatePlaywrightScript(snapshot),
  }
}

export { generateMarkdownReport, generatePlaywrightScript }
