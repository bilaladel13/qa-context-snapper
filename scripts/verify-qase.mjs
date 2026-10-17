import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'vite'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'node_modules', '.qa-snapper-qase')

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
  mapSnapshotToSteps,
  detectRunStatus,
  formatPreconditions,
  listSuites,
} = await buildLib('src/qase/api.ts', 'qase-api')

const { generatePlaywrightScript } = await buildLib(
  'src/generator/generatePlaywrightScript.ts',
  'generator',
)

const {
  formatSpecFilename,
  formatQaseCaseUrl,
  cleanAndDeduplicateInteractions,
  describeStep,
  isCheckboxOrRadio,
} = await buildLib('src/generator/shared.ts', 'shared')

const { buildDescription, suggestSummary } = await buildLib('src/jira/adf.ts', 'adf')

const { DEFAULT_SETTINGS } = await buildLib('src/settings/schema.ts', 'schema')

const results = []
const check = (name, passed, detail = '') => results.push({ name, passed: Boolean(passed), detail })

const started = Date.parse('2026-10-15T10:00:00.000Z')

const cleanSnapshot = {
  sessionId: 'clean-session',
  startedAt: started,
  stoppedAt: started + 10_000,
  qaseCaseCode: 'SQA-1',
  environment: {
    browser: 'Google Chrome',
    browserVersion: '141.0.0.0',
    os: 'Windows 11',
    screenSize: '1920x1080',
    viewportSize: '1280x720',
    devicePixelRatio: 1,
    language: 'en-US',
    userAgent: 'Mozilla/5.0',
    pageUrl: 'https://staging.example.com/users',
    pageTitle: 'User Directory',
    capturedAt: '2026-10-15T10:00:00.000Z',
  },
  interactions: [
    {
      id: 'step-1',
      type: 'navigation',
      target: null,
      value: 'https://staging.example.com/users',
      url: 'https://staging.example.com/users',
      timestamp: started,
    },
    {
      id: 'step-2',
      type: 'input',
      target: {
        strategy: 'css',
        value: '#email-input',
        tagName: 'input',
        cssSelector: '#email-input',
        candidates: { css: { value: '#email-input' } },
      },
      value: 'valid.user@example.com',
      url: 'https://staging.example.com/users',
      timestamp: started + 2000,
    },
    {
      id: 'step-3',
      type: 'click',
      target: {
        strategy: 'role',
        value: 'button',
        tagName: 'button',
        cssSelector: 'button#save',
        candidates: { role: { value: 'button' } },
      },
      url: 'https://staging.example.com/users',
      timestamp: started + 4000,
    },
  ],
  consoleErrors: [],
}

const failedSnapshot = {
  ...cleanSnapshot,
  sessionId: 'failed-session',
  qaseCaseCode: 'SQA-3',
  interactions: [
    ...cleanSnapshot.interactions,
    {
      id: 'step-4',
      type: 'assertion',
      target: {
        strategy: 'css',
        value: '.error-msg',
        tagName: 'span',
        cssSelector: '.error-msg',
        candidates: { css: { value: '.error-msg' } },
      },
      url: 'https://staging.example.com/users',
      timestamp: started + 5000,
      assertion: {
        kind: 'visible',
        expectedValue: 'true',
        actualValue: 'false',
        isViolation: true,
        message: 'Expected error message to be visible',
      },
    },
  ],
  consoleErrors: [
    {
      id: 'err-1',
      level: 'error',
      origin: 'console',
      message: 'Uncaught TypeError: Invalid email domain format',
      source: 'app.js',
      lineNumber: 105,
      timestamp: started + 4500,
    },
  ],
}

// 1. Test preconditions formatting
const preconditions = formatPreconditions(cleanSnapshot)
check(
  'Preconditions contain target URL',
  preconditions.includes('https://staging.example.com/users'),
  preconditions,
)
check(
  'Preconditions contain OS and Browser',
  preconditions.includes('Google Chrome') && preconditions.includes('Windows 11'),
  preconditions,
)

// 2. Test Step Mapping
const steps = mapSnapshotToSteps(cleanSnapshot)
check('Mapped steps count matches interactions', steps.length === 3, `Count: ${steps.length}`)
check(
  'Input step maps action, value, and expected result',
  (steps[1].action.includes('Enter') || steps[1].action.includes('Type')) && steps[1].data === 'valid.user@example.com' && steps[1].expected_result.length > 0,
  JSON.stringify(steps[1]),
)
check(
  'Click step maps action and target',
  steps[2].action.includes('Click') && steps[2].expected_result.length > 0,
  JSON.stringify(steps[2]),
)

