import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  AIProviderConfig,
  CommandGenerationResult,
  ChatMessage,
  ConnectionContext,
  CommandExecutionResult
} from '../../types/ai'

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
  const isStreaming = ref(false)
  const currentStreamText = ref('')
  const currentTool = ref<string | null>(null)
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

  // 流式发送消息（v2 新增）
  async function sendMessageStream(
    input: string,
    context: ConnectionContext,
    onStream?: (text: string, isComplete: boolean) => void
  ): Promise<CommandGenerationResult | null> {
    if (!isValid.value) {
      error.value = 'AI 配置无效或未启用'
      return null
    }

    isStreaming.value = true
    isGenerating.value = true
    currentStreamText.value = ''
    currentTool.value = null
    error.value = null
    generatedCommand.value = null

    // 添加用户消息到历史
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      type: 'text',
      content: input,
      timestamp: Date.now()
    }
    messages.value.push(userMessage)

    // 创建 AI 消息占位（流式填充）
    const aiMessageId = `msg-${Date.now()}-assistant`
    messages.value.push({
      id: aiMessageId,
      role: 'assistant',
      type: 'text',
      content: '',
      isStreaming: true,
      timestamp: Date.now()
    })

    return new Promise((resolve) => {
      let accumulatedText = ''
      let finalResult: CommandGenerationResult | null = null
      let toolCommandResult: CommandGenerationResult | null = null

      const cancelFn = window.api.ai.chatStream(
        { input, context, threadId: threadId.value },
        (event) => {
          console.log('[AI Store] 收到流式事件:', event.type)

          switch (event.type) {
            case 'token':
              accumulatedText += event.content
              currentStreamText.value = accumulatedText

              // 更新消息内容
              const msg = messages.value.find(m => m.id === aiMessageId)
              if (msg) {
                msg.content = accumulatedText
              }

              // 回调通知 UI 更新
              onStream?.(accumulatedText, false)
              break

            case 'tool_start':
              currentTool.value = event.tool || null
              console.log('[AI Store] Tool 调用开始:', event.tool)
              break

            case 'tool_end':
              currentTool.value = null
              console.log('[AI Store] Tool 调用完成:', event.tool, event.result)
              // 只有 generate_command 工具的返回才解析为命令结果
              if (event.tool === 'generate_command' && event.result) {
                const parsedToolResult = typeof event.result === 'object' && 'command' in event.result
                  ? normalizeCommandResult(event.result)
                  : parseFinalOutput(String(event.result))
                if (parsedToolResult) {
                  toolCommandResult = parsedToolResult
                }
              }
              break

            case 'complete':
               console.log('[AI Store] complete:')
              isStreaming.value = false
              isGenerating.value = false

              // 优先使用后端返回的结构化 finalOutput，避免纯工具调用时没有 token 导致界面空白
              if (event.isCommandResult && event.finalOutput && typeof event.finalOutput === 'object' && 'command' in event.finalOutput) {
                finalResult = normalizeCommandResult(event.finalOutput)
              } else if (toolCommandResult) {
                finalResult = toolCommandResult
              } else {
                const finalText = typeof event.finalOutput === 'string' ? event.finalOutput : accumulatedText
                if (!accumulatedText && finalText) {
                  accumulatedText = finalText
                }
                finalResult = parseFinalOutput(accumulatedText)
              }
              generatedCommand.value = finalResult

              // 更新消息为最终状态
              const finalMsg = messages.value.find(m => m.id === aiMessageId)
              if (finalMsg) {
                finalMsg.isStreaming = false
                // 只有当 command 不为空时才显示为命令卡片
                if (finalResult && finalResult.command) {
                  finalMsg.type = 'command'
                  finalMsg.commandResult = finalResult
                  // 保留思考文本，不覆盖为 description
                  // finalMsg.content 保持为 accumulatedText（AI 的思考过程）
                  // 保存分析过程
                  if (finalResult.reasoningProcess) {
                    finalMsg.reasoningProcess = finalResult.reasoningProcess
                  }
                } else {
                  finalMsg.type = 'text'
                  finalMsg.content = accumulatedText || '已完成'
                }
              }

              // 限制历史长度
              if (messages.value.length > 50) {
                messages.value = messages.value.slice(-50)
              }

              onStream?.(accumulatedText, true)
              cancelFn?.()
              resolve(finalResult)
              break

            case 'error':
              isStreaming.value = false
              isGenerating.value = false
              error.value = event.message || '未知错误'

              // 更新消息为错误状态
              const errorMsg = messages.value.find(m => m.id === aiMessageId)
              if (errorMsg) {
                errorMsg.isStreaming = false
                errorMsg.type = 'error'
                errorMsg.content = event.message || '未知错误'
                errorMsg.isError = true
              }

              cancelFn?.()
              resolve(null)
              break
          }
        }
      )
    })
  }

  function normalizeCommandResult(result: any): CommandGenerationResult {
    return {
      command: result.command,
      description: result.description || 'AI 生成的命令',
      parameters: {
        key: result.key,
        value: result.value,
        flags: result.flags || result.parameters?.flags || []
      },
      safetyLevel: result.safetyLevel || 'warning',
      warnings: result.warnings || [],
      reasoningProcess: result.reasoningProcess
    }
  }

  // 解析最终输出
  function parseFinalOutput(text: string): CommandGenerationResult | null {
    // 尝试从文本中提取 generate_command 的 JSON 结果
    try {
      const jsonMatch = text.match(/\{[\s\S]*?"command"[\s\S]*?\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        // 排除 get_last_output 的返回结构（含 stdout/stderr/exitCode 字段）
        if (parsed.command && !parsed.stdout && !parsed.stderr && parsed.exitCode === undefined) {
          return {
            command: parsed.command,
            description: parsed.description || 'AI 生成的命令',
            parameters: {
              key: parsed.key,
              value: parsed.value,
              flags: parsed.flags || []
            },
            safetyLevel: parsed.safetyLevel || 'warning',
            warnings: parsed.warnings || []
          }
        }
      }
    } catch {
      // 解析失败，返回文本回复
    }

    const commandMatch = text.match(/命令已生成[:：]\s*(.+)/)
    if (commandMatch) {
      const descriptionMatch = text.match(/描述[:：]\s*(.+)/)
      const safetyMatch = text.match(/安全级别[:：]\s*(safe|warning|dangerous)/)
      return {
        command: commandMatch[1].trim(),
        description: descriptionMatch?.[1]?.trim() || 'AI 生成的命令',
        parameters: { flags: [] },
        safetyLevel: (safetyMatch?.[1] as CommandGenerationResult['safetyLevel']) || 'warning',
        warnings: []
      }
    }

    // 如果不是命令，返回 null（表示是纯文本回复）
    return null
  }

  // 保留的非流式方法（向后兼容）
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

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      type: 'text',
      content: input,
      timestamp: Date.now()
    }
    messages.value.push(userMessage)

    try {
      const result = await window.api.ai.generateCommand({
        input,
        context,
        threadId: threadId.value
      })

      if (result.success && result.result) {
        const commandResult: CommandGenerationResult = {
          command: result.result.command,
          description: result.result.description,
          parameters: {
            key: result.result.parameters?.key,
            value: result.result.parameters?.value,
            flags: result.result.parameters?.flags || []
          },
          safetyLevel: result.result.safetyLevel,
          warnings: result.result.warnings
        }
        generatedCommand.value = commandResult

        const assistantMessage: ChatMessage = {
          id: `msg-${Date.now()}-assistant`,
          role: 'assistant',
          content: commandResult.description,
          type: 'command',
          commandResult: commandResult,
          timestamp: Date.now()
        }
        messages.value.push(assistantMessage)

        if (messages.value.length > 50) {
          messages.value = messages.value.slice(-50)
        }

        return result.result
      } else {
        error.value = result.error || '生成命令失败'
        const errorMessage: ChatMessage = {
          id: `msg-${Date.now()}-error`,
          role: 'assistant',
          content: result.error || '生成命令失败',
          type: 'error',
          isError: true,
          timestamp: Date.now()
        }
        messages.value.push(errorMessage)
        return null
      }
    } catch (err: any) {
      error.value = err.message || '生成命令时发生错误'
      const errorMessage: ChatMessage = {
        id: `msg-${Date.now()}-error`,
        role: 'assistant',
        content: err.message || '生成命令时发生错误',
        type: 'error',
        isError: true,
        timestamp: Date.now()
      }
      messages.value.push(errorMessage)
      return null
    } finally {
      isGenerating.value = false
    }
  }

  // 保存命令执行结果
  async function saveExecutionResult(result: CommandExecutionResult) {
    try {
      await window.api.ai.saveExecutionResult(result)
      console.log('[AI Store] 已保存执行结果')
    } catch (err: any) {
      console.error('[AI Store] 保存执行结果失败:', err)
    }
  }

  function clearGeneratedCommand() {
    generatedCommand.value = null
    error.value = null
  }

  function resetThread() {
    threadId.value = `ai-thread-${Date.now()}`
    messages.value = []
    currentStreamText.value = ''
    currentTool.value = null
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
    isStreaming,
    currentStreamText,
    currentTool,
    generatedCommand,
    error,
    threadId,
    messages,
    isEnabled,
    isValid,
    recommendedModels,
    loadConfig,
    saveConfig,
    sendMessageStream,
    generateCommand,
    saveExecutionResult,
    clearGeneratedCommand,
    resetThread,
    clearMessages,
    removeMessage
  }
})
