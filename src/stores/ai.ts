import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type AIProvider = 'openai' | 'openai-compatible'

export interface AIProviderConfig {
  provider: AIProvider
  apiKey: string
  baseUrl?: string
  model: string
  temperature: number
  maxTokens: number
  enabled: boolean
}

export interface CommandGenerationResult {
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

export type MessageRole = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  timestamp: number
  commandResult?: CommandGenerationResult
  isError?: boolean
}

export const useAIStore = defineStore('ai', () => {
  const config = ref<AIProviderConfig>({
    provider: 'openai',
    apiKey: '',
    baseUrl: '',
    model: 'gpt-4',
    temperature: 0.3,
    maxTokens: 2048,
    enabled: false
  })

  const isGenerating = ref(false)
  const generatedCommand = ref<CommandGenerationResult | null>(null)
  const error = ref<string | null>(null)
  const threadId = ref<string>(`ai-thread-${Date.now()}`)

  // 对话历史
  const messages = ref<ChatMessage[]>([])

  const isEnabled = computed(() => config.value.enabled && config.value.apiKey.length > 0)

  const isValid = computed(() => {
    if (!config.value.enabled) return false
    if (config.value.apiKey.length === 0) return false
    if (config.value.model.length === 0) return false
    if (config.value.provider === 'openai-compatible' && !config.value.baseUrl) return false
    return true
  })

  const recommendedModels = computed(() => {
    switch (config.value.provider) {
      case 'openai':
        return ['gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-3.5-turbo']
      case 'openai-compatible':
        return ['自定义模型']
      default:
        return []
    }
  })

  async function loadConfig() {
    try {
      const saved = await window.api.ai.getConfig()
      if (saved) {
        config.value = { ...config.value, ...saved }
      }
    } catch (err: any) {
      console.error('加载 AI 配置失败:', err)
    }
  }

  async function saveConfig(newConfig: Partial<AIProviderConfig>) {
    try {
      config.value = { ...config.value, ...newConfig }
      const plainConfig = JSON.parse(JSON.stringify(config.value))
      const result = await window.api.ai.setConfig(plainConfig)
      if (!result.success) {
        throw new Error(result.error)
      }
      return true
    } catch (err: any) {
      error.value = err.message
      return false
    }
  }

  async function generateCommand(input: string, context: {
    protocol: string
    host: string
    port: number
    toolPath: string
  }) {
    if (!isValid.value) {
      error.value = 'AI 配置无效或未启用'
      return null
    }

    isGenerating.value = true
    error.value = null
    generatedCommand.value = null

    // 添加用户消息到历史
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: input,
      timestamp: Date.now()
    }
    messages.value.push(userMessage)

    try {
      console.log('[AI Store] 调用 window.api.ai.generateCommand:', { input, context, threadId: threadId.value })
      const result = await window.api.ai.generateCommand({
        input,
        context,
        threadId: threadId.value
      })
      console.log('[AI Store] window.api.ai.generateCommand 返回:', result)

      if (result.success && result.result) {
        generatedCommand.value = result.result

        // 添加AI消息到历史
        const assistantMessage: ChatMessage = {
          id: `msg-${Date.now()}-assistant`,
          role: 'assistant',
          content: result.result.description,
          timestamp: Date.now(),
          commandResult: result.result
        }
        messages.value.push(assistantMessage)

        // 限制历史长度（保留最近 50 条消息）
        if (messages.value.length > 50) {
          messages.value = messages.value.slice(-50)
        }

        return result.result
      } else {
        error.value = result.error || '生成命令失败'
        // 添加错误消息到历史
        const errorMessage: ChatMessage = {
          id: `msg-${Date.now()}-error`,
          role: 'assistant',
          content: result.error || '生成命令失败',
          timestamp: Date.now(),
          isError: true
        }
        messages.value.push(errorMessage)
        return null
      }
    } catch (err: any) {
      error.value = err.message || '生成命令时发生错误'
      // 添加错误消息到历史
      const errorMessage: ChatMessage = {
        id: `msg-${Date.now()}-error`,
        role: 'assistant',
        content: err.message || '生成命令时发生错误',
        timestamp: Date.now(),
        isError: true
      }
      messages.value.push(errorMessage)
      return null
    } finally {
      isGenerating.value = false
    }
  }

  function clearGeneratedCommand() {
    generatedCommand.value = null
    error.value = null
  }

  function resetThread() {
    threadId.value = `ai-thread-${Date.now()}`
    messages.value = []
  }

  function clearMessages() {
    messages.value = []
  }

  function removeMessage(id: string) {
    const index = messages.value.findIndex(m => m.id === id)
    if (index > -1) {
      messages.value.splice(index, 1)
    }
  }

  return {
    config,
    isGenerating,
    generatedCommand,
    error,
    threadId,
    messages,
    isEnabled,
    isValid,
    recommendedModels,
    loadConfig,
    saveConfig,
    generateCommand,
    clearGeneratedCommand,
    resetThread,
    clearMessages,
    removeMessage
  }
})