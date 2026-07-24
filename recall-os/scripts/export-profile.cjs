const fs = require('node:fs/promises')
const { spawn, spawnSync } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')

const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local')
const installRoot = path.join(localAppData, 'RecallOS')
const projectDirectory = path.resolve(__dirname, '..')
const recoveryDirectory = path.join(projectDirectory, 'recovery')
const recoveryDate = new Date().toISOString().slice(0, 10)
const recoveryFile = path.join(recoveryDirectory, `study-data-exported-${recoveryDate}.json`)
const debugPort = 9343
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

function versionParts(name) {
  return name
    .replace(/^app-/, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0)
}

function compareVersionDirectories(left, right) {
  const leftParts = versionParts(left)
  const rightParts = versionParts(right)
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0)
    if (difference) return difference
  }
  return 0
}

function plainTextToRichHtml(value) {
  const escaped = String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
    .replace(/\r\n?/g, '\n')
    .replaceAll('\n', '<br>')
  return `<p>${escaped}</p>`
}

function migrateQuestion(question) {
  const reviewCount = Number.isFinite(question.reviewCount) ? question.reviewCount : 0
  const reviewHistory = Array.isArray(question.reviewHistory)
    ? question.reviewHistory
    : reviewCount > 0 && question.lastReviewed && question.nextReviewDate
      ? [
          {
            reviewedAt: question.lastReviewed,
            level: question.level,
            nextReviewDate: question.nextReviewDate,
          },
        ]
      : []
  return {
    ...question,
    question:
      question.contentVersion === 1
        ? question.question
        : plainTextToRichHtml(question.question),
    answer:
      question.contentVersion === 1
        ? question.answer
        : plainTextToRichHtml(question.answer),
    reviewHistory,
    contentVersion: 1,
  }
}

async function findInstalledExecutable() {
  const entries = await fs.readdir(installRoot, { withFileTypes: true })
  const versionDirectories = entries
    .filter((entry) => entry.isDirectory() && /^app-\d/.test(entry.name))
    .map((entry) => entry.name)
    .sort(compareVersionDirectories)
    .reverse()

  for (const directory of versionDirectories) {
    const executable = path.join(installRoot, directory, 'RecallOS.exe')
    try {
      await fs.access(executable)
      return executable
    } catch {
      // Continue to an older installed version.
    }
  }
  throw new Error('No installed Recall OS executable was found.')
}

async function findPage() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
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
  throw new Error('Recall OS did not expose its profile in time.')
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
  return result.result.value
}

async function main() {
  const installedExecutable = await findInstalledExecutable()
  const desktopProcess = spawn(
    installedExecutable,
    [`--remote-debugging-port=${debugPort}`],
    { stdio: 'ignore' },
  )

  try {
    const page = await findPage()
    await delay(400)
    const profile = await evaluate(
      page.webSocketDebuggerUrl,
      `(() => ({
        questions: JSON.parse(localStorage.getItem('active-recall.questions.v1') || '[]'),
        courses: JSON.parse(localStorage.getItem('active-recall.courses.v1') || '[]'),
        activityDates: JSON.parse(localStorage.getItem('active-recall.activity-dates.v1') || '[]'),
      }))()`,
    )
    const questions = Array.isArray(profile.questions)
      ? profile.questions.map(migrateQuestion)
      : []
    if (!questions.length) {
      throw new Error('The installed profile contains no questions; refusing to overwrite a backup.')
    }
    const backup = {
      version: 4,
      exportedAt: new Date().toISOString(),
      source: installedExecutable,
      courses: Array.isArray(profile.courses) ? profile.courses : [],
      questions,
      activityDates: Array.isArray(profile.activityDates) ? profile.activityDates : [],
    }
    await fs.mkdir(recoveryDirectory, { recursive: true })
    await fs.writeFile(recoveryFile, `${JSON.stringify(backup, null, 2)}\n`, 'utf8')
    console.log(
      JSON.stringify(
        {
          recoveryFile,
          installedExecutable,
          questionCount: questions.length,
          courseCount: backup.courses.length,
          totalAttempts: questions.reduce(
            (total, question) => total + (Number(question.reviewCount) || 0),
            0,
          ),
          richContentQuestions: questions.filter(
            (question) => question.contentVersion === 1,
          ).length,
        },
        null,
        2,
      ),
    )
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
