import { contextBridge, ipcRenderer } from 'electron'

const api = {
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('store:set', key, value)
  },
  craftctl: {
    check: () => ipcRenderer.invoke('craftctl:check'),
    execute: (params: {
      command: string
      mode: string
      endpoint: string
      options?: { prefix?: boolean; keys?: boolean }
    }) => ipcRenderer.invoke('craftctl:execute', params)
  },
  ssh: {
    connect: (config: {
      host: string
      port: number
      username: string
      authType: 'password' | 'privateKey'
      password?: string
      privateKeyPath?: string
      passphrase?: string
    }) => ipcRenderer.invoke('ssh:connect', config),
    execute: (command: string) => ipcRenderer.invoke('ssh:execute', command),
    disconnect: () => ipcRenderer.invoke('ssh:disconnect')
  },
  db: {
    getSSHConfigs: () => ipcRenderer.invoke('db:getSSHConfigs'),
    saveSSHConfig: (config: any) => ipcRenderer.invoke('db:saveSSHConfig', config),
    deleteSSHConfig: (id: string) => ipcRenderer.invoke('db:deleteSSHConfig', id),
    getServiceAddresses: () => ipcRenderer.invoke('db:getServiceAddresses'),
    saveServiceAddress: (addr: any) => ipcRenderer.invoke('db:saveServiceAddress', addr)
  }
}

contextBridge.exposeInMainWorld('api', api)

declare global {
  interface Window {
    api: typeof api
  }
}