import { ChatOpenAI } from '@langchain/openai'
import { createAgent } from 'langchain'
import { HumanMessage, AIMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import type { AIProviderConfig } from '../config/provider-config'
import { listCommands, validateKeyFormat, generateCommand, getLastOutput } from '../tools/command-tools'
import { systemPrompt } from '../prompts/command-prompts'

// 流式事件类型
export type StreamEvent =
  | { type: 'token'; content: string }
  | { type: 'tool_start'; tool: string }
  | { type: 'tool_end'; tool: string; result: any }
  | { type: 'complete'; finalOutput?: any }
  | { type: 'error'; message: string }

// 命令生成结果结构
export interface CommandGenerationResult {
  command: string
  description: string
  parameters: {
    key?: string
    value?: string
    flags: string[]
  }
  safetyLevel: 'safe' | 'warning' | 'dangerous'
  warnings: string[]
  reasoningProcess?: {
    steps: Array<{
      type: 'thought' | 'tool_call' | 'tool_result' | 'safety_check'
      content: string
      toolName?: string
      toolResult?: any
      timestamp: number
    }>
    summary: string
  }
}

export interface ConnectionContext {
  protocol: string
  host: string
  port: number
  toolPath: string
}

// 修复 fetch 来处理可能的响应问题
const fixedFetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
  const response = await fetch(...args)

  // 流式响应必须保留原始 Response，否则 SSE 会被破坏，导致 LangChain 收不到任何 chunk
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('text/event-stream')) {
    return response
  }

  const text = await response.text()
  let data: any = text
  // 尝试解析 JSON，处理可能的嵌套 JSON 字符串
  while (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch {
      break
    }
  }
  return new Response(JSON.stringify(data), {
    status: response.status,
    statusText: response.statusText,
    headers: { 'content-type': 'application/json' }
  })
}

function extractCommandResult(input: any): CommandGenerationResult | null {
  if (!input) return null

  if (Array.isArray(input)) {
    for (const item of input) {
      const result = extractCommandResult(item)
      if (result) return result
    }
    return null
  }

  if (typeof input === 'object') {
    if (input.command) {
      return {
        command: input.command,
        description: input.description || 'AI 生成的命令',
        parameters: {
          key: input.key || input.parameters?.key,
          value: input.value || input.parameters?.value,
          flags: input.flags || input.parameters?.flags || []
        },
        safetyLevel: input.safetyLevel || 'warning',
        warnings: input.warnings || []
      }
    }

    return extractCommandResult(input.args) ||
      extractCommandResult(input.arguments) ||
      extractCommandResult(input.content) ||
      extractCommandResult(input.kwargs)
  }

  if (typeof input !== 'string') return null

  const text = input.trim()
  if (!text) return null

  try {
    return extractCommandResult(JSON.parse(text))
  } catch {
    // 继续尝试从文本中提取
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      return extractCommandResult(JSON.parse(jsonMatch[0]))
    } catch {
      // 继续尝试旧文本格式
    }
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

  return null
}

export class CommandGenerationAgent {
  private _config: AIProviderConfig
  private _context: ConnectionContext | null = null
  private _threadMessages: BaseMessage[] = []

  constructor(config: AIProviderConfig) {
    this._config = config
  }

  private createModel(): ChatOpenAI {
    const baseUrl = this._config.baseUrl?.trim()

    // 构建 configuration 对象
    const configuration: Record<string, any> = {
      timeout: 30000, // 30秒超时
      fetch: fixedFetch
    }

    if (baseUrl && baseUrl.length > 0) {
      // 使用用户配置的 OpenAI-compatible Base URL，仅移除末尾斜杠
      configuration.baseURL = baseUrl.replace(/\/+$/, '')
    }

    console.log('[AI Agent] 创建 ChatOpenAI 模型:', {
      model: this._config.model,
      baseUrl: configuration.baseURL || 'default',
      timeout: configuration.timeout
    })

    return new ChatOpenAI({
      modelName: this._config.model,
      temperature: this._config.temperature,
      maxTokens: this._config.maxTokens,
      apiKey: this._config.apiKey,
      configuration,
      streaming: true, // 启用流式输出
      streamUsage: false, // 兼容部分 OpenAI-compatible 服务不支持 stream_options.include_usage
      verbose: false
    })
  }

