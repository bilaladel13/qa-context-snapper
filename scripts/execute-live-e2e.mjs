import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'vite'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'node_modules', '.qa-snapper-live')

async function buildLib(entry, fileName) {
  await build({
    root: ROOT,
    configFile: false,
    logLevel: 'error',
    build: {
      outDir: resolve(OUT, fileName),
      emptyOutDir: true,
      minify: false,
      lib: { entry: resolve(ROOT, entry), formats: ['es'], fileName: () => `${fileName}.js` },
    },
    resolve: { alias: { '@': resolve(ROOT, 'src') } },
  })

  return import(pathToFileURL(resolve(OUT, fileName, `${fileName}.js`)).href)
}

const {
  verifyProject,
  listCases,
  createCase,
  updateCaseSteps,
  ensureActiveRun,
  submitRunResult,
  mapSnapshotToSteps,
  formatPreconditions,
  detectRunStatus,
} = await buildLib('src/qase/api.ts', 'api')

const credentials = {
  apiToken: process.env.QASE_API_TOKEN || process.env.VITE_DEFAULT_QASE_TOKEN || '<YOUR_API_TOKEN>',
  projectCode: process.env.QASE_PROJECT_CODE || process.env.VITE_DEFAULT_QASE_PROJECT || 'SQA',
}

console.log('--- Step 0: Connecting and Verifying Live Qase Workspace ---')
const projectRes = await verifyProject(credentials)
if (!projectRes.ok) {
  console.error('Failed to verify project:', projectRes.error)
  process.exit(1)
}
console.log(`✓ Connected to Qase Project: [${projectRes.data.code}] ${projectRes.data.title}`)

const runRes = await ensureActiveRun(credentials, 'Sprint 1 - Staging Verification', [1, 2, 3, 4, 5])
if (!runRes.ok) {
  console.error('Failed to get or create active run:', runRes.error)
  process.exit(1)
}
const activeRun = runRes.data
console.log(`✓ Active Test Run: [ID: ${activeRun.id}] "${activeRun.title}" (Status: ${activeRun.status_text})`)

// ==========================================
// WORKFLOW 3: Update Existing Case Steps + Fail Result for SQA-3
// ==========================================
console.log('\n--- Step 1: Workflow 3 (Update SQA-3 Steps + Submit Failed Result) ---')
const now = Date.now()
const snapshotSQA3 = {
  sessionId: 'live-sqa-3-failure',
  startedAt: now - 5000,
  stoppedAt: now,
  qaseCaseCode: 'SQA-3',
  environment: {
    browser: 'Google Chrome',
    browserVersion: '141.0.7390.55',
    os: 'Windows 11',
    screenSize: '1920x1080',
    viewportSize: '1280x720',
    devicePixelRatio: 1,
    language: 'ar-SA,en-US',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    pageUrl: 'https://staging.example.com/employee-directory',
    pageTitle: 'Employee Directory & Validation',
    capturedAt: new Date(now - 5000).toISOString(),
  },
  interactions: [
    {
      id: 'step-nav',
      type: 'navigation',
      target: null,
      value: 'https://staging.example.com/employee-directory',
      url: 'https://staging.example.com/employee-directory',
      timestamp: now - 4500,
    },
    {
      id: 'step-name',
      type: 'input',
      target: {
        strategy: 'css',
        value: '#employee-name',
        tagName: 'input',
        cssSelector: 'input#employee-name',
        candidates: { css: { value: 'input#employee-name' } },
      },
      value: 'محمد خالد',
      url: 'https://staging.example.com/employee-directory',
      timestamp: now - 3500,
    },
    {
      id: 'step-email',
      type: 'input',
      target: {
        strategy: 'css',
        value: '#employee-email',
        tagName: 'input',
        cssSelector: 'input#employee-email',
        candidates: { css: { value: 'input#employee-email' } },
      },
      value: 'محمد',
      url: 'https://staging.example.com/employee-directory',
      timestamp: now - 2500,
    },
    {
      id: 'step-submit',
      type: 'click',
      target: {
        strategy: 'role',
        value: 'button',
        tagName: 'button',
        cssSelector: 'button#btn-add-member',
        candidates: { role: { value: 'button' } },
      },
      url: 'https://staging.example.com/employee-directory',
      timestamp: now - 1500,
    },
    {
      id: 'step-assertion',
      type: 'assertion',
      target: {
        strategy: 'css',
        value: '.member-entry[data-email="محمد"]',
        tagName: 'div',
        cssSelector: '.member-entry[data-email="محمد"]',
        candidates: { css: { value: '.member-entry[data-email="محمد"]' } },
      },
      url: 'https://staging.example.com/employee-directory',
      timestamp: now - 500,
      assertion: {
        kind: 'hidden',
        expectedValue: 'hidden',
        actualValue: 'visible',
        isViolation: true,
        message: 'Reject invalid email without domain format (e.g. "محمد") and ensure entry remains hidden from directory',
      },
    },
  ],
  consoleErrors: [
    {
      id: 'err-1',
      level: 'error',
      origin: 'console',
      message: 'Uncaught ValidationError: Value "محمد" is not a valid email address (missing domain format)',
      source: 'https://staging.example.com/static/validation.js',
      lineNumber: 88,
      timestamp: now - 1200,
    },
  ],
}

const sqa3Steps = mapSnapshotToSteps(snapshotSQA3)
const sqa3Preconditions = formatPreconditions(snapshotSQA3)

