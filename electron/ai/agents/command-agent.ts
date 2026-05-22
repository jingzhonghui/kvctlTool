import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import type { AIProviderConfig } from '../config/provider-config'
import { listCommands, validateKeyFormat, generateCommand } from '../tools/command-tools'
import { createAgent } from 'langchain'

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
    return `你是 craftctl 命令行工具的专家助手。

craftctl 是一个用于操作分布式 KV 存储的命令行工具。

## 当前连接配置
- 协议: ${context.protocol}
- 地址: ${context.host}:${context.port}
- 工具路径: ${context.toolPath}

## 可用命令
1. get <key> [options] - 查询指定 key 的值
   选项：--prefix（前缀查询），--keys-only（只返回 key）

2. put <key> <value> - 存储 key-value

3. del <key> - 删除指定 key

4. member list - 查询集群成员列表

## Key 格式要求
- 必须以 "/" 开头
- 只能包含字母、数字、下划线、连字符、点号和斜杠

## 安全级别说明
- safe: 只读操作（如 get）
- warning: 单条数据修改（如 put/del 单个 key）
- dangerous: 批量操作或前缀删除（如 del --prefix）

## 你的工作流程
1. 如果需要了解可用命令，调用 list_commands 工具
2. 如果需要验证 key 格式，调用 validate_key_format 工具
3. 当你理解用户意图后，**必须**调用 generate_command 工具输出最终结果

## 命令生成规范
完整命令格式: {toolPath} -e {protocol}://{host}:{port} <command>

重要：请始终以 generate_command 工具调用来结束对话，输出最终命令。`
  }

  async generate(
    userInput: string,
    context: ConnectionContext,
    _threadId?: string
  ): Promise<CommandGenerationResult> {
    try {
      const contextChanged = !this._context ||
        this._context.protocol !== context.protocol ||
        this._context.host !== context.host ||
        this._context.port !== context.port ||
        this._context.toolPath !== context.toolPath

      console.log('[AI Agent] 检查 Agent 状态:', {
        contextChanged,
        hasAgent: !!this.agent,
        input: userInput
      })

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

      // 添加当前用户输入
      messages.push({ role: 'user', content: userInput })

      console.log('[AI Agent] 调用 Agent，消息数:', messages.length)

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

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const model = this.createModel()

      console.log('[AI Agent] 测试连接...')

      // 使用简单的 invoke 测试连接
      const response = await model.invoke([
        new SystemMessage('你是一个有帮助的助手。'),
        new HumanMessage('Hello, this is a connection test. Please respond with "OK".')
      ])

      if (response.content) {
        console.log('[AI Agent] 连接测试成功')
        return { success: true }
      }
      return { success: false, error: '返回内容为空' }
    } catch (error: any) {
      console.error('[AI Agent] 连接测试失败:', error)
      // 处理超时错误
      if (error.name === 'TimeoutError' || error.message?.includes('timed out') || error.message?.includes('timeout')) {
        return { success: false, error: '请求超时，请检查网络连接' }
      }
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return { success: false, error: '连接超时，请检查网络或 Base URL 是否正确' }
      }
      if (error.response) {
        const status = error.response.status
        const data = error.response.data
        if (status === 401) return { success: false, error: 'API Key 无效或已过期' }
        if (status === 429) return { success: false, error: '请求过于频繁，请稍后重试' }
        if (status >= 500) return { success: false, error: `服务器错误 (${status})` }
        return { success: false, error: data?.error?.message || `API 错误 (${status})` }
      }
      if (error.code === 'ECONNREFUSED') return { success: false, error: '无法连接到 API 服务器，请检查 Base URL' }
      return { success: false, error: error.message || '连接测试失败' }
    }
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
