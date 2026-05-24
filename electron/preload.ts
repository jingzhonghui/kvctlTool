import { contextBridge, ipcRenderer } from 'electron'
import type { StreamEvent, ConnectionContext, CommandExecutionResult } from '../types/ai'

const api = {
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('store:set', key, value)
  },
  dialog: {
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    openFileRemote: (dir?: string) => ipcRenderer.invoke('dialog:openFileRemote', dir)
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
    testConnect: (config: any) => ipcRenderer.invoke('ssh:testConnect', config),
    execute: (command: string) => ipcRenderer.invoke('ssh:execute', command),
    disconnect: () => ipcRenderer.invoke('ssh:disconnect'),
    checkConnection: () => ipcRenderer.invoke('ssh:checkConnection')
  },
  db: {
    getSSHConfigs: () => ipcRenderer.invoke('db:getSSHConfigs'),
    saveSSHConfig: (config: any) => ipcRenderer.invoke('db:saveSSHConfig', config),
    deleteSSHConfig: (id: string) => ipcRenderer.invoke('db:deleteSSHConfig', id),
    getServiceAddresses: () => ipcRenderer.invoke('db:getServiceAddresses'),
    saveServiceAddress: (addr: any) => ipcRenderer.invoke('db:saveServiceAddress', addr)
  },
  ai: {
    // 流式对话接口（v2 新增）
    chatStream: (
      params: { input: string; context: ConnectionContext; threadId?: string },
      onChunk: (event: StreamEvent) => void
    ): (() => void) => {
      // 设置监听器
      const chunkHandler = (_: any, event: StreamEvent) => onChunk(event)
      const errorHandler = (_: any, error: { message: string }) => {
        onChunk({ type: 'error', message: error.message })
        cleanup()
      }

      ipcRenderer.on('ai:stream:chunk', chunkHandler)
      ipcRenderer.on('ai:stream:error', errorHandler)

      // 发送开始流式请求
      ipcRenderer.send('ai:chatStream', params)

      // 返回取消函数
      const cleanup = () => {
        ipcRenderer.removeListener('ai:stream:chunk', chunkHandler)
        ipcRenderer.removeListener('ai:stream:error', errorHandler)
      }

      return cleanup
    },

    // 保存命令执行结果
    saveExecutionResult: (result: CommandExecutionResult) =>
      ipcRenderer.invoke('ai:saveExecutionResult', result),

    // 获取上次执行结果
    getLastOutput: () => ipcRenderer.invoke('ai:getLastOutput'),

    // 保留的非流式接口（向后兼容）
    generateCommand: (params: { input: string; context: any; threadId?: string }) =>
      ipcRenderer.invoke('ai:generateCommand', params),

    getConfig: () => ipcRenderer.invoke('ai:getConfig'),
    setConfig: (config: any) => ipcRenderer.invoke('ai:setConfig', config),
    resetConfig: () => ipcRenderer.invoke('ai:resetConfig'),
    clearThread: () => ipcRenderer.invoke('ai:clearThread')
  }
}

contextBridge.exposeInMainWorld('api', api)
