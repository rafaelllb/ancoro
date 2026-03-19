import { contextBridge, ipcRenderer } from 'electron'

// Expõe APIs seguras para o renderer process
// Exemplo de como expor funcionalidades do Node.js de forma segura

contextBridge.exposeInMainWorld('electronAPI', {
  // Exemplo: send e receive messages
  send: (channel: string, data: any) => {
    // Whitelist de canais permitidos
    const validChannels = ['toMain']
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data)
    }
  },
  receive: (channel: string, func: (...args: any[]) => void) => {
    const validChannels = ['fromMain']
    if (validChannels.includes(channel)) {
      // Remove listener anterior para evitar duplicatas
      ipcRenderer.removeAllListeners(channel)
      ipcRenderer.on(channel, (event, ...args) => func(...args))
    }
  },
})

// Declaração de tipos para TypeScript (será movida para types/ depois)
declare global {
  interface Window {
    electronAPI: {
      send: (channel: string, data: any) => void
      receive: (channel: string, func: (...args: any[]) => void) => void
    }
  }
}
