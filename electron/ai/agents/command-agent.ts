import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, AIMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import type { AIProviderConfig } from '../config/provider-config'
import { listCommands, validateKeyFormat, generateCommand } from '../tools/command-tools'
import { createAgent } from 'langchain'
import { systemPrompt } from '../prompts/command-prompts'

// 定义命令生成结果的结构
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

export class CommandGenerationAgent {
  private agent: any = null
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
      // 确保 baseURL 以 /v1 结尾（OpenAI 标准）
      let normalizedUrl = baseUrl.replace(/\/+$/, '')
      if (!normalizedUrl.endsWith('/v1')) {
        normalizedUrl = `${normalizedUrl}/v1`
      }
      configuration.baseURL = normalizedUrl
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
      verbose: false
    })
  }

  private createAgent(): any {
    const chatModel = this.createModel()

    return createAgent({
      // llm: chatModel,
      model:chatModel,
      tools: [listCommands, validateKeyFormat, generateCommand]
    })
  }

  private buildSystemPrompt(context: ConnectionContext): string {
    return systemPrompt(context.protocol,context.host,context.port.toString(),context.toolPath)
  }

  private buildMessage(context: ConnectionContext,_threadId?: string): any[] {
    const contextChanged = !this._context ||
        this._context.protocol !== context.protocol ||
        this._context.host !== context.host ||
        this._context.port !== context.port ||
        this._context.toolPath !== context.toolPath

      // 如果上下文变化或 Agent 未创建，重新创建
      if (contextChanged || !this.agent) {
        console.log('[AI Agent] 创建新的 Agent 实例')
        this.agent = this.createAgent()
        this._context = { ...context }
        // 上下文变化时清空历史
        this._threadMessages = []
      }

      // 构建系统提示词
      const systemPrompt = this.buildSystemPrompt(context)

      // 构建消息列表
      const messages: any[] = [
        { role: 'system', content: systemPrompt }
      ]

      // 添加历史消息
      if (this._threadMessages.length > 0) {
        for (const msg of this._threadMessages) {
          if (msg instanceof HumanMessage) {
            messages.push({ role: 'user', content: msg.content })
          } else if (msg instanceof AIMessage) {
            messages.push({ role: 'assistant', content: msg.content })
          }
        }
      }

      return messages
  }

  async generate(
    userInput: string,
    context: ConnectionContext,
    _threadId?: string
  ): Promise<CommandGenerationResult> {
    try {
      
      //构造输入
      const messages = this.buildMessage(context,_threadId)
      // 添加当前用户输入
      messages.push({ role: 'user', content: userInput })

      // 调用 Agent
      const result = await this.agent.invoke({ messages })

      console.log('[AI Agent] Agent 响应完成，消息数:', result.messages.length)

      // 解析 Agent 输出
      const parsedResult = this.parseAgentOutput(result.messages)

      // 更新对话历史
      this._threadMessages.push(new HumanMessage(userInput))
      // 存储最后一条 AI 回复
      const lastMessage = result.messages[result.messages.length - 1]
      if (lastMessage.content) {
        this._threadMessages.push(new AIMessage(lastMessage.content))
      }

      // 限制历史长度（保留最近 20 条）
      if (this._threadMessages.length > 20) {
        this._threadMessages = this._threadMessages.slice(-20)
      }

      return parsedResult
    } catch (error: any) {
      console.error('[AI Agent] 生成命令失败:', error)
      throw this.normalizeError(error)
    }
  }

  private parseAgentOutput(messages: any[]): CommandGenerationResult {
    // 查找 generate_command 工具调用
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
        for (const toolCall of msg.tool_calls) {
          if (toolCall.name === 'generate_command') {
            try {
              const args = typeof toolCall.args === 'string'
                ? JSON.parse(toolCall.args)
                : toolCall.args

              return {
                command: args.command || '',
                description: args.description || '未提供描述',
                parameters: {
                  flags: []
                },
                safetyLevel: args.safetyLevel || 'warning',
                warnings: args.warnings || []
              }
            } catch (e) {
              console.warn('[AI Agent] 解析 generate_command 参数失败:', e)
            }
          }
        }
      }
    }

    // 如果没有找到工具调用，尝试从最后一条消息提取
    const lastMessage = messages[messages.length - 1]
    if (lastMessage && lastMessage.content) {
      const content = typeof lastMessage.content === 'string'
        ? lastMessage.content
        : JSON.stringify(lastMessage.content)

      // 尝试提取 JSON
      const jsonMatch = content.match(/\{[\s\S]*?\}/)
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0])
          if (parsed.command) {
            return {
              command: parsed.command,
              description: parsed.description || 'AI 生成的命令',
              parameters: {
                key: parsed.parameters?.key,
                value: parsed.parameters?.value,
                flags: parsed.parameters?.flags || []
              },
              safetyLevel: parsed.safetyLevel || 'warning',
              warnings: parsed.warnings || ['未使用标准工具输出']
            }
          }
        } catch {
          // JSON 解析失败，继续处理
        }
      }

      // 尝试从文本中提取命令
      const commandMatch = content.match(/`{1,3}([^`]+)`/)
      if (commandMatch) {
        return {
          command: commandMatch[1].trim(),
          description: 'AI 从回复中提取的命令',
          parameters: { flags: [] },
          safetyLevel: 'warning',
          warnings: ['自动提取的命令，请仔细验证']
        }
      }
    }

    // 默认返回
    return {
      command: '',
      description: '无法解析 Agent 输出',
      parameters: { flags: [] },
      safetyLevel: 'warning',
      warnings: ['Agent 未生成有效命令']
    }
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
    // 配置更新时重置 Agent 和历史
    this.agent = null
    this._context = null
    this._threadMessages = []
  }

  clearThread(): void {
    this._threadMessages = []
    // 保留 Agent 实例，只清空历史
  }
}

export function createCommandAgent(config: AIProviderConfig): CommandGenerationAgent {
  return new CommandGenerationAgent(config)
}