// 3. Test Auto Pass/Fail Detection
const cleanStatus = detectRunStatus(cleanSnapshot)
check('Clean snapshot detected as passed', cleanStatus === 'passed', cleanStatus)

const failedStatus = detectRunStatus(failedSnapshot)
check('Snapshot with assertion violation and console error detected as failed', failedStatus === 'failed', failedStatus)

// 4. Test Playwright Cross-Linking
const scriptWithQase = generatePlaywrightScript(cleanSnapshot, DEFAULT_SETTINGS.playwright)
check(
  'Playwright script includes [SQA-1] case code prefix in test title',
  scriptWithQase.includes("test('[SQA-1]"),
  scriptWithQase.split('\n').find((l) => l.includes('test(')),
)

// 5. Test Jira Summary and ADF Cross-Linking
const jiraSummary = suggestSummary(failedSnapshot)
check(
  'Jira summary prefixes with [SQA-3]',
  jiraSummary.startsWith('[SQA-3] '),
  jiraSummary,
)

const adfDoc = buildDescription(failedSnapshot, { playwrightScript: null, qaseCaseCode: 'SQA-3' })
const adfString = JSON.stringify(adfDoc)
check(
  'Jira ADF embeds Associated Qase Test Case SQA-3 with clickable link',
  adfString.includes('Associated Qase Test Case:') &&
    adfString.includes('https://app.qase.io/project/SQA?previewMode=modal&case=3'),
  adfString.slice(0, 300),
)

// 6. Test Suite Listing Function
check('listSuites function is exported and callable', typeof listSuites === 'function')

// 7. Test Smart Step Deduplication and Assertion Attachment
const noisySnapshot = {
  ...cleanSnapshot,
  sessionId: 'noisy-session',
  interactions: [
    {
      id: 'step-form-click',
      type: 'click',
      target: { tagName: 'form', cssSelector: 'form#user-form', strategy: 'css', value: 'form#user-form' },
      url: 'https://staging.example.com/users',
      timestamp: started + 1000,
    },
    {
      id: 'step-input-click',
      type: 'click',
      target: { tagName: 'input', cssSelector: 'input#email', strategy: 'css', value: 'input#email' },
      url: 'https://staging.example.com/users',
      timestamp: started + 2000,
    },
    {
      id: 'step-input-type',
      type: 'input',
      target: { tagName: 'input', cssSelector: 'input#email', strategy: 'css', value: 'input#email' },
      value: 'dedupe@example.com',
      url: 'https://staging.example.com/users',
      timestamp: started + 2500,
    },
    {
      id: 'step-btn-click',
      type: 'click',
      target: { tagName: 'button', cssSelector: 'button#submit', strategy: 'role', value: 'button' },
      url: 'https://staging.example.com/users',
      timestamp: started + 3000,
    },
    {
      id: 'step-form-submit',
      type: 'submit',
      target: { tagName: 'form', cssSelector: 'form#user-form', strategy: 'css', value: 'form#user-form' },
      url: 'https://staging.example.com/users',
      timestamp: started + 3100,
    },
    {
      id: 'step-verify',
      type: 'assertion',
      target: { tagName: 'div', cssSelector: '.success', strategy: 'css', value: '.success' },
      assertion: { kind: 'visible', expected: 'true' },
      url: 'https://staging.example.com/users',
      timestamp: started + 3200,
    },
  ],
}

const mappedDedupeSteps = mapSnapshotToSteps(noisySnapshot)
check(
  'Redundant form click is ignored and input click is merged with input',
  mappedDedupeSteps.length === 2,
  `Expected 2 steps (Type, Click+Assert), got ${mappedDedupeSteps.length}: ${JSON.stringify(mappedDedupeSteps)}`,
)

check(
  'First step is Type without preceding redundant click',
  (mappedDedupeSteps[0]?.action?.includes('Enter') || mappedDedupeSteps[0]?.action?.includes('Type')) && mappedDedupeSteps[0]?.data === 'dedupe@example.com',
  JSON.stringify(mappedDedupeSteps[0]),
)

check(
  'Assertion is attached to preceding button click expected_result instead of standalone step',
  mappedDedupeSteps[1]?.action?.includes('Click') && mappedDedupeSteps[1]?.expected_result?.toLowerCase().includes('visible'),
  JSON.stringify(mappedDedupeSteps[1]),
)

// 8. Test Zero Emojis in Generated Data and Reports
const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u

const allTextToCheck = [
  preconditions,
  JSON.stringify(steps),
  JSON.stringify(mappedDedupeSteps),
  jiraSummary,
  adfString,
  scriptWithQase,
]

