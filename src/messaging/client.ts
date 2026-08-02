import { fail } from './protocol'
import type {
  ContentRequest,
  ContentResponseMap,
  ContentToBackground,
  ContentToBackgroundResponseMap,
  JiraRequest,
  JiraResponseMap,
  PopupQuery,
  PopupQueryResponseMap,
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

export function queryBackground<Q extends PopupQuery>(
  query: Q,
): Promise<Result<PopupQueryResponseMap[Q['type']]>> {
  return send(() => chrome.runtime.sendMessage(query))
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

export function callJira<R extends JiraRequest>(
  request: R,
): Promise<Result<JiraResponseMap[R['type']]>> {
  return send(() => chrome.runtime.sendMessage(request))
}
