const fs = require('node:fs')
const fsPromises = require('node:fs/promises')
const path = require('node:path')

const levelDbDirectory = path.join(
  'C:\\Users\\Admin\\AppData\\Roaming\\Recall OS',
  'Local Storage',
  'leveldb',
)
const projectDirectory = path.resolve(__dirname, '..')
const recoveryDirectory = path.join(projectDirectory, 'recovery')
const recoveryFile = path.join(recoveryDirectory, 'study-data-recovered-2026-07-21.json')

function extractJsonArrays(text, storageKey) {
  const candidates = []
  let searchOffset = 0

  while (searchOffset < text.length) {
    const keyOffset = text.indexOf(storageKey, searchOffset)
    if (keyOffset === -1) break
    searchOffset = keyOffset + storageKey.length

    const arrayOffset = text.indexOf('[', searchOffset)
    if (arrayOffset === -1 || arrayOffset - searchOffset > 80) continue

    let depth = 0
    let insideString = false
    let escaped = false

    for (let index = arrayOffset; index < text.length; index += 1) {
      const character = text[index]

      if (insideString) {
        if (escaped) escaped = false
        else if (character === '\\') escaped = true
        else if (character === '"') insideString = false
        continue
      }

      if (character === '"') insideString = true
      else if (character === '[' || character === '{') depth += 1
      else if (character === ']' || character === '}') {
        depth -= 1
        if (depth === 0) {
          try {
            const value = JSON.parse(text.slice(arrayOffset, index + 1))
            if (Array.isArray(value)) candidates.push(value)
          } catch {
            // Ignore incomplete LevelDB records and continue scanning.
          }
          break
        }
      }
    }
  }

  return candidates
}

async function main() {
  const entries = await fsPromises.readdir(levelDbDirectory, { withFileTypes: true })
  const dataFiles = entries
    .filter((entry) => entry.isFile() && /\.(log|ldb)$/i.test(entry.name))
    .map((entry) => path.join(levelDbDirectory, entry.name))

  const questionCandidates = []
  const courseCandidates = []
  const activityCandidates = []

  for (const dataFile of dataFiles) {
    const text = await fsPromises.readFile(dataFile, 'utf8')
    questionCandidates.push(...extractJsonArrays(text, 'active-recall.questions.v1'))
    courseCandidates.push(...extractJsonArrays(text, 'active-recall.courses.v1'))
    activityCandidates.push(...extractJsonArrays(text, 'active-recall.activity-dates.v1'))
  }

  const maximumQuestionCount = Math.max(0, ...questionCandidates.map((value) => value.length))
  const recoveredQuestions = questionCandidates
    .filter((value) => value.length === maximumQuestionCount)
    .at(-1)

  if (!recoveredQuestions?.length) {
    throw new Error('No non-empty Recall OS question snapshot could be recovered.')
  }

  const recoveredCourses = courseCandidates.at(-1) || [
    ...new Set(recoveredQuestions.map((question) => question.course).filter(Boolean)),
  ]
  const recoveredActivityDates = activityCandidates.at(-1) || []
  const recovery = {
    version: 2,
    recoveredAt: new Date().toISOString(),
    source: levelDbDirectory,
    courses: recoveredCourses,
    questions: recoveredQuestions,
    activityDates: recoveredActivityDates,
  }

  console.log(
    JSON.stringify(
      {
        questionSnapshotsFound: questionCandidates.map((value) => value.length),
        recoveredQuestionCount: recoveredQuestions.length,
        recoveredCourses,
        courseDistribution: Object.fromEntries(
          recoveredCourses.map((course) => [
            course,
            recoveredQuestions.filter((question) => question.course === course).length,
          ]),
        ),
      },
      null,
      2,
    ),
  )

  if (process.argv.includes('--write')) {
    await fsPromises.mkdir(recoveryDirectory, { recursive: true })
    await fsPromises.writeFile(recoveryFile, `${JSON.stringify(recovery, null, 2)}\n`, 'utf8')
    console.log(`Recovery backup written: ${recoveryFile}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