  // 流式生成器方法（v1 版本）
  async *generateStream(
    userInput: string,
    context: ConnectionContext
  ): AsyncGenerator<StreamEvent, void, unknown> {
    try {
      // 检查上下文是否变化
      const contextChanged = !this._context ||
        this._context.protocol !== context.protocol ||
        this._context.host !== context.host ||
        this._context.port !== context.port ||
        this._context.toolPath !== context.toolPath

      if (contextChanged) {
        console.log('[AI Agent] 上下文变化，重置历史')
        this._context = { ...context }
        this._threadMessages = []
      }

      // v1: 使用 createAgent
      const agent = createAgent({
        model: this.createModel(),
        tools: [listCommands, validateKeyFormat, generateCommand, getLastOutput],
        systemPrompt: systemPrompt(context.protocol, context.host, context.port.toString(), context.toolPath)
      })

      // 构建消息列表
      const messages: BaseMessage[] = [
        ...this._threadMessages,
        new HumanMessage(userInput)
      ]

      console.log('[AI Agent] 开始流式生成，消息数:', messages.length)

      // v1: 使用 agent.stream
      const stream = await agent.stream(
        { messages },
        {
          streamMode: ['messages', 'values']
        }
      )

      let accumulatedContent = ''
      let lastCommandResult: CommandGenerationResult | null = null
      const toolCallsMap = new Map<string, boolean>()
      
      // 收集关键分析步骤（简化版，只记录关键节点）
      const keySteps: Array<{
        type: 'tool_call' | 'tool_result' | 'safety_check'
        content: string
        toolName?: string
        timestamp: number
      }> = []

      for await (const chunk of stream) {
        // chunk 是一个数组 [streamMode, data]
        const [streamMode, data] = chunk

        if (streamMode === 'messages' && data) {
          // 处理消息流。LangGraph messages 模式可能返回 [message, metadata]
          const lastMessage = Array.isArray(data) && data.length >= 2 && data[0]?.content !== undefined
            ? data[0]
            : Array.isArray(data)
              ? data[data.length - 1]
              : data
          if (lastMessage) {

            // 检测 Tool 调用开始
            const lastMsgAny = lastMessage as any
            if (lastMsgAny.tool_calls && lastMsgAny.tool_calls.length > 0) {
              for (const toolCall of lastMsgAny.tool_calls) {
                // 只有 generate_command 工具才提取命令结果
                if (toolCall.name === 'generate_command') {
                  const commandResult = extractCommandResult(toolCall)
                  if (commandResult) {
                    lastCommandResult = commandResult
                  }
                }

                if (!toolCallsMap.has(toolCall.id)) {
                  toolCallsMap.set(toolCall.id, true)
                  
                  // 记录工具调用步骤
                  keySteps.push({
                    type: 'tool_call',
                    content: `调用工具: ${toolCall.name}`,
                    toolName: toolCall.name,
                    timestamp: Date.now()
                  })
                  
                  yield {
                    type: 'tool_start',
                    tool: toolCall.name
                  }
                }
              }
            }

            // 输出文本内容。流式 chunk 通常只包含增量 token，而不是累计全文
            if (lastMessage.content && typeof lastMessage.content === 'string') {
              accumulatedContent += lastMessage.content
              
              // 思考内容通过 token 实时流式输出，不单独记录为步骤
              yield {
                type: 'token',
                content: lastMessage.content
              }
            }
          }
        }

        if (streamMode === 'values' && data && data.messages) {
          // 处理 Tool 结果
          const messages = data.messages
          for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i] as any
            if (msg.tool_call_id && msg.content) {
              const result = msg.content
              const toolName = msg.name || 'unknown'

              // 只有 generate_command 工具的结果才提取命令结果
              if (toolName === 'generate_command') {
                const commandResult = extractCommandResult(result)
                if (commandResult) {
                  lastCommandResult = commandResult
                }
              }

              // 记录工具结果步骤
              keySteps.push({
                type: 'tool_result',
                content: `工具 ${toolName} 返回结果`,
                toolName: toolName,
                timestamp: Date.now()
              })

              yield {
                type: 'tool_end',
                tool: toolName,
                result
              }
              break // 只获取最新的 tool result
            }
          }
        }
      }

      // 构建最终输出，包含分析过程
      let finalOutput: any = lastCommandResult || accumulatedContent
      
      // 如果是命令生成结果，附加分析过程
      if (lastCommandResult && typeof lastCommandResult === 'object') {
        // 添加安全评估步骤
        keySteps.push({
          type: 'safety_check',
          content: `安全级别评估: ${lastCommandResult.safetyLevel}`,
          timestamp: Date.now()
        })
        
        finalOutput = {
          ...lastCommandResult,
          reasoningProcess: {
            steps: keySteps,
            summary: this.generateReasoningSummary(keySteps, lastCommandResult)
          }
        }
      }
      
