import { contextBridge, ipcRenderer } from 'electron'
import { join } from 'path'

contextBridge.exposeInMainWorld('popupAPI', {
  getData: () => ipcRenderer.invoke('popup:get-data'),
  dismiss: () => ipcRenderer.send('popup:dismiss'),
  finished: () => ipcRenderer.send('popup:finished'),
  resize: (height: number) => ipcRenderer.send('popup:resize', height),
  showCaption: () => ipcRenderer.invoke('caption:show'),
  sendCaptionText: (text: string) => ipcRenderer.send('caption:text', text),
  clearCaption: () => ipcRenderer.send('caption:clear'),
  closeCaption: () => ipcRenderer.send('caption:close'),
  getAlertSoundUrl: () => {
    // In the packaged app, electron-builder copies our project-level
    // `resources/` directory under `process.resourcesPath` as `resources/`.
    // The resulting path (as seen in win-unpacked) is `resources/resources/alert.mp3`.
    const fullPath = join(process.resourcesPath, 'resources', 'alert.mp3')
    const normalized = fullPath.replace(/\\/g, '/')
    return `file://${normalized}`
  }
})
