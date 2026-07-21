module.exports = {
  packagerConfig: {
    asar: true,
    executableName: 'RecallOS',
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'RecallOS',
        setupExe: 'Recall-OS-Setup.exe',
        authors: 'Karabo Goodwill Nkambule',
        description: 'A private, local-first active recall and spaced repetition desktop app.',
      },
    },
  ],
}
