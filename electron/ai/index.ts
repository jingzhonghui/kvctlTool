import { ipcMain } from 'electron'
import { CommandGenerationAgent, CommandGenerationResult, ConnectionContext } from './agents/command-agent'
import {
  getAIConfig,
  setAIConfig,
  isAIConfigValid,
  AIProviderConfig
} from './config/provider-config'

let commandAgent: CommandGenerationAgent | null = null

function getCommandAgent(): CommandGenerationAgent | null {
  console.log('[AI IPC] getCommandAgent 被调用')
  const config = getAIConfig()
  console.log('[AI IPC] AI 配置:', { enabled: config.enabled, hasApiKey: !!config.apiKey, provider: config.provider })

  if (!isAIConfigValid(config)) {
    console.log('[AI IPC] AI 配置无效')
    return null
  }

  if (!commandAgent) {
    console.log('[AI IPC] 创建新的 CommandGenerationAgent')
    commandAgent = new CommandGenerationAgent(config)
  } else {
    console.log('[AI IPC] 使用现有的 CommandGenerationAgent')
  }

  return commandAgent
}

export function registerAIIPC() {
  ipcMain.handle('ai:generateCommand', async (_, {
    input,
    context,
    threadId
  }: {
    input: string
    context: ConnectionContext
    threadId?: string
  }): Promise<{
    success: boolean
    result?: CommandGenerationResult
    error?: string
  }> => {
    console.log('[AI IPC] ai:generateCommand 被调用:', { input, context, threadId })
    try {
      const agent = getCommandAgent()
      console.log('[AI IPC] getCommandAgent 返回:', !!agent)

      if (!agent) {
        return {
          success: false,
          error: 'AI 功能未启用或配置无效，请先在设置中配置 AI Provider'
        }
      }

      console.log('[AI IPC] 调用 agent.generate...')
      const result = await agent.generate(input, context, threadId)
      console.log('[AI IPC] agent.generate 返回结果:', result)

      return { success: true, result }
    } catch (error: any) {
      console.error('[AI IPC] AI 生成命令失败:', error)
      return {
        success: false,
        error: error.message || '生成命令时发生错误'
      }
    }
  })

  ipcMain.handle('ai:getConfig', async () => {
    return getAIConfig()
  })

  ipcMain.handle('ai:setConfig', async (_, config: Partial<AIProviderConfig>) => {
    try {
      setAIConfig(config)

      if (commandAgent) {
        const newConfig = getAIConfig()
        commandAgent.updateConfig(newConfig)
      }

      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('ai:testConnection', async () => {
    try {
      const agent = getCommandAgent()

      if (!agent) {
        return {
          success: false,
          error: 'AI 功能未启用或配置无效'
        }
      }

      return await agent.testConnection()
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '连接测试失败'
      }
    }
  })

  ipcMain.handle('ai:resetConfig', async () => {
    try {
      const { resetAIConfig } = await import('./config/provider-config')
      resetAIConfig()
      commandAgent = null
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('ai:clearThread', async () => {
    try {
      if (commandAgent) {
        commandAgent.clearThread()
      }
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
}

export function cleanupAI() {
  commandAgent = null
}