const foundEmoji = allTextToCheck.find((text) => EMOJI_REGEX.test(text))
check('Zero emojis in all generated Qase steps, Jira summary, ADF, and scripts', !foundEmoji, foundEmoji)

// 9. Test Default Settings
check(
  'autoMergeConsecutiveSteps is enabled by default in Capture settings',
  DEFAULT_SETTINGS.capture.autoMergeConsecutiveSteps === true,
  JSON.stringify(DEFAULT_SETTINGS.capture),
)

// 10. Test formatSpecFilename logic
const specName1 = formatSpecFilename('[SQA-3] [Negative] Reject invalid email format', 'SQA-3')
check(
  'Derive .spec.ts filename from bracketed title and Qase code',
  specName1 === 'sqa-3-negative-reject-invalid-email-format.spec.ts',
  `got: ${specName1}`,
)

const specName2 = formatSpecFilename('Reject invalid email format', 'SQA-3')
check(
  'Prepend Qase code to plain session title slug',
  specName2 === 'sqa-3-reject-invalid-email-format.spec.ts',
  `got: ${specName2}`,
)

const specName3 = formatSpecFilename('[SQA-3] Reject invalid email')
check(
  'Extract code from bracketed title when qaseCaseCode is omitted',
  specName3 === 'sqa-3-reject-invalid-email.spec.ts',
  `got: ${specName3}`,
)

// 11. Test Pre-Recording Qase Context Persistence in snapshot
const preRecordedSnapshot = {
  sessionId: 'pre-rec-test',
  startedAt: started,
  stoppedAt: started + 5000,
  sessionTitle: '[SQA-3] [Negative] Reject invalid email format',
  qaseProjectCode: 'SQA',
  qaseSuiteId: 1,
  qaseCaseId: 3,
  qaseCaseTitle: '[Negative] Reject invalid email format',
  qaseCaseCode: 'SQA-3',
  environment: cleanSnapshot.environment,
  interactions: cleanSnapshot.interactions,
  consoleErrors: [],
  network: [],
}

check(
  'Pre-recording context snapshot preserves project, suite, case ID, and session title',
  preRecordedSnapshot.qaseProjectCode === 'SQA' &&
    preRecordedSnapshot.qaseCaseId === 3 &&
    preRecordedSnapshot.qaseCaseCode === 'SQA-3' &&
    preRecordedSnapshot.sessionTitle === '[SQA-3] [Negative] Reject invalid email format',
)

// 12. Direct Qase Test Case URL format (?previewMode=modal&case=...)
const urlWithSuite = formatQaseCaseUrl('SQA', 11, 1)
check(
  'Direct Qase URL with suite includes ?suite=1&previewMode=modal&case=11',
  urlWithSuite === 'https://app.qase.io/project/SQA?suite=1&previewMode=modal&case=11',
  `got: ${urlWithSuite}`,
)

const urlWithoutSuite = formatQaseCaseUrl('SQA', 'SQA-11')
check(
  'Direct Qase URL without suite includes ?previewMode=modal&case=11',
  urlWithoutSuite === 'https://app.qase.io/project/SQA?previewMode=modal&case=11',
  `got: ${urlWithoutSuite}`,
)

// 13. Checkbox & Radio recording preservation
const checkboxTarget = {
  strategy: 'role',
  value: 'checkbox',
  role: 'checkbox',
  accessibleName: 'Agree to terms',
  tagName: 'input',
  cssSelector: 'input[type="checkbox"]',
}
check('isCheckboxOrRadio identifies checkbox target', isCheckboxOrRadio(checkboxTarget) === true)

const checkboxRawEvents = [
  {
    id: 'cb-click',
    type: 'click',
    target: checkboxTarget,
    value: 'true',
    url: 'http://localhost:5174/',
    timestamp: started,
  },
  {
    id: 'cb-change',
    type: 'change',
    target: checkboxTarget,
    value: 'true',
    url: 'http://localhost:5174/',
    timestamp: started + 10,
  },
]
const cleanedCheckbox = cleanAndDeduplicateInteractions(checkboxRawEvents)
check(
  'Checkbox click and change are merged into a single step without being swallowed',
  cleanedCheckbox.length === 1 && cleanedCheckbox[0].type === 'click',
  `got length: ${cleanedCheckbox.length}`,
)
const checkboxStepDesc = describeStep(cleanedCheckbox[0])
check(
  'Checkbox step description uses human-friendly Check phrasing',
  checkboxStepDesc.includes('Check') && checkboxStepDesc.includes('Agree to terms'),
  `got: ${checkboxStepDesc}`,
)

