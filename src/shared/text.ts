import { MAX_TEXT_LENGTH } from './constants'

export function collapse(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim()
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}...` : text
}

// Captures longer than the limit are stored with a trailing ellipsis that would
// never match the real text. A shorter value ending in "..." is genuine content.
export function trimEllipsis(value: string): string {
  return value.length >= MAX_TEXT_LENGTH && value.endsWith('...')
    ? value.slice(0, -3).trimEnd()
    : value
}

// Mirrors Playwright's default matching for getByText, getByLabel,
// getByPlaceholder and the getByRole name option: whitespace normalized,
// case insensitive, substring rather than whole string.
export function looseMatches(haystack: string | null | undefined, needle: string): boolean {
  const target = collapse(needle).toLowerCase()
  return target.length > 0 && collapse(haystack).toLowerCase().includes(target)
}
