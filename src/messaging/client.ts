import { fail } from './protocol'
import type {
  ContentRequest,
  ContentResponseMap,
  ContentToBackground,
  ContentToBackgroundResponseMap,
  PopupRequest,
  PopupResponse,
  Result,
} from './protocol'

function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return typeof error === 'string' ? error : 'Unknown messaging error'
}

async function send<T>(dispatch: () => Promise<unknown>): Promise<Result<T>> {
  try {
    const response = await dispatch()

    if (response === undefined) {
      return fail('No response from the extension. Try reloading the page under test.')
    }

    return response as Result<T>
  } catch (error) {
    return fail(describe(error))
  }
}

export function sendToBackground(request: PopupRequest): Promise<PopupResponse> {
  return send(() => chrome.runtime.sendMessage(request))
}

export function sendToTab<R extends ContentRequest>(
  tabId: number,
  request: R,
): Promise<Result<ContentResponseMap[R['type']]>> {
  return send(() => chrome.tabs.sendMessage(tabId, request))
}

export function reportToBackground<R extends ContentToBackground>(
  request: R,
): Promise<Result<ContentToBackgroundResponseMap[R['type']]>> {
  return send(() => chrome.runtime.sendMessage(request))
}
