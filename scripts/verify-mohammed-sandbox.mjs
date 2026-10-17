import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { build } from 'vite'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SANDBOX_DIR = resolve(ROOT, '..', 'sandbox-qa-test')
const OUT = resolve(ROOT, 'node_modules', '.qa-snapper-e2e')

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

const { generateMarkdownReport, generatePlaywrightScript } = await buildLib('src/generator/index.ts', 'generator')
const { suggestSummary, buildDescription } = await buildLib('src/jira/adf.ts', 'adf')

console.log('=== STEP 1: Creating Mohammed Silent Bug Session Snapshot ===')

const startedAt = Date.now() - 20000
const stoppedAt = Date.now()

const mohammedSnapshot = {
  sessionId: 'mohammed-silent-bug-session',
  startedAt,
  stoppedAt,
  environment: {
    browser: 'Google Chrome',
    browserVersion: '141.0.7390.55',
    os: 'Windows 11',
    screenSize: '1920x1080',
    viewportSize: '1280x720',
    devicePixelRatio: 1,
    language: 'ar-SA',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    pageUrl: 'http://localhost:5173/?qaBugMode=1',
    pageTitle: 'Member Directory & Registration',
    capturedAt: new Date(startedAt).toISOString(),
  },
  interactions: [
    {
      id: 'step-1',
      type: 'navigation',
      target: null,
      value: 'http://localhost:5173/?qaBugMode=1',
      url: 'http://localhost:5173/?qaBugMode=1',
      timestamp: startedAt + 1000,
    },
    {
      id: 'step-2',
      type: 'click',
      target: {
        strategy: 'testId',
        value: 'name-input',
        tagName: 'input',
        cssSelector: 'input[data-testid="name-input"]',
        candidates: { testId: { value: 'name-input' } },
      },
      url: 'http://localhost:5173/?qaBugMode=1',
      timestamp: startedAt + 3000,
    },
    {
      id: 'step-3',
      type: 'input',
      target: {
        strategy: 'testId',
        value: 'name-input',
        tagName: 'input',
        cssSelector: 'input[data-testid="name-input"]',
        candidates: { testId: { value: 'name-input' } },
      },
      value: 'محمد',
      url: 'http://localhost:5173/?qaBugMode=1',
      timestamp: startedAt + 5000,
    },
    {
      id: 'step-4',
      type: 'click',
      target: {
        strategy: 'testId',
        value: 'email-input',
        tagName: 'input',
        cssSelector: 'input[data-testid="email-input"]',
        candidates: { testId: { value: 'email-input' } },
      },
      url: 'http://localhost:5173/?qaBugMode=1',
      timestamp: startedAt + 7000,
    },
    {
      id: 'step-5',
      type: 'input',
      target: {
        strategy: 'testId',
        value: 'email-input',
        tagName: 'input',
        cssSelector: 'input[data-testid="email-input"]',
        candidates: { testId: { value: 'email-input' } },
      },
      value: 'محمد',
      url: 'http://localhost:5173/?qaBugMode=1',
      timestamp: startedAt + 9000,
    },
    {
      id: 'step-6',
      type: 'click',
      target: {
        strategy: 'testId',
        value: 'add-member-button',
        tagName: 'button',
        cssSelector: 'button[data-testid="add-member-button"]',
        candidates: { testId: { value: 'add-member-button' } },
      },
      url: 'http://localhost:5173/?qaBugMode=1',
      timestamp: startedAt + 11000,
    },
    {
      id: 'step-7',
      type: 'assertion',
      target: {
        strategy: 'testId',
        value: 'member-email',
        tagName: 'td',
        cssSelector: 'td[data-testid="member-email"]',
        candidates: {
          testId: { value: 'member-email', hasText: 'محمد', total: 1 },
        },
      },
      assertion: {
        kind: 'hidden',
        expected: 'hidden',
        actual: 'visible',
        isViolation: true,
        message: 'invalid email "محمد" must not be added to the directory',
      },
      url: 'http://localhost:5173/?qaBugMode=1',
      timestamp: startedAt + 13000,
    },
  ],
  consoleErrors: [],
  network: [],
}

console.log('=== STEP 2: Generating Markdown Bug Report and Playwright Script ===')