      console.log('[AI Agent] 最终输出:', typeof finalOutput === 'string' ? finalOutput.substring(0, 200) : finalOutput)

      // 流结束
      yield {
        type: 'complete',
        finalOutput
      }

      // 更新对话历史
      this._threadMessages.push(new HumanMessage(userInput))
      this._threadMessages.push(new AIMessage(typeof finalOutput === 'string' ? finalOutput : JSON.stringify(finalOutput)))

      // 限制历史长度（保留最近 20 条）
      if (this._threadMessages.length > 20) {
        this._threadMessages = this._threadMessages.slice(-20)
      }

      console.log('[AI Agent] 流式生成完成')

    } catch (error: any) {
      console.error('[AI Agent] 流式生成失败:', error)
      yield {
        type: 'error',
        message: this.normalizeError(error).message
      }
    }
  }

  // 生成分析过程摘要
  private generateReasoningSummary(
    steps: Array<{ type: string; content: string; toolName?: string }>,
    commandResult: CommandGenerationResult
  ): string {
    const toolCalls = steps.filter(s => s.type === 'tool_call')
    
    let summary = `AI 分析了您的请求，`
    
    if (toolCalls.length > 0) {
      const toolNames = toolCalls.map(s => s.toolName).filter(Boolean)
      summary += `调用了 ${toolCalls.length} 个工具（${toolNames.join('、')}），`
    }
    
    summary += `生成了命令: ${commandResult.command}`
    
    if (commandResult.safetyLevel !== 'safe') {
      summary += `，安全级别: ${commandResult.safetyLevel}`
    }
    
    return summary
  }

  // 保留原有的非流式方法（用于兼容性）
  async generate(
    userInput: string,
    context: ConnectionContext,
    _threadId?: string
  ): Promise<CommandGenerationResult | null> {
    const events: StreamEvent[] = []

    for await (const event of this.generateStream(userInput, context)) {
      events.push(event)
      if (event.type === 'complete' || event.type === 'error') {
        break
      }
    }

    // 解析最终结果
    const completeEvent = events.find(e => e.type === 'complete')
    if (!completeEvent) {
      const errorEvent = events.find(e => e.type === 'error')
      throw new Error(errorEvent?.message || '生成失败')
    }

    // 尝试从事件中解析命令生成结果
    return this.parseStreamEvents(events)
  }

  private parseStreamEvents(events: StreamEvent[]): CommandGenerationResult | null {
    // 尝试解析 generate_command Tool 调用
    for (const event of events) {
      if (event.type === 'tool_end' && event.result) {
        try {
          const result = typeof event.result === 'string'
            ? JSON.parse(event.result)
            : event.result

          // 如果结果是命令生成，返回 CommandGenerationResult
          if (result.command) {
            return {
              command: result.command,
              description: result.description || 'AI 生成的命令',
              parameters: {
                flags: []
              },
              safetyLevel: result.safetyLevel || 'warning',
              warnings: result.warnings || []
            }
          }
        } catch {
          // 解析失败，继续
        }
      }
    }

    // 没有找到 generate_command 结果，说明是文本回复
    // 返回 null 表示这不是命令生成
    return null as any
  }

  private normalizeError(error: any): Error {
    console.error('[AI Agent] 原始错误:', error)
    console.error('[AI Agent] 错误类型:', error?.constructor?.name)

    // 处理超时错误
    if (error?.name === 'TimeoutError' || error?.message?.includes('timed out') || error?.message?.includes('timeout')) {
      return new Error('请求超时，请检查网络连接或稍后重试')
    }
    if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
      return new Error('连接超时，请检查网络或 Base URL 是否正确')
    }
    if (error?.response) {
      const status = error.response.status
      const data = error.response.data
      if (status === 401) return new Error('API Key 无效或已过期')
      if (status === 429) return new Error('请求过于频繁，请稍后重试')
      if (status >= 500) return new Error(`服务器错误 (${status})，请稍后重试`)
      return new Error(`API 错误: ${data?.error?.message || error.message}`)
    }
    if (error?.code === 'ECONNREFUSED') return new Error('无法连接到 API 服务器，请检查网络或 Base URL')
    return new Error(error?.message || '生成命令时发生未知错误')
  }

  updateConfig(config: AIProviderConfig): void {
    this._config = config
    // 配置更新时重置
    this._context = null
    this._threadMessages = []
  }

  clearThread(): void {
    this._threadMessages = []
    // 保留上下文和配置
  }

  getThreadMessages(): BaseMessage[] {
    return [...this._threadMessages]
  }
}

export function createCommandAgent(config: AIProviderConfig): CommandGenerationAgent {
  return new CommandGenerationAgent(config)
}
