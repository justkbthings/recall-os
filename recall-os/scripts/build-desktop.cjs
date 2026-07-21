const fs = require('node:fs')
const fsPromises = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { createPackage } = require('@electron/asar')
const { downloadArtifact } = require('@electron/get')
const { sign } = require('@electron/windows-sign')
const { createWindowsInstaller } = require('electron-winstaller')

const projectDirectory = path.resolve(__dirname, '..')
const outputDirectory = path.join(projectDirectory, 'signed-out')
const packagedAppDirectory = path.join(outputDirectory, 'RecallOS-win32-x64')
const installerDirectory = path.join(outputDirectory, 'make', 'squirrel.windows', 'x64')
const stagingDirectory = path.join(projectDirectory, '.desktop-staging')
const easyInstallerPath = path.join(projectDirectory, 'Recall-OS-Setup.exe')
const easyPublicCertificatePath = path.join(projectDirectory, 'RecallOS-Public-Certificate.cer')
const packageMetadata = require(path.join(projectDirectory, 'package.json'))
const signingConfig = require(path.join(projectDirectory, 'signing', 'signing-config.json'))
const electronVersion = require(path.join(projectDirectory, 'node_modules', 'electron', 'package.json')).version
const windowsSignOptions = {
  signToolPath: path.join(
    projectDirectory,
    'node_modules',
    '@electron',
    'windows-sign',
    'vendor',
    'signtool.exe',
  ),
  signWithParams: ['/sha1', signingConfig.thumbprint, '/s', 'My'],
  automaticallySelectCertificate: false,
  hashes: ['sha256'],
  timestampServer: 'http://timestamp.digicert.com',
  description: 'Recall OS',
}

function assertProjectChild(targetPath) {
  const relativePath = path.relative(projectDirectory, path.resolve(targetPath))

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath) || relativePath === '') {
    throw new Error(`Refusing to modify an unsafe path: ${targetPath}`)
  }
}

async function findCachedElectronZip() {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
  const cacheDirectory = path.join(localAppData, 'electron', 'Cache')
  const expectedFileName = `electron-v${electronVersion}-win32-x64.zip`

  if (fs.existsSync(cacheDirectory)) {
    const cacheKeys = await fsPromises.readdir(cacheDirectory, { withFileTypes: true })

    for (const cacheKey of cacheKeys) {
      if (!cacheKey.isDirectory()) continue

      const candidatePath = path.join(cacheDirectory, cacheKey.name, expectedFileName)
      if (fs.existsSync(candidatePath)) return candidatePath
    }
  }

  return downloadArtifact({
    version: electronVersion,
    artifactName: 'electron',
    platform: 'win32',
    arch: 'x64',
  })
}

async function createPackagedApp() {
  assertProjectChild(outputDirectory)
  assertProjectChild(stagingDirectory)

  await fsPromises.rm(outputDirectory, { recursive: true, force: true })
  await fsPromises.rm(stagingDirectory, { recursive: true, force: true })
  await fsPromises.mkdir(packagedAppDirectory, { recursive: true })
  await fsPromises.mkdir(stagingDirectory, { recursive: true })

  const electronZipPath = await findCachedElectronZip()
  console.log(`Using Electron ${electronVersion}`)
  const extraction = spawnSync(
    'tar.exe',
    ['-xf', electronZipPath, '-C', packagedAppDirectory],
    { stdio: 'inherit' },
  )

  if (extraction.status !== 0) {
    throw new Error(`Windows archive extraction failed with exit code ${extraction.status}`)
  }

  await fsPromises.rename(
    path.join(packagedAppDirectory, 'electron.exe'),
    path.join(packagedAppDirectory, 'RecallOS.exe'),
  )
  await fsPromises.rm(path.join(packagedAppDirectory, 'resources', 'default_app.asar'), { force: true })

  const packagedMetadata = {
    name: packageMetadata.name,
    productName: packageMetadata.productName,
    version: packageMetadata.version,
    description: packageMetadata.description,
    author: packageMetadata.author,
    license: packageMetadata.license,
    main: packageMetadata.main,
  }

  await fsPromises.writeFile(
    path.join(stagingDirectory, 'package.json'),
    `${JSON.stringify(packagedMetadata, null, 2)}\n`,
    'utf8',
  )
  await fsPromises.cp(path.join(projectDirectory, 'dist'), path.join(stagingDirectory, 'dist'), {
    recursive: true,
  })
  await fsPromises.mkdir(path.join(stagingDirectory, 'electron'), { recursive: true })
  await fsPromises.copyFile(
    path.join(projectDirectory, 'electron', 'main.cjs'),
    path.join(stagingDirectory, 'electron', 'main.cjs'),
  )
  await fsPromises.copyFile(
    path.join(projectDirectory, 'LICENSE.md'),
    path.join(stagingDirectory, 'LICENSE.md'),
  )

  await createPackage(stagingDirectory, path.join(packagedAppDirectory, 'resources', 'app.asar'))
  await fsPromises.rm(stagingDirectory, { recursive: true, force: true })

  await sign({
    files: [path.join(packagedAppDirectory, 'RecallOS.exe')],
    ...windowsSignOptions,
  })
  console.log(`Application signed by ${signingConfig.publisher}`)
}

async function createInstaller() {
  await fsPromises.mkdir(installerDirectory, { recursive: true })

  await createWindowsInstaller({
    appDirectory: packagedAppDirectory,
    outputDirectory: installerDirectory,
    name: 'RecallOS',
    title: 'Recall OS',
    authors: packageMetadata.author,
    description: packageMetadata.description,
    version: packageMetadata.version,
    exe: 'RecallOS.exe',
    setupExe: 'Recall-OS-Setup.exe',
    noMsi: true,
  })

  const generatedInstaller = path.join(installerDirectory, 'Recall-OS-Setup.exe')
  await sign({
    files: [generatedInstaller],
    ...windowsSignOptions,
  })
  console.log(`Installer signed by ${signingConfig.publisher}`)
  await fsPromises.copyFile(generatedInstaller, easyInstallerPath)
  await fsPromises.copyFile(
    path.join(projectDirectory, 'signing', signingConfig.certificateFile),
    easyPublicCertificatePath,
  )

  const stats = await fsPromises.stat(easyInstallerPath)
  console.log(`Installer created: ${easyInstallerPath}`)
  console.log(`Installer size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`)
}

async function main() {
  await createPackagedApp()
  await createInstaller()
}

main().catch(async (error) => {
  if (fs.existsSync(stagingDirectory)) {
    await fsPromises.rm(stagingDirectory, { recursive: true, force: true })
  }

  console.error(error)
  process.exitCode = 1
})
