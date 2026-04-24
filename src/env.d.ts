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
    craftctl: {
      check: () => Promise<{ available: boolean }>
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
      execute: (command: string) => Promise<{
        stdout: string
        stderr: string
        exitCode: number
        duration: number
      }>
      disconnect: () => Promise<{ success: boolean }>
    }
    db: {
      getSSHConfigs: () => Promise<any[]>
      saveSSHConfig: (config: any) => Promise<{ success: boolean }>
      deleteSSHConfig: (id: string) => Promise<{ success: boolean }>
      getServiceAddresses: () => Promise<any[]>
      saveServiceAddress: (addr: any) => Promise<{ success: boolean }>
    }
  }
}