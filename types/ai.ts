/**
 * AI Agent 共享类型定义
 * 前后端共用
 */

// 流式事件类型
export type StreamEvent =
  | { type: 'token'; content: string }
  | { type: 'tool_start'; tool: string }
  | { type: 'tool_end'; tool: string; result: any }
  | { type: 'complete'; finalOutput?: any }
  | { type: 'error'; message: string }

// 命令生成结果
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

// 连接上下文
export interface ConnectionContext {
  protocol: string
  host: string
  port: number
  toolPath: string
}

// 命令执行结果
export interface CommandExecutionResult {
  command: string
  stdout: string
  stderr: string
  exitCode: number
  duration: number
  timestamp: number
}

// AI Provider 配置
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

// AI 响应类型
export interface TextResponse {
  type: 'text'
  content: string
}

export interface ErrorResponse {
  type: 'error'
  message: string
}

export type AIResponse = CommandGenerationResult | TextResponse | ErrorResponse

// 聊天消息
export type MessageRole = 'user' | 'assistant'
export type MessageType = 'text' | 'command' | 'error'

export interface ChatMessage {
  id: string
  role: MessageRole
  type: MessageType
  content: string
  commandResult?: CommandGenerationResult
  isStreaming?: boolean
  isError?: boolean
  timestamp: number
}

// 会话分段
export interface ConversationSegment {
  id: string
  messages: ChatMessage[]
  commandContext?: {
    generatedCommand?: string
    executionResult?: CommandExecutionResult
  }
  createdAt: number
}

// 流式状态
export interface StreamState {
  status: 'idle' | 'streaming' | 'tool_calling' | 'error'
  text: string
  currentTool?: string
}
