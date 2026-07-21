const fs = require('node:fs/promises')
const { spawn, spawnSync } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')

const projectDirectory = path.resolve(__dirname, '..')
const appVersion = require(path.join(projectDirectory, 'package.json')).version
const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local')
const installedExecutable = path.join(
  localAppData,
  'RecallOS',
  `app-${appVersion}`,
  'RecallOS.exe',
)
const recoveryDirectory = path.join(projectDirectory, 'recovery')
const debugPort = 9342
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function findRecoveryFile() {
  const requestedFile = process.argv.slice(2).find((argument) => argument.endsWith('.json'))
  if (requestedFile) return path.resolve(requestedFile)

  const files = await fs.readdir(recoveryDirectory)
  const recoveryFiles = files
    .filter((file) => file.startsWith('study-data-recovered-') && file.endsWith('.json'))
    .sort()

  const latestFile = recoveryFiles.at(-1)
  if (!latestFile) {
    throw new Error('No recovered study-data JSON file was found.')
  }
  return path.join(recoveryDirectory, latestFile)
}

async function findPage() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json`)
      const pages = await response.json()
      const page = pages.find((candidate) => candidate.url?.startsWith('recall://desktop/'))
      if (page) return page
    } catch {
      // The debugging endpoint is not ready yet.
    }
    await delay(200)
  }
  throw new Error('Recall OS did not expose its desktop page in time.')
}

async function evaluate(webSocketUrl, expression) {
  const socket = new WebSocket(webSocketUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })

  const result = await new Promise((resolve, reject) => {
    socket.addEventListener(
      'message',
      (event) => {
        const message = JSON.parse(event.data)
        if (message.error) reject(new Error(message.error.message))
        else resolve(message.result)
      },
      { once: true },
    )
    socket.send(
      JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression, returnByValue: true },
      }),
    )
  })

  socket.close()
  return result
}

async function main() {
  const recoveryFile = await findRecoveryFile()
  const recoveryText = await fs.readFile(recoveryFile, 'utf8')
  const recovery = JSON.parse(recoveryText)
  if (!Array.isArray(recovery.questions) || recovery.questions.length === 0) {
    throw new Error('The recovery backup has no questions; refusing to restore it.')
  }

  const desktopProcess = spawn(
    installedExecutable,
    [`--remote-debugging-port=${debugPort}`],
    { stdio: 'ignore' },
  )

  try {
    const page = await findPage()
    await delay(400)
    await evaluate(
      page.webSocketDebuggerUrl,
      `(() => {
        const settingsButton = [...document.querySelectorAll('button')]
          .find((button) => button.textContent.includes('Settings'));
        settingsButton?.click();
        return Boolean(settingsButton);
      })()`,
    )
    await delay(400)
    await evaluate(
      page.webSocketDebuggerUrl,
      `(() => {
        const input = document.querySelector('input[type="file"]');
        if (!input) throw new Error('Recall OS import input was not found.');
        const transfer = new DataTransfer();
        transfer.items.add(new File([${JSON.stringify(recoveryText)}], 'study_data.json', {
          type: 'application/json',
        }));
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`,
    )
    await delay(1200)
    const result = await evaluate(
      page.webSocketDebuggerUrl,
      `(() => {
        setTimeout(() => window.close(), 250);
        return {
          questions: JSON.parse(localStorage.getItem('active-recall.questions.v1') || '[]').length,
          courses: JSON.parse(localStorage.getItem('active-recall.courses.v1') || '[]'),
          importSucceeded: document.body.innerText.includes('imported successfully'),
        };
      })()`,
    )
    console.log(JSON.stringify(result.result.value, null, 2))
    await delay(2500)
  } finally {
    if (desktopProcess.exitCode === null) {
      spawnSync('taskkill.exe', ['/PID', String(desktopProcess.pid), '/T', '/F'], {
        stdio: 'ignore',
      })
    }
    if (!desktopProcess.killed) desktopProcess.kill()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