console.log(`Updating SQA-3 steps (${sqa3Steps.length} recorded steps)...`)
const updateRes = await updateCaseSteps(credentials, 3, {
  preconditions: sqa3Preconditions,
  steps: sqa3Steps,
})
if (!updateRes.ok) {
  console.error('Failed to update SQA-3 steps:', updateRes.error)
  process.exit(1)
}
console.log('✓ Successfully updated SQA-3 test steps in Qase!')

const detectedStatusSQA3 = detectRunStatus(snapshotSQA3)
console.log(`Detected run status for SQA-3: "${detectedStatusSQA3}" (as expected due to assertion violation)`)

const submitSQA3 = await submitRunResult(credentials, activeRun.id, {
  case_id: 3,
  status: detectedStatusSQA3,
  time_ms: 4500,
  comment: 'Automated test execution from QA Context Snapper: Found assertion violation and console error when entering invalid email "محمد".',
  defect: true,
})
if (!submitSQA3.ok) {
  console.error('Failed to submit SQA-3 result:', submitSQA3.error)
  process.exit(1)
}
console.log(`✓ Submitted result for SQA-3 into Run ID ${activeRun.id}: [Status: ${detectedStatusSQA3.toUpperCase()}]`)

// ==========================================
// WORKFLOW 2: Mark Existing Case SQA-1 as Passed
// ==========================================
console.log('\n--- Step 2: Workflow 2 (Mark Existing Case SQA-1 as Passed) ---')
const submitSQA1 = await submitRunResult(credentials, activeRun.id, {
  case_id: 1,
  status: 'passed',
  time_ms: 1820,
  comment: 'Verified with QA Context Snapper: Valid employee creation succeeded with valid email "jane.doe@example.com".',
  defect: false,
})
if (!submitSQA1.ok) {
  console.error('Failed to submit SQA-1 result:', submitSQA1.error)
  process.exit(1)
}
console.log(`✓ Submitted result for SQA-1 into Run ID ${activeRun.id}: [Status: PASSED]`)

// ==========================================
// WORKFLOW 1: Create Brand New Test Case from Recording & Log Result
// ==========================================
console.log('\n--- Step 3: Workflow 1 (Create Brand New Case from Recording) ---')
const newCaseTitle = '[Recorded via QA Snapper] Auto-generated E2E Validation'
const newCaseSnapshot = {
  sessionId: 'live-new-case',
  startedAt: now - 3000,
  stoppedAt: now,
  environment: {
    browser: 'Google Chrome',
    browserVersion: '141.0.7390.55',
    os: 'Windows 11',
    screenSize: '1920x1080',
    viewportSize: '1280x720',
    devicePixelRatio: 1,
    language: 'en-US',
    userAgent: 'Mozilla/5.0',
    pageUrl: 'https://staging.example.com/employee-directory',
    pageTitle: 'Employee Directory & Validation',
    capturedAt: new Date(now - 3000).toISOString(),
  },
  interactions: [
    {
      id: 'step-nav',
      type: 'navigation',
      target: null,
      value: 'https://staging.example.com/employee-directory',
      url: 'https://staging.example.com/employee-directory',
      timestamp: now - 2800,
    },
    {
      id: 'step-filter',
      type: 'input',
      target: {
        strategy: 'css',
        value: '#search-filter',
        tagName: 'input',
        cssSelector: 'input#search-filter',
        candidates: { css: { value: 'input#search-filter' } },
      },
      value: 'QA Engineering',
      url: 'https://staging.example.com/employee-directory',
      timestamp: now - 1800,
    },
    {
      id: 'step-click-apply',
      type: 'click',
      target: {
        strategy: 'role',
        value: 'button',
        tagName: 'button',
        cssSelector: 'button#btn-apply-filter',
        candidates: { role: { value: 'button' } },
      },
      url: 'https://staging.example.com/employee-directory',
      timestamp: now - 800,
    },
  ],
  consoleErrors: [],
}

const newCaseSteps = mapSnapshotToSteps(newCaseSnapshot)
const newCasePreconditions = formatPreconditions(newCaseSnapshot)

console.log(`Creating new test case "${newCaseTitle}"...`)
const createRes = await createCase(credentials, {
  title: newCaseTitle,
  preconditions: newCasePreconditions,
  steps_type: 'classic',
  steps: newCaseSteps,
  priority: 1, // High
  severity: 2, // Major
})
if (!createRes.ok) {
  console.error('Failed to create new case:', createRes.error)
  process.exit(1)
}
const createdCaseId = createRes.data.id
console.log(`✓ Successfully created Test Case SQA-${createdCaseId} in Qase!`)

console.log(`Logging passed result for SQA-${createdCaseId} in Run ID ${activeRun.id}...`)
const submitNewRes = await submitRunResult(credentials, activeRun.id, {
  case_id: createdCaseId,
  status: 'passed',
  time_ms: 2150,
  comment: 'Automated initial test run for newly generated case from QA Context Snapper session.',
  defect: false,
})
if (!submitNewRes.ok) {
  console.error(`Failed to submit result for SQA-${createdCaseId}:`, submitNewRes.error)
  process.exit(1)
}
console.log(`✓ Submitted result for SQA-${createdCaseId} into Run ID ${activeRun.id}: [Status: PASSED]`)

console.log('\n==========================================')
console.log('🎉 ALL 3 WORKFLOWS COMPLETED LIVE AGAINST QASE!')
console.log('==========================================')
console.log(`- Project Code: SQA`)
console.log(`- Run ID: ${activeRun.id} ("${activeRun.title}")`)
console.log(`- SQA-3: Steps updated with recorded actions + Status marked FAILED`)
console.log(`- SQA-1: Status marked PASSED`)
console.log(`- SQA-${createdCaseId}: Created brand new test case + Status marked PASSED`)
console.log('==========================================\n')
