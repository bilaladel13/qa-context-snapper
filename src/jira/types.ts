export interface JiraCredentials {
  domain: string
  email: string
  token: string
}

export interface JiraIssueType {
  id: string
  name: string
  subtask: boolean
}

export interface JiraProject {
  id: string
  key: string
  name: string
  issueTypes: JiraIssueType[]
}

// The token is never part of this. The popup only ever learns that one exists.
export interface JiraConnection {
  domain: string
  email: string
  accountName: string | null
  hasToken: boolean
}

export interface JiraCreatedIssue {
  key: string
  url: string
}

export interface JiraDraft {
  summary: string
  projectKey: string
  issueTypeId: string
}