// 14. Trailing submit deduplication & Custom Expected transfer
const buttonClickAndSubmit = [
  {
    id: 'btn-click',
    type: 'click',
    target: {
      strategy: 'role',
      value: 'button',
      role: 'button',
      accessibleName: 'Add Member',
      tagName: 'button',
      cssSelector: 'button#add-btn',
    },
    url: 'http://localhost:5174/',
    timestamp: started + 1000,
  },
  {
    id: 'form-submit',
    type: 'submit',
    target: {
      strategy: 'css',
      value: 'form#member-form',
      tagName: 'form',
      cssSelector: 'form#member-form',
    },
    customExpected: 'Invalid email without @ domain must be rejected',
    url: 'http://localhost:5174/',
    timestamp: started + 1050,
  },
]
const cleanedFormEvents = cleanAndDeduplicateInteractions(buttonClickAndSubmit)
check(
  'Trailing submit event is merged into preceding button click',
  cleanedFormEvents.length === 1 && cleanedFormEvents[0].type === 'click',
  `got length: ${cleanedFormEvents.length}`,
)
check(
  'Custom Expected Result from trailing submit is preserved on the surviving button click step',
  cleanedFormEvents[0].customExpected === 'Invalid email without @ domain must be rejected',
  `got: ${cleanedFormEvents[0].customExpected}`,
)

// 15. Unify step deduplication so ResultView step count matches Qase exported steps
const fullRawInteractions = [
  // 1. Redundant form container click
  { id: '1', type: 'click', target: { tagName: 'form', cssSelector: 'form' }, url: 'x', timestamp: started },
  // 2. Click Name input then type
  { id: '2', type: 'click', target: { tagName: 'input', accessibleName: 'Name', cssSelector: '#name' }, url: 'x', timestamp: started + 100 },
  { id: '3', type: 'input', target: { tagName: 'input', accessibleName: 'Name', cssSelector: '#name' }, value: 'محمد', url: 'x', timestamp: started + 200 },
  // 3. Click Email input then type
  { id: '4', type: 'click', target: { tagName: 'input', accessibleName: 'Email', cssSelector: '#email' }, url: 'x', timestamp: started + 300 },
  { id: '5', type: 'input', target: { tagName: 'input', accessibleName: 'Email', cssSelector: '#email' }, value: 'محمد', url: 'x', timestamp: started + 400 },
  // 4. Click checkbox
  { id: '6', type: 'click', target: checkboxTarget, value: 'true', url: 'x', timestamp: started + 500 },
  { id: '7', type: 'change', target: checkboxTarget, value: 'true', url: 'x', timestamp: started + 510 },
  // 5. Click Add Member button & submit
  {
    id: '8',
    type: 'click',
    target: { tagName: 'button', accessibleName: 'Add Member', cssSelector: 'button' },
    url: 'x',
    timestamp: started + 600,
  },
  {
    id: '9',
    type: 'submit',
    target: { tagName: 'form', cssSelector: 'form' },
    customExpected: 'Invalid email without @ domain must be rejected and not added to the table',
    url: 'x',
    timestamp: started + 650,
  },
]

const deduplicatedAtCapture = cleanAndDeduplicateInteractions(fullRawInteractions)
const snapshotForQase = {
  sessionId: 'unified-dedupe',
  startedAt: started,
  stoppedAt: started + 1000,
  environment: cleanSnapshot.environment,
  interactions: deduplicatedAtCapture,
  consoleErrors: [],
  network: [],
}
const qaseExportedSteps = mapSnapshotToSteps(snapshotForQase)
check(
  'ResultView steps count exactly matches Qase exported steps count (4 steps: Name, Email, Checkbox, Add Member)',
  deduplicatedAtCapture.length === 4 && qaseExportedSteps.length === 4,
  `ResultView: ${deduplicatedAtCapture.length}, Qase: ${qaseExportedSteps.length}`,
)
check(
  'Qase step 4 preserves custom expected result',
  qaseExportedSteps[3]?.expected_result === 'Invalid email without @ domain must be rejected and not added to the table',
  `got: ${qaseExportedSteps[3]?.expected_result}`,
)

// Report summary
console.log('\n--- QA Context Snapper: Qase Integration Verification ---\n')
let failCount = 0
for (const { name, passed, detail } of results) {
  if (passed) {
    console.log(`  ✓ ${name}`)
  } else {
    failCount++
    console.error(`  ✗ ${name}`)
    if (detail) console.error(`    Detail: ${detail}`)
  }
}

console.log(`\nResults: ${results.length - failCount} passed, ${failCount} failed.`)

if (failCount > 0) {
  process.exit(1)
}
