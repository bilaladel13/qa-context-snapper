export interface QaseCredentials {
  apiToken: string
  projectCode: string
}

export interface QaseConnection {
  projectCode: string
  projectTitle: string | null
  hasToken: boolean
}

export interface QaseProject {
  code: string
  title: string
}

export interface QaseStep {
  action: string
  data?: string | null
  expected_result?: string | null
}

export interface QaseSuite {
  id: number
  title: string
  description?: string | null
  parent_id?: number | null
}

export interface QaseCase {
  id: number
  title: string
  suite_id?: number | null
  preconditions?: string | null
  steps?: QaseStep[]
}

export interface QaseCreateCasePayload {
  title: string
  suite_id?: number | null
  preconditions?: string
  steps_type?: 'classic'
  steps?: QaseStep[]
  severity?: number
  priority?: number
}

export interface QaseUpdateCasePayload {
  title?: string
  suite_id?: number | null
  preconditions?: string
  steps_type?: 'classic'
  steps?: QaseStep[]
}

export interface QaseRun {
  id: number
  title: string
  status: number
  status_text?: string
}

export type QaseRunStatus = 'passed' | 'failed' | 'blocked'

export interface QaseSubmitResultPayload {
  case_id: number
  status: QaseRunStatus
  time_ms?: number
  comment?: string
  defect?: boolean
}

export interface QaseSyncDraft {
  mode: 'create' | 'existing'
  caseId?: number
  suiteId?: number | null
  title?: string
  updateSteps?: boolean
  status: QaseRunStatus
  comment?: string
}

export interface QaseSyncResult {
  caseId: number
  caseCode: string
  caseTitle: string
  runId: number
  runTitle: string
  status: QaseRunStatus
  warning?: string
}
