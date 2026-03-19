import { app, BrowserWindow } from 'electron'
import path from 'path'

function createWindow() {
  // Determina se estamos em desenvolvimento ou produção
  // app.isPackaged só está disponível após o app estar pronto
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
  // Cria a janela do navegador
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: 'Ancoro Application',
  })

  // Carrega o app
  if (isDev) {
    // Em desenvolvimento, carrega do servidor Vite
    mainWindow.loadURL('http://localhost:5173')
    // Abre DevTools
    mainWindow.webContents.openDevTools()
  } else {
    // Em produção, carrega do arquivo build
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

// Quando o Electron terminou de inicializar
app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    // No macOS, recria janela quando clica no dock se não houver janelas abertas
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// Quit quando todas as janelas são fechadas (exceto no macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
