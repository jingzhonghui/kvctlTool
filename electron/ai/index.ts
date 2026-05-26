import { ipcMain } from 'electron'
import { CommandGenerationAgent, CommandGenerationResult, ConnectionContext } from './agents/command-agent'
import { setLastExecutionResult, CommandExecutionResult } from './tools/command-tools'
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
  // 流式对话接口（v2 新增）
  ipcMain.on('ai:chatStream', async (event, {
    input,
    context,
    threadId
  }: {
    input: string
    context: ConnectionContext
    threadId?: string
  }) => {
    console.log('[AI IPC] ai:chatStream 被调用:', { input: input.substring(0, 50), context, threadId })

    const agent = getCommandAgent()
    if (!agent) {
      console.log('[AI IPC] AI 未配置，返回错误')
      event.reply('ai:stream:error', {
        message: 'AI 功能未启用或配置无效，请先在设置中配置 AI Provider'
      })
      return
    }

    try {
      const stream = agent.generateStream(input, context)

      for await (const chunk of stream) {
        console.log('[AI IPC] 流式 chunk:', chunk.type, chunk.type === 'token' ? chunk.content?.substring(0, 20) : '')
        event.reply('ai:stream:chunk', chunk)

        if (chunk.type === 'complete' || chunk.type === 'error') {
          break
        }
      }
    } catch (error: any) {
      console.error('[AI IPC] 流式输出失败:', error)
      event.reply('ai:stream:error', {
        message: error.message || '流式输出失败'
      })
    }
  })

  // 保留原有的非流式接口（向后兼容）
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

      // result 可能为 null（当 AI 输出文本而非命令时）
      if (result) {
        return { success: true, result }
      } else {
        return { 
          success: true, 
          result: {
            command: '',
            description: 'AI 已回复',
            parameters: { flags: [] },
            safetyLevel: 'safe' as const,
            warnings: []
          }
        }
      }
    } catch (error: any) {
      console.error('[AI IPC] AI 生成命令失败:', error)
      return {
        success: false,
        error: error.message || '生成命令时发生错误'
      }
    }
  })

  // 保存命令执行结果（供 AI Tool 获取）
  ipcMain.handle('ai:saveExecutionResult', async (_, result: CommandExecutionResult) => {
    try {
      setLastExecutionResult(result)
      console.log('[AI IPC] 已保存执行结果:', { command: result.command, exitCode: result.exitCode })
      return { success: true }
    } catch (error: any) {
      console.error('[AI IPC] 保存执行结果失败:', error)
      return { success: false, error: error.message }
    }
  })

  // 获取上次执行结果
  ipcMain.handle('ai:getLastOutput', async () => {
    const { getLastExecutionResult } = await import('./tools/command-tools')
    const result = getLastExecutionResult()
    console.log('[AI IPC] getLastOutput:', result ? '有数据' : '无数据')
    return result
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
