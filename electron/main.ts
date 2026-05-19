import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { spawn, execSync } from 'child_process'
import Store from 'electron-store'
import { Client as SSHClient } from 'ssh2'

const store = new Store()
let mainWindow: BrowserWindow | null = null
let sshClient: SSHClient | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false,
    backgroundColor: '#0d1117',
    autoHideMenuBar: true
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

ipcMain.handle('store:get', (_, key: string) => store.get(key))
ipcMain.handle('store:set', (_, key: string, value: any) => store.set(key, value))

ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [
      { name: 'Executables', extensions: ['exe', 'bat', 'cmd', 'sh'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('dialog:openFileRemote', async (_, dir: string = '') => {
  if (!sshClient) {
    return null
  }

  return new Promise((resolve) => {
    sshClient!.sftp((err, sftp) => {
      if (err) {
        resolve(null)
        return
      }

      const readDir = (targetDir: string) => {
        sftp.readdir(targetDir, (err, list) => {
          if (err) {
            resolve(null)
            return
          }
          const files = list
            .filter(f => f.filename !== '.' && f.filename !== '..')
            .map(f => ({
              name: f.filename,
              isDir: f.attrs.isDirectory()
            }))
            .sort((a, b) => {
              if (a.isDir === b.isDir) return a.name.localeCompare(b.name)
              return a.isDir ? -1 : 1
            })
          resolve({ dir: targetDir, files })
        })
      }

      if (!dir) {
        sftp.realpath('.', (err2, resolvedPath) => {
          if (err2) {
            readDir('/')
          } else {
            readDir(resolvedPath)
          }
        })
      } else {
        readDir(dir)
      }
    })
  })
})

ipcMain.handle('craftctl:check', async () => {
  const toolPath = store.get('toolPath', 'craftctl') as string
  try {
    execSync(`${toolPath} --version`, { stdio: 'ignore' })
    return { available: true, path: toolPath }
  } catch {
    return { available: false, path: toolPath }
  }
})

ipcMain.handle('craftctl:execute', async (_, params: {
  command: string
  mode: string
  endpoint: string
  options?: { prefix?: boolean; keys?: boolean }
}) => {
  const toolPath = store.get('toolPath', 'craftctl') as string
  const startTime = Date.now()
  const args = params.options?.prefix ? ['--prefix'] : []
  if (params.options?.keys) args.push('--keys-only')

  return new Promise((resolve) => {
    const endpoint = params.endpoint
    const endpointArgs = endpoint.startsWith('http://') ? [`--endpoints=${endpoint}`] : ['-e', endpoint]
    const proc = spawn(toolPath, [...args, ...endpointArgs, ...params.command.split(' ')], {
      env: process.env,
      shell: true
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => { stdout += data.toString() })
    proc.stderr.on('data', (data) => { stderr += data.toString() })

    proc.on('close', (code) => {
      const duration = Date.now() - startTime
      resolve({
        stdout,
        stderr,
        exitCode: code,
        duration
      })
    })

    proc.on('error', (err) => {
      resolve({
        stdout: '',
        stderr: err.message,
        exitCode: -1,
        duration: Date.now() - startTime
      })
    })
  })
})

ipcMain.handle('ssh:connect', async (_, config: {
  host: string
  port: number
  username: string
  authType: 'password' | 'privateKey'
  password?: string
  privateKeyPath?: string
  passphrase?: string
}) => {
  return new Promise((resolve) => {
    sshClient = new SSHClient()
    
    const connectionConfig: any = {
      host: config.host,
      port: config.port,
      username: config.username
    }
    
    if (config.authType === 'password') {
      connectionConfig.password = config.password
    } else if (config.privateKeyPath) {
      try {
        const fs = require('fs')
        connectionConfig.privateKey = fs.readFileSync(config.privateKeyPath)
        if (config.passphrase) connectionConfig.passphrase = config.passphrase
      } catch (err: any) {
        resolve({ success: false, error: err.message })
        return
      }
    }
    
    sshClient!.on('ready', () => {
      resolve({ success: true })
    })
    
    sshClient!.on('error', (err) => {
      resolve({ success: false, error: err.message })
    })
    
    try {
      sshClient!.connect(connectionConfig)
    } catch (err: any) {
      resolve({ success: false, error: err.message })
    }
  })
})

ipcMain.handle('ssh:testConnect', async (_, config: {
  host: string
  port: number
  username: string
  authType: 'password' | 'privateKey'
  password?: string
  privateKeyPath?: string
  passphrase?: string
}) => {
  return new Promise((resolve) => {
    const testClient = new SSHClient()
    
    const connectionConfig: any = {
      host: config.host,
      port: config.port,
      username: config.username
    }
    
    if (config.authType === 'password') {
      connectionConfig.password = config.password
    } else if (config.privateKeyPath) {
      try {
        const fs = require('fs')
        connectionConfig.privateKey = fs.readFileSync(config.privateKeyPath)
        if (config.passphrase) connectionConfig.passphrase = config.passphrase
      } catch (err: any) {
        resolve({ success: false, error: `无法读取私钥文件: ${err.message}` })
        return
      }
    }
    
    const timeout = setTimeout(() => {
      testClient.end()
      resolve({ success: false, error: '连接超时 (10秒)' })
    }, 10000)
    
    testClient.on('ready', () => {
      clearTimeout(timeout)
      testClient.end()
      resolve({ success: true })
    })
    
    testClient.on('error', (err) => {
      clearTimeout(timeout)
      resolve({ success: false, error: err.message })
    })
    
    try {
      testClient.connect(connectionConfig)
    } catch (err: any) {
      clearTimeout(timeout)
      resolve({ success: false, error: err.message })
    }
  })
})

ipcMain.handle('ssh:execute', async (_, command: string) => {
  return new Promise((resolve) => {
    if (!sshClient) {
      resolve({ stdout: '', stderr: 'SSH not connected', exitCode: -1, duration: 0 })
      return
    }
    
    const startTime = Date.now()
    
    sshClient!.exec(command, (err, stream) => {
      if (err) {
        resolve({ stdout: '', stderr: err.message, exitCode: -1, duration: Date.now() - startTime })
        return
      }
      
      let stdout = ''
      let stderr = ''
      
      stream.on('data', (data: Buffer) => { stdout += data.toString() })
      stream.stderr.on('data', (data: Buffer) => { stderr += data.toString() })
      
      stream.on('close', (code: number) => {
        resolve({ stdout, stderr, exitCode: code || 0, duration: Date.now() - startTime })
      })
    })
  })
})

ipcMain.handle('ssh:disconnect', () => {
  if (sshClient) {
    sshClient.end()
    sshClient = null
  }
  return { success: true }
})

ipcMain.handle('ssh:checkConnection', () => {
  return { connected: !!sshClient }
})

ipcMain.handle('db:getSSHConfigs', () => {
  return store.get('sshConfigs', [])
})

ipcMain.handle('db:saveSSHConfig', (_, config: any) => {
  const configs = store.get('sshConfigs', []) as any[]
  const index = configs.findIndex((c: any) => c.id === config.id)
  if (index >= 0) {
    configs[index] = config
  } else {
    configs.push(config)
  }
  store.set('sshConfigs', configs)
  return { success: true }
})

ipcMain.handle('db:deleteSSHConfig', (_, id: string) => {
  const configs = store.get('sshConfigs', []) as any[]
  store.set('sshConfigs', configs.filter((c: any) => c.id !== id))
  return { success: true }
})

ipcMain.handle('db:getServiceAddresses', () => {
  return store.get('serviceAddresses', [])
})

ipcMain.handle('db:saveServiceAddress', (_, addr: any) => {
  const addresses = store.get('serviceAddresses', []) as any[]
  const index = addresses.findIndex((a: any) => 
    a.protocol === addr.protocol && a.host === addr.host && a.port === addr.port
  )
  if (index >= 0) {
    addresses[index].lastUsedAt = addr.lastUsedAt
    addresses[index].useCount = (addresses[index].useCount || 1) + 1
  } else {
    addresses.push(addr)
  }
  store.set('serviceAddresses', addresses)
  return { success: true }
})