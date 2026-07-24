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
        richContentMigrated: questions.every((question) => question.contentVersion === 1),
      };
    })()`)
    if (
      storageResult.result.value.questionCount > 0 &&
      !storageResult.result.value.richContentMigrated
    ) {
      throw new Error('Existing questions were not migrated to rich-content format.')
    }

    const practiceTargetResult = await evaluate(`(() => {
      const questions = JSON.parse(localStorage.getItem('active-recall.questions.v1') || '[]');
      const now = new Date();
      const today = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
      ].join('-');
      const dueQuestions = questions
        .filter((question) => question.nextReviewDate <= today)
        .sort((left, right) =>
          left.nextReviewDate.localeCompare(right.nextReviewDate) ||
          left.addedAt.localeCompare(right.addedAt) ||
          left.id.localeCompare(right.id));
      const target = dueQuestions[0] || questions[0];
      if (!target) return { available: false };
      const courseButton = [...document.querySelectorAll('button')]
        .find((button) => button.textContent.trim() === target.course);
      courseButton?.click();
      return {
        available: true,
        hasDueQuestion: dueQuestions.length > 0,
        course: target.course,
        chapter: target.chapter,
        subchapter: target.subchapter,
      };
    })()`)
    await delay(300)

    const practiceTarget = practiceTargetResult.result.value
    let practiceResult = { available: false }
    if (practiceTarget.available) {
      const modeResult = await evaluate(`(() => {
        const modes = [...document.querySelectorAll('[data-practice-mode]')];
        const challengeButton = document.querySelector('[data-practice-mode="challenge"]');
        challengeButton?.click();
        return {
          modeCount: modes.length,
          scheduledVisible: Boolean(document.querySelector('[data-practice-mode="scheduled"]')),
          retakeVisible: Boolean(document.querySelector('[data-practice-mode="retake"]')),
          challengeVisible: Boolean(challengeButton),
        };
      })()`)
      await delay(250)
      const challengeResult = await evaluate(`(() => {
        const questions = JSON.parse(localStorage.getItem('active-recall.questions.v1') || '[]');
        const startButton = document.querySelector('[data-testid="start-practice-session"]');
        return {
          challengeStartEnabled: Boolean(startButton && !startButton.disabled),
          challengeIncludesAllQuestions: startButton?.textContent.includes(String(questions.length)) || false,
        };
      })()`)
      await evaluate(`document.querySelector('[data-practice-mode="scheduled"]')?.click()`)
      await delay(250)
      await evaluate(`(() => {
        const chapterSelect = document.querySelector('[aria-label="Choose practice chapter"]');
        const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
        setValue.call(chapterSelect, ${JSON.stringify(practiceTarget.chapter)});
        chapterSelect.dispatchEvent(new Event('input', { bubbles: true }));
        chapterSelect.dispatchEvent(new Event('change', { bubbles: true }));
      })()`)
      await delay(250)
      await evaluate(`(() => {
        const subchapterSelect = document.querySelector('[aria-label="Choose practice subchapter"]');
        const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
        setValue.call(subchapterSelect, ${JSON.stringify(practiceTarget.subchapter)});
        subchapterSelect.dispatchEvent(new Event('input', { bubbles: true }));
        subchapterSelect.dispatchEvent(new Event('change', { bubbles: true }));
      })()`)
      await delay(300)
      const scopeResult = await evaluate(`(() => {
        const questions = JSON.parse(localStorage.getItem('active-recall.questions.v1') || '[]');
        const now = new Date();
        const today = [
          now.getFullYear(),
          String(now.getMonth() + 1).padStart(2, '0'),
          String(now.getDate()).padStart(2, '0'),
        ].join('-');
        const scopedDue = questions
          .filter((question) =>
            question.course === ${JSON.stringify(practiceTarget.course)} &&
            question.chapter === ${JSON.stringify(practiceTarget.chapter)} &&
            question.subchapter === ${JSON.stringify(practiceTarget.subchapter)} &&
            question.nextReviewDate <= today)
          .sort((left, right) =>
            left.nextReviewDate.localeCompare(right.nextReviewDate) ||
            left.addedAt.localeCompare(right.addedAt) ||
            left.id.localeCompare(right.id));
        const toPlainText = (value) => {
          const template = document.createElement('template');
          template.innerHTML = value;
          template.content.querySelectorAll('[data-equation]').forEach((element) => {
            element.replaceWith(' ' + (element.getAttribute('data-equation') || 'equation') + ' ');
          });
          template.content.querySelectorAll('img').forEach((element) => {
            element.replaceWith(' ' + (element.getAttribute('alt') || 'Study image') + ' ');
          });
          return (template.content.textContent || '').replace(/\\s+/g, ' ').trim();
        };
        const startButton = document.querySelector('[data-testid="start-practice-session"]');
        const result = {
          available: true,
          chapterSelectorVisible: Boolean(document.querySelector('[aria-label="Choose practice chapter"]')),
          subchapterSelectorVisible: Boolean(document.querySelector('[aria-label="Choose practice subchapter"]')),
          chapterProgressVisible: Boolean(document.querySelector('[data-scope-progress="chapter"]')),
          subchapterProgressVisible: Boolean(document.querySelector('[data-scope-progress="subchapter"]')),
          startEnabled: Boolean(startButton && !startButton.disabled),
          expectedFirstQuestion: scopedDue[0] ? toPlainText(scopedDue[0].question) : null,
        };
        if (scopedDue.length) startButton?.click();
        return result;
      })()`)
      await delay(350)
      const cardResult = await evaluate(`(() => ({
        displayedFirstQuestion: document.querySelector('[data-testid="practice-question"]')?.textContent?.replace(/\\s+/g, ' ').trim() || null,
      }))()`)
      practiceResult = {
        ...modeResult.result.value,
        ...challengeResult.result.value,
        ...scopeResult.result.value,
        ...cardResult.result.value,
      }

      if (
        !practiceResult.chapterSelectorVisible ||
        !practiceResult.subchapterSelectorVisible ||
        !practiceResult.chapterProgressVisible ||
        !practiceResult.subchapterProgressVisible ||
        practiceResult.modeCount !== 3 ||
        !practiceResult.retakeVisible ||
        !practiceResult.challengeVisible ||
        !practiceResult.challengeStartEnabled ||
        !practiceResult.challengeIncludesAllQuestions ||
        (practiceTarget.hasDueQuestion &&
          practiceResult.displayedFirstQuestion !== practiceResult.expectedFirstQuestion)
      ) {
        throw new Error(`Daily Practice hierarchy verification failed: ${JSON.stringify(practiceResult)}`)
      }
    }

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
      richEditorCount: document.querySelectorAll('[role="dialog"] [contenteditable="true"]').length,
      boldButtonCount: document.querySelectorAll('[role="dialog"] [aria-label="Bold"]').length,
      italicButtonCount: document.querySelectorAll('[role="dialog"] [aria-label="Italic"]').length,
      underlineButtonCount: document.querySelectorAll('[role="dialog"] [aria-label="Underline"]').length,
      listButtonCount: document.querySelectorAll('[role="dialog"] [aria-label="Bulleted list"]').length,
      indentButtonCount: document.querySelectorAll('[role="dialog"] [aria-label="Increase indent"]').length,
      equationButtonCount: document.querySelectorAll('[role="dialog"] [aria-label="Insert equation"]').length,
      imageButtonCount: document.querySelectorAll('[role="dialog"] [aria-label="Insert picture"]').length,
      questionUsesNirmala: getComputedStyle(document.querySelector('[role="dialog"] .rich-question')).fontFamily.includes('Nirmala'),
      fontSelectorAbsent: ![...document.querySelectorAll('[role="dialog"] select')].some((select) => /font/i.test(select.getAttribute('aria-label') || '')),
    }))()`)
    if (
      modalResult.result.value.richEditorCount !== 2 ||
      modalResult.result.value.boldButtonCount !== 2 ||
      modalResult.result.value.italicButtonCount !== 2 ||
      modalResult.result.value.underlineButtonCount !== 2 ||
      modalResult.result.value.listButtonCount !== 2 ||
      modalResult.result.value.indentButtonCount !== 2 ||
      modalResult.result.value.equationButtonCount !== 2 ||
      modalResult.result.value.imageButtonCount !== 2 ||
      !modalResult.result.value.questionUsesNirmala ||
      !modalResult.result.value.fontSelectorAbsent
    ) {
      throw new Error(`Rich document editor verification failed: ${JSON.stringify(modalResult.result.value)}`)
    }
    await evaluate(`document.querySelector('[aria-label="Close question editor"]')?.click()`)
    await delay(200)
    const attemptResult = await evaluate(`(() => {
      const questions = JSON.parse(localStorage.getItem('active-recall.questions.v1') || '[]');
      return {
        attemptCountVisible: [...document.querySelectorAll('article')]
          .some((article) => /\\d+ attempts?/.test(article.innerText)),
        reviewHistoryMigrated: questions.every((question) => Array.isArray(question.reviewHistory)),
      };
    })()`)
    await evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent.includes('Analytics'));
      button?.click();
    })()`)
    await delay(350)
    const curveResult = await evaluate(`(() => ({
      selectorVisible: Boolean(document.querySelector('[aria-label="Select question for forgetting curve"]')),
      graphVisible: Boolean(document.querySelector('[data-testid="question-forgetting-curve"]')),
      attemptSummaryVisible: /\\d+ attempts?/.test(document.querySelector('[data-testid="question-forgetting-curve"]')?.innerText || ''),
    }))()`)
    if (
      storageResult.result.value.questionCount > 0 &&
      (!attemptResult.result.value.attemptCountVisible ||
        !attemptResult.result.value.reviewHistoryMigrated ||
        !curveResult.result.value.selectorVisible ||
        !curveResult.result.value.graphVisible ||
        !curveResult.result.value.attemptSummaryVisible)
    ) {
      throw new Error(
        `Attempt or forgetting-curve verification failed: ${JSON.stringify({
          attempts: attemptResult.result.value,
          curve: curveResult.result.value,
        })}`,
      )
    }
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
          dailyPractice: practiceResult,
          editAvailable: editorResult.result.value,
          editor: modalResult.result.value,
          attempts: attemptResult.result.value,
          questionCurve: curveResult.result.value,
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