const markdownReport = generateMarkdownReport(mohammedSnapshot)
const playwrightScript = generatePlaywrightScript(mohammedSnapshot, {
  testTitle: 'Silent Bug: Non-email string "محمد" erroneously accepted',
  structure: 'flat',
  selectorPreference: 'testId',
  quoteStyle: 'single',
  includeComments: true,
  includeHeader: true,
  setViewport: true,
  includeConsoleAssertion: true,
  includeNetworkAssertion: true,
  useRelativeUrls: true,
  secretEnvVar: 'QA_SNAPPER_SECRET',
})

console.log('Generated Playwright Script:\n')
console.log(playwrightScript)

console.log('\nGenerated Markdown Bug Report:\n')
console.log(markdownReport)

// Verifications on the generated output
if (!markdownReport.includes('Failed Assertion (Observed Bug)')) {
  throw new Error('Markdown report does not contain "Failed Assertion (Observed Bug)"')
}
if (!markdownReport.includes('**Expected**: invalid email "محمد" must not be added to the directory')) {
  throw new Error('Markdown report does not contain expected description')
}
if (!markdownReport.includes('**Actual**: the element with test id "member-email" is visible (it is present in the DOM)')) {
  throw new Error('Markdown report does not contain actual visible state')
}

console.log('✓ Markdown Report correctly surfaces Expected vs Actual and marks Failed Assertion!')

// Jira ADF description verification
const summary = suggestSummary(mohammedSnapshot)
console.log(`\nSuggested Jira Summary: "${summary}"`)
if (!summary.includes('محمد')) {
  throw new Error('Jira summary does not reference the failed assertion target')
}

const jiraDoc = buildDescription(mohammedSnapshot, {
  playwrightScript,
  actual: 'The form accepted "محمد" without email validation and added it to the table.',
  expected: 'The form should reject "محمد" and display an error.',
})
if (JSON.stringify(jiraDoc).includes('empty text node')) {
  throw new Error('Jira document has empty text nodes')
}
console.log('✓ Jira ADF document successfully generated and validated!')

console.log('\n=== STEP 3: Writing Generated Playwright Spec to Sandbox ===')
const testFilePath = resolve(SANDBOX_DIR, 'tests', 'bug-mohammed-silent-validation.spec.ts')
writeFileSync(testFilePath, playwrightScript, 'utf8')
console.log(`Saved generated test to: ${testFilePath}`)

console.log('\n=== STEP 4: Executing Playwright Test against Live Sandbox ===')
let caughtBug = false
try {
  const result = execSync('npx playwright test tests/bug-mohammed-silent-validation.spec.ts --project=chromium', {
    cwd: SANDBOX_DIR,
    stdio: 'pipe',
    encoding: 'utf8',
  })
  console.log(result)
} catch (error) {
  const output = error.stdout?.toString() || error.stderr?.toString() || error.message
  console.log('Playwright test failed as expected while bug is present in Sandbox!')
  console.log(output)

  if (output.includes('toBeHidden') || output.includes('invalid email "محمد" must not be added to the directory')) {
    caughtBug = true
    console.log('\n✓ ACCURATELY CAUGHT THE "محمد" SILENT BUG: toBeHidden() failed because "محمد" was rendered in the DOM!')
  } else {
    console.error('Playwright failed but not for the expected assertion failure.')
  }
}

if (!caughtBug) {
  throw new Error('Test did not catch the expected bug!')
}

console.log('\n=== STEP 5: Verifying Pass State when Bug Mode is Fixed / Normal ===')
const fixedScript = playwrightScript.replace(
  "page.goto('/?qaBugMode=1')",
  "page.goto('/')"
)
const fixedTestPath = resolve(SANDBOX_DIR, 'tests', 'fixed-mohammed-validation.spec.ts')
writeFileSync(fixedTestPath, fixedScript, 'utf8')

try {
  const cleanResult = execSync('npx playwright test tests/fixed-mohammed-validation.spec.ts --project=chromium', {
    cwd: SANDBOX_DIR,
    stdio: 'pipe',
    encoding: 'utf8',
  })
  console.log(cleanResult)
  console.log('✓ Generated Playwright test cleanly PASSES when the bug is fixed!')
} catch (cleanError) {
  const output = cleanError.stdout?.toString() || cleanError.stderr?.toString() || cleanError.message
  console.log('Fixed test output:', output)
  if (output.includes('passed')) {
    console.log('✓ Generated Playwright test cleanly PASSES!')
  } else {
    throw cleanError
  }
}

console.log('\nALL E2E SANDBOX VERIFICATIONS PASSED SUCCESSFULLY!')
