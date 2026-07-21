const { spawn, spawnSync } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')

const projectDirectory = path.resolve(__dirname, '..')
const appVersion = require(path.join(projectDirectory, 'package.json')).version
const verifyPackagedApp = process.argv.includes('--packaged')
const verifyInstalledApp = process.argv.includes('--installed')
const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local')
const electronExecutable = verifyInstalledApp
  ? path.join(localAppData, 'RecallOS', `app-${appVersion}`, 'RecallOS.exe')
  : verifyPackagedApp
    ? path.join(projectDirectory, 'signed-out', 'RecallOS-win32-x64', 'RecallOS.exe')
    : require('electron')
const debugPort = 9341

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function findPage() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json`)
      const pages = await response.json()
      const recallPage = pages.find((page) => page.url?.startsWith('recall://desktop/'))
      if (recallPage) return recallPage
    } catch {
      // The debugging endpoint is not ready yet.
    }
    await delay(200)
  }
  throw new Error('Recall OS did not expose a healthy desktop page in time.')
}

async function connectToPage(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })

  let messageId = 0
  const pendingMessages = new Map()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    const pending = pendingMessages.get(message.id)
    if (!pending) return
    pendingMessages.delete(message.id)
    if (message.error) pending.reject(new Error(message.error.message))
    else pending.resolve(message.result)
  })

  const evaluate = (expression) =>
    new Promise((resolve, reject) => {
      messageId += 1
      pendingMessages.set(messageId, { resolve, reject })
      socket.send(
        JSON.stringify({
          id: messageId,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true },
        }),
      )
    })

  return { socket, evaluate }
}

async function main() {
  const desktopProcess = spawn(
    electronExecutable,
    verifyPackagedApp || verifyInstalledApp
      ? [`--remote-debugging-port=${debugPort}`]
      : [`--remote-debugging-port=${debugPort}`, projectDirectory],
    { stdio: 'ignore' },
  )

  try {
    const page = await findPage()
    const { socket, evaluate } = await connectToPage(page.webSocketDebuggerUrl)
    await delay(500)

    const storageResult = await evaluate(`(() => {
      const questions = JSON.parse(localStorage.getItem('active-recall.questions.v1') || '[]');
      const courses = JSON.parse(localStorage.getItem('active-recall.courses.v1') || '[]');
      return {
        title: document.title,
        questionCount: questions.length,
        courses,
        questionCourses: [...new Set(questions.map((question) => question.course))],
      };
    })()`)

    await evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent.includes('Question Bank'));
      button?.click();
    })()`)
    await delay(300)
    await evaluate(`document.querySelector('section[aria-label="Questions"] article > button')?.click()`)
    await delay(300)
    const editorResult = await evaluate(`(() => {
      const editButton = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === 'Edit');
      const editAvailable = Boolean(editButton);
      editButton?.click();
      return editAvailable;
    })()`)
    await delay(300)
    const modalResult = await evaluate(`(() => ({
      editModalOpen: Boolean(document.querySelector('#question-editor-title')),
      courseOptionCount: document.querySelector('[role="dialog"] select')?.options.length || 0,
    }))()`)
    await evaluate(`document.querySelector('[aria-label="Close question editor"]')?.click()`)
    await delay(200)
    await evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent.includes('Settings'));
      button?.click();
    })()`)
    await delay(300)
    const courseManagerResult = await evaluate(`(() => ({
      visible: document.body.innerText.includes('Course manager'),
      addButtonVisible: [...document.querySelectorAll('button')].some((item) => item.textContent.trim() === 'Add course'),
      ownershipVisible: document.body.innerText.includes('Karabo Goodwill Nkambule'),
      versionVisible: document.body.innerText.includes('Version ${appVersion}'),
    }))()`)

    socket.close()
    console.log(
      JSON.stringify(
        {
          page: { title: page.title, url: page.url },
          storage: storageResult.result.value,
          editAvailable: editorResult.result.value,
          editor: modalResult.result.value,
          courseManager: courseManagerResult.result.value,
        },
        null,
        2,
      ),
    )
  } finally {
    spawnSync('taskkill.exe', ['/PID', String(desktopProcess.pid), '/T', '/F'], {
      stdio: 'ignore',
    })
    if (!desktopProcess.killed) desktopProcess.kill()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
