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

async function waitForRuntimeValue(evaluate, expression, errorMessage) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const result = await evaluate(expression)
    if (result.result.value) return result.result.value
    await delay(100)
  }
  throw new Error(errorMessage)
}

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
        optionalNotesMigrated: questions.every((question) => typeof question.note === 'string'),
        storedTheme: localStorage.getItem('active-recall.theme.v1') || 'midnight',
        renderedTheme: document.querySelector('[data-theme]')?.getAttribute('data-theme') || null,
      };
    })()`)
    if (
      storageResult.result.value.questionCount > 0 &&
      (!storageResult.result.value.richContentMigrated ||
        !storageResult.result.value.optionalNotesMigrated)
    ) {
      throw new Error(
        `Existing questions were not fully migrated: ${JSON.stringify(storageResult.result.value)}`,
      )
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
    const practiceTarget = practiceTargetResult.result.value
    let practiceResult = { available: false }
    if (practiceTarget.available) {
      await waitForRuntimeValue(
        evaluate,
        `(() => {
          const chapterSelect = document.querySelector('[aria-label="Choose practice chapter"]');
          return Boolean(chapterSelect && [...chapterSelect.options].some((option) => option.value === ${JSON.stringify(practiceTarget.chapter)}));
        })()`,
        'The selected course did not expose the expected chapter in time.',
      )
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
      await waitForRuntimeValue(
        evaluate,
        `(() => {
          const chapterSelect = document.querySelector('[aria-label="Choose practice chapter"]');
          return Boolean(chapterSelect && [...chapterSelect.options].some((option) => option.value === ${JSON.stringify(practiceTarget.chapter)}));
        })()`,
        'Scheduled practice did not restore the chapter selector in time.',
      )
      await evaluate(`(() => {
        const chapterSelect = document.querySelector('[aria-label="Choose practice chapter"]');
        const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
        setValue.call(chapterSelect, ${JSON.stringify(practiceTarget.chapter)});
        chapterSelect.dispatchEvent(new Event('input', { bubbles: true }));
        chapterSelect.dispatchEvent(new Event('change', { bubbles: true }));
      })()`)
      await waitForRuntimeValue(
        evaluate,
        `(() => {
          const subchapterSelect = document.querySelector('[aria-label="Choose practice subchapter"]');
          return Boolean(subchapterSelect && [...subchapterSelect.options].some((option) => option.value === ${JSON.stringify(practiceTarget.subchapter)}));
        })()`,
        'The selected chapter did not expose the expected subchapter in time.',
      )
      await evaluate(`(() => {
        const subchapterSelect = document.querySelector('[aria-label="Choose practice subchapter"]');
        const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
        setValue.call(subchapterSelect, ${JSON.stringify(practiceTarget.subchapter)});
        subchapterSelect.dispatchEvent(new Event('input', { bubbles: true }));
        subchapterSelect.dispatchEvent(new Event('change', { bubbles: true }));
      })()`)
      await waitForRuntimeValue(
        evaluate,
        `(() => Boolean(
          document.querySelector('[data-scope-progress="chapter"]') &&
          document.querySelector('[data-scope-progress="subchapter"]')
        ))()`,
        'The chapter and subchapter progress cards did not render in time.',
      )
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
            left.question.replace(/<[^>]*>/g, '').localeCompare(
              right.question.replace(/<[^>]*>/g, ''), undefined, { numeric: true }) ||
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
      const orderResult = await evaluate(`(() => ({
        orderScreenVisible: Boolean(document.querySelector('[data-testid="question-order-screen"]')),
        sequentialAvailable: Boolean([...document.querySelectorAll('[aria-label="Choose question order"] button')].find((button) => button.textContent.includes('Sequential'))),
        randomAvailable: Boolean([...document.querySelectorAll('[aria-label="Choose question order"] button')].find((button) => button.textContent.includes('Random'))),
      }))()`)
      await evaluate(`document.querySelector('[data-testid="confirm-practice-session"]')?.click()`)
      await delay(250)
      const cardResult = await evaluate(`(() => ({
        displayedFirstQuestion: document.querySelector('[data-testid="practice-question"]')?.textContent?.replace(/\\s+/g, ' ').trim() || null,
      }))()`)
      practiceResult = {
        ...modeResult.result.value,
        ...challengeResult.result.value,
        ...scopeResult.result.value,
        ...orderResult.result.value,
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
        (practiceTarget.hasDueQuestion && (!practiceResult.orderScreenVisible || !practiceResult.sequentialAvailable || !practiceResult.randomAvailable)) ||
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
      optionalNoteVisible: document.querySelector('[role="dialog"]')?.innerText.includes('Optional note') || false,
    }))()`)
    if (
      modalResult.result.value.richEditorCount !== 3 ||
      modalResult.result.value.boldButtonCount !== 3 ||
      modalResult.result.value.italicButtonCount !== 3 ||
      modalResult.result.value.underlineButtonCount !== 3 ||
      modalResult.result.value.listButtonCount !== 3 ||
      modalResult.result.value.indentButtonCount !== 3 ||
      modalResult.result.value.equationButtonCount !== 3 ||
      modalResult.result.value.imageButtonCount !== 3 ||
      !modalResult.result.value.questionUsesNirmala ||
      !modalResult.result.value.fontSelectorAbsent ||
      !modalResult.result.value.optionalNoteVisible
    ) {
      throw new Error(`Rich document editor verification failed: ${JSON.stringify(modalResult.result.value)}`)
    }
    await evaluate(`window.resizeTo(900, 720)`)
    await delay(350)
    const narrowWindowResult = await evaluate(`(() => {
      const modal = document.querySelector('[role="dialog"] > div');
      const header = document.querySelector('#question-editor-title');
      const sidebar = document.querySelector('.app-sidebar');
      const bounds = modal?.getBoundingClientRect();
      return {
        width: window.innerWidth,
        sidebarWidth: sidebar?.getBoundingClientRect().width || 0,
        modalFits: Boolean(bounds && bounds.left >= 0 && bounds.right <= window.innerWidth),
        modalHeaderVisible: Boolean(header && header.getBoundingClientRect().top >= 0),
        pageFits: document.documentElement.scrollWidth <= window.innerWidth,
        pageScrollWidth: document.documentElement.scrollWidth,
        overflowElements: [...document.querySelectorAll('body *')]
          .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 2)
          .slice(0, 8)
          .map((element) => ({ tag: element.tagName, className: String(element.className).slice(0, 100), right: Math.round(element.getBoundingClientRect().right) })),
      };
    })()`)
    if (
      narrowWindowResult.result.value.width > 1000 ||
      narrowWindowResult.result.value.sidebarWidth > 100 ||
      !narrowWindowResult.result.value.modalFits ||
      !narrowWindowResult.result.value.modalHeaderVisible ||
      !narrowWindowResult.result.value.pageFits
    ) {
      throw new Error(`Half-screen layout verification failed: ${JSON.stringify(narrowWindowResult.result.value)}`)
    }
    await evaluate(`window.resizeTo(1440, 920)`)
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
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent.includes('Recall Calendar'));
      button?.click();
    })()`)
    await delay(350)
    const calendarBaseResult = await evaluate(`(() => ({
      visible: Boolean(document.querySelector('[data-calendar-view]')),
      initialMode: document.querySelector('[data-calendar-view]')?.getAttribute('data-calendar-mode') || null,
      modeButtonCount: document.querySelectorAll('[data-calendar-mode-button]').length,
      goldDateCount: document.querySelectorAll('[data-recall-active-date]').length,
    }))()`)
    await evaluate(`document.querySelector('[data-calendar-mode-button="year"]')?.click()`)
    await delay(250)
    const calendarYearResult = await evaluate(`(() => {
      const monthButtons = [...document.querySelectorAll('[data-calendar-month]')];
      const currentMonth = String(new Date().getMonth() + 1);
      monthButtons.find((button) => button.getAttribute('data-calendar-month') === currentMonth)?.click();
      return {
        yearMode: document.querySelector('[data-calendar-view]')?.getAttribute('data-calendar-mode') || null,
        monthCount: monthButtons.length,
      };
    })()`)
    await delay(250)
    const calendarMonthResult = await evaluate(`(() => {
      const firstDate = document.querySelector('[data-calendar-date]');
      const result = {
        monthMode: document.querySelector('[data-calendar-view]')?.getAttribute('data-calendar-mode') || null,
        dateCellCount: document.querySelectorAll('[data-calendar-date]').length,
      };
      firstDate?.click();
      return result;
    })()`)
    await delay(250)
    const calendarDayResult = await evaluate(`(() => ({
      dayMode: document.querySelector('[data-calendar-view]')?.getAttribute('data-calendar-mode') || null,
      hourRowCount: document.querySelectorAll('[data-calendar-hour]').length,
    }))()`)
    const calendarResult = {
      ...calendarBaseResult.result.value,
      ...calendarYearResult.result.value,
      ...calendarMonthResult.result.value,
      ...calendarDayResult.result.value,
    }
    if (
      !calendarResult.visible ||
      calendarResult.initialMode !== 'month' ||
      calendarResult.modeButtonCount !== 4 ||
      calendarResult.yearMode !== 'year' ||
      calendarResult.monthCount !== 12 ||
      calendarResult.monthMode !== 'month' ||
      calendarResult.dateCellCount !== 42 ||
      calendarResult.dayMode !== 'day' ||
      calendarResult.hourRowCount !== 24
    ) {
      throw new Error(`Recall calendar verification failed: ${JSON.stringify(calendarResult)}`)
    }
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
    const courseManagerResult = await evaluate(`(() => {
      const root = document.querySelector('[data-theme]');
      const originalTheme = root?.getAttribute('data-theme') || 'midnight';
      if (root) root.setAttribute('data-theme', 'daylight');
      const daylightStyles = {
        themeBackground: root ? getComputedStyle(root).getPropertyValue('--theme-bg').trim() : null,
        mainBackground: getComputedStyle(document.querySelector('main')).backgroundColor,
        headingColor: getComputedStyle(document.querySelector('main h2')).color,
        sidebarBackground: getComputedStyle(document.querySelector('aside')).backgroundColor,
        colorScheme: getComputedStyle(document.documentElement).colorScheme,
      };
      if (root) root.setAttribute('data-theme', originalTheme);
      return {
        visible: document.body.innerText.includes('Course manager'),
        addButtonVisible: [...document.querySelectorAll('button')].some((item) => item.textContent.trim() === 'Add course'),
        ownershipVisible: document.body.innerText.includes('Karabo Goodwill Nkambule'),
        versionVisible: document.body.innerText.includes('Version ${appVersion}'),
        themeOptionCount: document.querySelectorAll('[data-theme-option]').length,
        selectedTheme: document.querySelector('[data-theme-option][aria-pressed="true"]')?.getAttribute('data-theme-option') || null,
        daylightAvailable: Boolean(document.querySelector('[data-theme-option="daylight"]')),
        daylightStyles,
      };
    })()`)
    if (
      courseManagerResult.result.value.themeOptionCount !== 8 ||
      !courseManagerResult.result.value.daylightAvailable ||
      courseManagerResult.result.value.selectedTheme !== storageResult.result.value.storedTheme ||
      storageResult.result.value.renderedTheme !== storageResult.result.value.storedTheme ||
      courseManagerResult.result.value.daylightStyles.themeBackground !== '#f8fafc' ||
      courseManagerResult.result.value.daylightStyles.mainBackground !== 'rgb(248, 250, 252)' ||
      courseManagerResult.result.value.daylightStyles.headingColor !== 'rgb(15, 23, 42)' ||
      courseManagerResult.result.value.daylightStyles.sidebarBackground !== 'rgb(255, 255, 255)' ||
      courseManagerResult.result.value.daylightStyles.colorScheme !== 'light'
    ) {
      throw new Error(`Theme verification failed: ${JSON.stringify(courseManagerResult.result.value)}`)
    }

    socket.close()
    console.log(
      JSON.stringify(
        {
          page: { title: page.title, url: page.url },
          storage: storageResult.result.value,
          dailyPractice: practiceResult,
          editAvailable: editorResult.result.value,
          editor: modalResult.result.value,
          halfScreen: narrowWindowResult.result.value,
          attempts: attemptResult.result.value,
          calendar: calendarResult,
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
