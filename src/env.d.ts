/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface Window {
  api: {
    store: {
      get: (key: string) => Promise<any>
      set: (key: string, value: any) => Promise<void>
    }
    dialog: {
      openFile: () => Promise<string | null>
      openFileRemote: (dir?: string) => Promise<{ dir: string; files: { name: string; isDir: boolean }[] } | null>
    }
    craftctl: {
      check: () => Promise<{ available: boolean; path: string }>
      execute: (params: {
        command: string
        mode: string
        endpoint: string
        options?: { prefix?: boolean; keys?: boolean }
      }) => Promise<{
        stdout: string
        stderr: string
        exitCode: number
        duration: number
      }>
    }
    ssh: {
      connect: (config: {
        host: string
        port: number
        username: string
        authType: 'password' | 'privateKey'
        password?: string
        privateKeyPath?: string
        passphrase?: string
      }) => Promise<{ success: boolean; error?: string }>
      testConnect: (config: any) => Promise<{ success: boolean; error?: string }>
      execute: (command: string) => Promise<{
        stdout: string
        stderr: string
        exitCode: number
        duration: number
      }>
      disconnect: () => Promise<{ success: boolean }>
      checkConnection: () => Promise<{ connected: boolean }>
    }
    db: {
      getSSHConfigs: () => Promise<any[]>
      saveSSHConfig: (config: any) => Promise<{ success: boolean }>
      deleteSSHConfig: (id: string) => Promise<{ success: boolean }>
      getServiceAddresses: () => Promise<any[]>
      saveServiceAddress: (addr: any) => Promise<{ success: boolean }>
    }
    ai: {
      // 流式对话接口
      chatStream: (
        params: {
          input: string
          context: {
            protocol: string
            host: string
            port: number
            toolPath: string
          }
          threadId?: string
        },
        onChunk: (event: {
          type: 'token' | 'tool_start' | 'tool_end' | 'complete' | 'error'
          content?: string
          tool?: string
          result?: any
          finalOutput?: any
          message?: string
        }) => void
      ) => () => void
      // 保存命令执行结果
      saveExecutionResult: (result: {
        command: string
        stdout: string
        stderr: string
        exitCode: number
        duration: number
        timestamp: number
      }) => Promise<{ success: boolean }>
      // 获取上次执行结果
      getLastOutput: () => Promise<{
        command: string
        stdout: string
        stderr: string
        exitCode: number
        duration: number
        timestamp: number
      } | null>
      // 非流式接口（向后兼容）
      generateCommand: (params: {
        input: string
        context: {
          protocol: string
          host: string
          port: number
          toolPath: string
        }
        threadId?: string
      }) => Promise<{
        success: boolean
        result?: {
          command: string
          description: string
          parameters: {
            key?: string
            value?: string
            flags?: string[]
          }
          safetyLevel: 'safe' | 'warning' | 'dangerous'
          warnings: string[]
        }
        error?: string
      }>
      getConfig: () => Promise<{
        provider: 'openai' | 'openai-compatible'
        apiKey: string
        baseUrl?: string
        model: string
        temperature: number
        maxTokens: number
        enabled: boolean
      }>
      setConfig: (config: any) => Promise<{ success: boolean; error?: string }>
      resetConfig: () => Promise<{ success: boolean; error?: string }>
      clearThread: () => Promise<{ success: boolean; error?: string }>
    }
  }
}