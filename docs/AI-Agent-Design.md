# AI Agent 功能设计方案

## 1. 设计目标

为 kvctlTool 添加智能 AI Agent 功能，支持自然语言交互、命令生成、输出分析和错误诊断，打造对话式 KV 运维体验：

- **流式对话体验**：支持多轮对话，AI 具备上下文记忆能力，响应实时流式输出
- **智能意图识别**：自动判断用户需要生成命令、分析输出还是自由对话
- **Tool 辅助分析**：通过 Tool 获取命令执行结果，无需用户手动复制
- **会话自动分段**：每次执行命令后自动开启新会话，保持对话清晰
- **上下文压缩**：智能管理历史记录，避免 token 溢出

## 2. 技术选型

| 组件 | 技术方案 | 说明 |
|-----|---------|------|
| AI 框架 | LangChain.js v1 + LangGraph v1 | `createAgent` (v1 新接口) |
| Provider 支持 | @langchain/openai | 支持 OpenAI 及兼容协议 |
| Agent 类型 | ReAct Agent (`createAgent`) | 支持 Tool 调用和流式输出 |
| 流式传输 | IPC EventEmitter | Token 级实时流式 |
| 配置存储 | electron-store | 本地加密存储 |

### 2.1 LangChain v1 接口变更

| v0 (旧) | v1 (新) |
|---------|---------|
| `createReactAgent` from `@langchain/langgraph/prebuilts` | `createAgent` from `langchain` |
| `prompt` 参数 | `systemPrompt` 参数 |
| `agent.invoke()` | `agent.stream()` for 流式输出 |

## 3. 架构设计

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                       用户交互层 (Vue)                               │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  AICommandPanel.vue                                            │ │
│  │  ├─ 对话式聊天界面（流式显示 AI 响应）                         │ │
│  │  ├─ 命令生成卡片（可执行/可忽略）                              │ │
│  │  ├─ 分析结果展示（Markdown 文本）                              │ │
│  │  ├─ Tool 调用状态提示（🔧 获取数据中...）                      │ │
│  │  ├─ 快捷示例按钮                                              │ │
│  │  └─ 清空对话/重置上下文                                       │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                              │                                       │
│                              ▼ IPC (EventEmitter)                    │
├─────────────────────────────────────────────────────────────────────┤
│                 LangChain ReAct Agent 层 (Electron Main)            │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  CommandGenerationAgent (ReAct Agent v1)                     │ │
│  │  ├─ ChatModel (OpenAI/兼容)                                  │ │
│  │  ├─ System Prompt (v1: systemPrompt 参数)                    │ │
│  │  ├─ Tool Registry:                                           │ │
│  │  │   ├─ list_commands       - 列出可用命令                   │ │
│  │  │   ├─ validate_key_format - 验证 key 格式                  │ │
│  │  │   ├─ generate_command    - 输出命令结果                   │ │
│  │  │   └─ get_last_output     - 获取上次执行结果               │ │
│  │  ├─ 流式生成器 (generateStream)                              │ │
│  │  │   └── AsyncGenerator<StreamEvent>                         │ │
│  │  └─ 上下文管理（历史/压缩/分段）                              │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                              │                                       │
│                              ▼                                       │
│  流式事件类型：                                                      │
│  - token: LLM 输出文本片段                                           │
│  - tool_start: 开始调用 Tool                                         │
│  - tool_end: Tool 调用完成                                           │
│  - complete: 流结束                                                  │
│  - error: 错误                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 流式输出流程

```
用户输入: "分析一下输出"
    │
    ▼
┌────────────────────────────────────────────────────────┐
│  AI Agent 流式处理 (v1)                                 │
│  const stream = await agent.stream(                    │
│    { messages },                                       │
│    { streamMode: ['messages', 'values'] }              │
│  )                                                     │
└────────────────────────────────────────────────────────┘
    │
    ├── [token] "我来" → IPC → 前端显示 "我来"
    ├── [token] "帮您" → IPC → 前端显示 "我来帮您"
    ├── [token] "分析" → IPC → 前端显示 "我来帮您分析"
    │
    ├── [tool_start] get_last_output
    │       ↓
    │   前端显示: 🔧 获取数据中...
    │       ↓
    │   调用 Tool 获取执行结果
    │       ↓
    ├── [tool_end] { stdout, stderr, exitCode }
    │
    ├── [token] "从" → IPC → 前端继续累加显示
    ├── [token] "输出" → IPC → 前端继续累加显示
    ├── [token] "结果" → IPC → 前端继续累加显示
    │   ... (持续流式直到完成)
    │
    └── [complete] → 流结束，前端完成渲染
```

### 3.3 意图识别流程

```
用户输入
    │
    ▼
┌────────────────────────────────────────────────────────┐
│  AI Agent 意图识别                                      │
│  System Prompt: "你是 craftctl 专家助手..."            │
└────────────────────────────────────────────────────────┘
    │
    ├── 生成命令意图 ──→ 调用 list_commands → generate_command
    │                      （如："查询 /app/config"）
    │
    ├── 分析输出意图 ──→ 调用 get_last_output → 流式分析回复
    │                      （如："分析输出"、"为什么报错"）
    │
    ├── 总结结果意图 ──→ 调用 get_last_output → 流式总结回复
    │                      （如："总结一下"、"提取关键信息"）
    │
    └── 自由对话意图 ──→ 直接流式回复
                           （如："什么是 member list"、"help"）
```

## 4. 核心流程

### 4.1 命令生成 + 流式输出流程

```
用户: "查询所有以 /app 开头的配置"
    │
    ▼
AI [流式]: "我来帮您查询..." → 逐字显示
    │
    ▼
AI: 调用 list_commands (内部 Tool，不显示给用户)
    │
    ▼
AI [流式]: "建议命令：get /app --prefix" → 继续流式
    │
    ▼
AI: 调用 generate_command Tool
    │
    ▼
展示命令卡片（流式结束）
    │
    ▼
用户点击 [执行]
    │
    ▼
执行命令 ──→ 输出显示在终端
    │
    ▼
(命令执行后，AI 会话自动分段，记忆保留)
```

### 4.2 输出分析 + 流式输出流程

```
(命令已执行，终端显示 stderr 错误信息)
    │
用户: "分析错误" 或 "为什么报错了"
    │
    ▼
AI [流式]: "我来分析..." → 逐字显示
    │
    ▼
AI: 调用 get_last_output Tool
    │       前端显示: 🔧 获取数据中...
    │       ↓
    │   获取: { stdout, stderr, exitCode, command, duration }
    │
    ▼
AI [流式]: "错误原因是连接超时 (exitCode: 1)。
           错误信息: 'context deadline exceeded'。
           可能原因:
           1. 网络连接问题
           2. etcd 服务未启动
           3. 防火墙阻挡
           建议检查..."
           → 持续流式输出完整分析
    │
    ▼
展示分析结果（纯文本，无执行按钮）
    │
    ▼
用户可继续追问: "怎么检查服务状态？"
    │
    ▼
AI [流式]: 基于上下文回复 → 生成新的检查命令
```

### 4.3 手动粘贴分析 + 流式输出流程

```
用户: 复制输出到输入框
    "Error: rpc error: code = Unavailable desc = etcdserver: not leader"
    │
    ▼
用户提问: "这个错误是什么意思？"
    │
    ▼
AI [流式]: "这个错误表示 etcd 集群当前没有 Leader，
           可能原因：
           1. 集群节点多数不可用
           2. 网络分区
           3. Leader 选举中
           建议: 检查 member list 查看节点状态"
           → 持续流式输出（无需 Tool 调用）
```

## 5. 模块设计

### 5.1 文件结构

```
electron/
├── ai/
│   ├── config/
│   │   └── provider-config.ts       # Provider 配置管理
│   ├── agents/
│   │   └── command-agent.ts         # ReAct Agent v1 实现 + 流式生成器
│   ├── tools/
│   │   └── command-tools.ts         # Tool 定义（含 get_last_output）
│   ├── prompts/
│   │   └── command-prompts.ts       # System Prompt 模板
│   └── index.ts                     # AI 模块入口 + IPC 流式处理
types/
└── ai.ts                            # 共享类型定义（含 StreamEvent）
```

### 5.2 System Prompt 设计（v1 版本）

```typescript
const SYSTEM_PROMPT = `你是 craftctl/etcdctl 命令行工具的专家助手，支持多种交互模式。

## 当前连接配置
- 协议: {protocol}
- 地址: {host}:{port}
- 工具路径: {toolPath}

## 你的能力

### 1. 命令生成模式
当用户描述想执行的操作时：
- 如果需要，调用 list_commands 了解可用命令
- 如果需要，调用 validate_key_format 验证 key 格式
- 最终调用 generate_command 工具输出命令

### 2. 输出分析模式
当用户询问"分析输出"、"为什么报错"、"解释结果"时：
- 调用 get_last_output 获取最近一次命令执行结果
- 分析 stdout/stderr/exitCode
- 直接回复分析结果（文本形式，不调用工具）

### 3. 总结模式
当用户说"总结一下"、"提取关键信息"时：
- 调用 get_last_output 获取执行结果
- 生成简洁的总结报告

### 4. 自由对话模式
回答 craftctl/etcdctl 相关问题、提供建议、解释概念。

## 可用命令参考
1. get <key> [--prefix] [--keys-only] - 查询 key
2. put <key> <value> - 存储 key-value  
3. del <key> [--prefix] - 删除 key（支持前缀批量删除）
4. member list - 查询集群成员

## Key 格式规则
- 必须以 "/" 开头
- 只能包含字母、数字、下划线、连字符、点号、斜杠

## 安全级别
- safe: 只读操作（get）
- warning: 单条数据修改（put/del 单个 key）
- dangerous: 批量操作（del --prefix）

## 上下文管理
- 每次执行命令后会话自动分段
- 保留最近对话历史，支持多轮追问
- 输出过长时会提示 token 限制`
```

### 5.3 Tool 定义

```typescript
// 原有 Tools
list_commands: 列出可用命令
validate_key_format: 验证 key 格式  
generate_command: 生成命令（返回 CommandGenerationResult）

// 新增 Tool
get_last_output: 获取最近一次命令执行结果
  - 返回: { command, stdout, stderr, exitCode, duration, timestamp }
  - 场景: AI 主动获取输出进行分析
  - 边界: 如果无执行记录，返回 "暂无命令执行记录"
```

### 5.4 流式事件类型定义

```typescript
// 流式事件类型（IPC 传输）
type StreamEvent = 
  | { type: 'token'; content: string }                    // LLM 输出文本片段
  | { type: 'tool_start'; tool: string }                  // 开始调用 Tool
  | { type: 'tool_end'; tool: string; result: any }       // Tool 调用完成
  | { type: 'complete'; finalOutput?: any }               // 流结束
  | { type: 'error'; message: string }                    // 错误

// Agent 输出类型（非流式，用于最终解析）
interface CommandGenerationResult {
  type: 'command'
  command: string
  description: string
  parameters: { key?: string; value?: string; flags: string[] }
  safetyLevel: 'safe' | 'warning' | 'dangerous'
  warnings: string[]
}

interface TextResponse {
  type: 'text'
  content: string  // Markdown 格式
}

interface ErrorResponse {
  type: 'error'
  message: string
}

type AIResponse = CommandGenerationResult | TextResponse | ErrorResponse
```

### 5.5 Agent 流式生成器实现（v1）

```typescript
// electron/ai/agents/command-agent.ts

import { ChatOpenAI } from '@langchain/openai'
import { createAgent } from 'langchain'  // v1 新接口
import { HumanMessage, AIMessage } from '@langchain/core/messages'

export class CommandGenerationAgent {
  private agent: any = null
  private _config: AIProviderConfig
  private _threadMessages: BaseMessage[] = []

  // 流式生成器方法
  async *generateStream(
    userInput: string,
    context: ConnectionContext
  ): AsyncGenerator<StreamEvent, void, unknown> {
    
    // v1: 使用 createAgent 替代 createReactAgent
    const agent = createAgent({
      model: this.createModel(),
      tools: [listCommands, validateKeyFormat, generateCommand, getLastOutput],
      systemPrompt: this.buildSystemPrompt(context)  // v1: systemPrompt 参数
    })
    
    // v1: 使用 agent.stream 替代 invoke
    const stream = await agent.stream(
      { 
        messages: [
          ...this._threadMessages,
          new HumanMessage(userInput)
        ] 
      },
      { 
        streamMode: ['messages', 'values']  // 获取消息流和状态值
      }
    )
    
    for await (const chunk of stream) {
      // 处理消息流
      if (chunk.messages && chunk.messages.length > 0) {
        const lastMessage = chunk.messages[chunk.messages.length - 1]
        
        // 检测 Tool 调用
        if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
          for (const toolCall of lastMessage.tool_calls) {
            yield {
              type: 'tool_start',
              tool: toolCall.name
            }
          }
        }
        
        // 输出文本内容
        if (lastMessage.content && typeof lastMessage.content === 'string') {
          yield {
            type: 'token',
            content: lastMessage.content
          }
        }
      }
      
      // 处理 Tool 结果
      if (chunk.values && chunk.values.toolResults) {
        for (const result of chunk.values.toolResults) {
          yield {
            type: 'tool_end',
            tool: result.tool,
            result: result.output
          }
        }
      }
    }
    
    // 流结束
    yield { type: 'complete' }
    
    // 更新对话历史
    this._threadMessages.push(new HumanMessage(userInput))
    // 限制历史长度
    if (this._threadMessages.length > 20) {
      this._threadMessages = this._threadMessages.slice(-20)
    }
  }
}
```

### 5.6 上下文管理

```typescript
interface ConversationSegment {
  id: string
  messages: BaseMessage[]
  commandContext?: {
    generatedCommand?: string
    executionResult?: CommandExecutionResult
  }
  createdAt: number
}

class ContextManager {
  segments: ConversationSegment[]
  currentSegment: ConversationSegment
  
  // 添加上下文压缩
  compressIfNeeded(): void {
    const MAX_MESSAGES = 20
    if (this.currentSegment.messages.length > MAX_MESSAGES) {
      // 保留系统提示和最近消息，中间生成摘要
      const systemMsg = this.currentSegment.messages[0]
      const recent = this.currentSegment.messages.slice(-10)
      const summary = this.generateSummary(
        this.currentSegment.messages.slice(1, -10)
      )
      this.currentSegment.messages = [
        systemMsg,
        new AIMessage(`[历史对话摘要] ${summary}`),
        ...recent
      ]
    }
  }
  
  // 执行命令后自动分段
  createNewSegmentAfterExecution(result: CommandExecutionResult): void {
    // 保存当前段
    this.segments.push(this.currentSegment)
    // 创建新段，保留历史引用
    this.currentSegment = {
      id: generateId(),
      messages: [...this.currentSegment.messages],  // 复制历史
      commandContext: { executionResult: result },
      createdAt: Date.now()
    }
  }
}
```

## 6. UI 设计

### 6.1 对话界面布局（含流式显示）

```
┌─────────────────────────────────────┐
│  AI 助手              [?] [🗑️]      │  ← 头部
├─────────────────────────────────────┤
│                                     │
│  🤖 你好！我是 craftctl 助手        │  ← AI 欢迎消息
│                                     │
│  👤 查询 /app/config 的值           │  ← 用户输入
│                                     │
│  🤖 [流式显示中...]                 │  ← AI 流式回复
│     craftctl get /app/config        │     （逐字出现）
│     查询指定 key 的值               │
│     [执行] [忽略]                   │
│                                     │
│  ──── 命令已执行 ────               │  ← 分段分隔线
│                                     │
│  👤 分析一下输出                    │
│                                     │
│  🤖 [流式显示中...]                 │  ← AI 流式分析
│     🔧 获取数据中...                │     （Tool 调用提示）
│     从输出结果看...                 │     （继续流式）
│                                     │
├─────────────────────────────────────┤
│  [描述操作或粘贴输出...    ] [发送] │  ← 输入框
└─────────────────────────────────────┘
```

### 6.2 流式显示状态

```typescript
// 流式状态管理
interface StreamState {
  status: 'idle' | 'streaming' | 'tool_calling' | 'error'
  text: string           // 当前累加的文本
  currentTool?: string   // 正在调用的 Tool
  isTyping: boolean      // 是否正在打字（用于光标效果）
}

// 前端渲染逻辑
if (streamState.status === 'streaming') {
  // 显示累加文本 + 打字光标
  displayText(streamState.text + '▊')
} else if (streamState.status === 'tool_calling') {
  // 显示 Tool 调用状态
  displayText(streamState.text + '\n🔧 获取数据中...')
}
```

### 6.3 消息类型渲染

```typescript
interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  type: 'text' | 'command' | 'error'
  content: string
  commandResult?: CommandGenerationResult
  isStreaming?: boolean  // 是否正在流式输出中
  timestamp: number
}

// 渲染逻辑
if (message.isStreaming) {
  // 流式消息：显示累加文本 + 光标
  renderMarkdown(message.content + '▊')
} else if (message.type === 'command') {
  // 命令卡片：代码块 + 描述 + 安全提示 + 执行/忽略按钮
  renderCommandCard(message.commandResult)
} else if (message.type === 'text') {
  // 静态文本：Markdown 渲染
  renderMarkdown(message.content)
}
```

### 6.4 自动分段展示

```vue
<!-- 分段分隔线 -->
<div v-if="isSegmentBoundary(index)" class="segment-divider">
  <span>命令已执行，开启新会话</span>
</div>

<style>
.segment-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 20px 0;
  color: var(--text-secondary);
  font-size: 12px;
}
.segment-divider::before,
.segment-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border-color);
}
</style>
```

## 7. 数据流设计

### 7.1 IPC 流式接口

```typescript
// electron/preload.ts
interface AIAPI {
  // 流式对话接口（v1 新增）
  chatStream: (
    params: {
      input: string
      context: ConnectionContext
      segmentId?: string
    },
    onChunk: (event: StreamEvent) => void
  ) => () => void  // 返回取消函数
  
  // 保存命令执行结果（供 AI Tool 获取）
  saveExecutionResult: (result: CommandExecutionResult) => Promise<void>
  
  // 获取上次执行结果（供 Tool 调用）
  getLastOutput: () => Promise<CommandExecutionResult | null>
  
  // 配置管理
  getConfig: () => Promise<AIProviderConfig>
  setConfig: (config: Partial<AIProviderConfig>) => Promise<void>
  
  // 会话管理
  clearThread: () => Promise<void>
  createNewSegment: () => Promise<string>
}

// electron/ai/index.ts - Main Process
ipcMain.on('ai:chatStream', async (event, params) => {
  const agent = getCommandAgent()
  if (!agent) {
    event.reply('ai:stream:error', { message: 'AI 未配置' })
    return
  }
  
  try {
    const stream = agent.generateStream(params.input, params.context)
    
    for await (const chunk of stream) {
      event.reply('ai:stream:chunk', chunk)
      
      if (chunk.type === 'complete' || chunk.type === 'error') {
        break
      }
    }
  } catch (error) {
    event.reply('ai:stream:error', { 
      message: error.message || '流式输出失败' 
    })
  }
})
```

### 7.2 状态管理（流式版本）

```typescript
// src/stores/ai.ts
export const useAIStore = defineStore('ai', () => {
  const messages = ref<ChatMessage[]>([])
  const isStreaming = ref(false)
  const currentStreamText = ref('')
  const currentTool = ref<string | null>(null)
  
  // 发送消息（流式版本）
  async function sendMessageStream(input: string, context: ConnectionContext) {
    isStreaming.value = true
    currentStreamText.value = ''
    currentTool.value = null
    
    // 添加用户消息
    messages.value.push({
      id: generateId(),
      role: 'user',
      content: input,
      timestamp: Date.now()
    })
    
    // 创建 AI 消息占位（流式填充）
    const aiMessageId = generateId()
    messages.value.push({
      id: aiMessageId,
      role: 'assistant',
      content: '',
      type: 'text',
      isStreaming: true,
      timestamp: Date.now()
    })
    
    // 开始流式接收
    const cancelFn = window.api.ai.chatStream(
      { input, context },
      (event) => {
        switch (event.type) {
          case 'token':
            currentStreamText.value += event.content
            updateMessage(aiMessageId, { 
              content: currentStreamText.value 
            })
            break
            
          case 'tool_start':
            currentTool.value = event.tool
            // 可选：在 UI 显示 Tool 调用状态
            break
            
          case 'tool_end':
            currentTool.value = null
            break
            
          case 'complete':
            isStreaming.value = false
            updateMessage(aiMessageId, { 
              isStreaming: false,
              // 解析最终输出类型
              ...parseFinalOutput(currentStreamText.value)
            })
            cancelFn?.()
            break
            
          case 'error':
            isStreaming.value = false
            updateMessage(aiMessageId, { 
              isStreaming: false,
              type: 'error',
              content: event.message
            })
            cancelFn?.()
            break
        }
      }
    )
  }
})
```

## 8. 上下文压缩策略

```typescript
function compressContext(messages: BaseMessage[]): BaseMessage[] {
  const MAX_MESSAGES = 20
  const SUMMARY_THRESHOLD = 10
  
  if (messages.length <= MAX_MESSAGES) {
    return messages
  }
  
  // 保留系统提示
  const systemMsg = messages[0]
  
  // 保留最近的用户消息
  const recent = messages.slice(-SUMMARY_THRESHOLD)
  
  // 中间部分生成摘要（可选：使用 LLM 生成摘要）
  const middle = messages.slice(1, -SUMMARY_THRESHOLD)
  const summary = generateSummary(middle)
  
  return [
    systemMsg,
    new AIMessage(`[历史对话摘要] ${summary}`),
    ...recent
  ]
}
```

## 9. 安全设计

| 安全措施 | 实现方式 |
|---------|---------|
| 命令确认 | 所有生成命令必须通过命令卡片，用户点击[执行] |
| 风险分级 | safe/warning/dangerous 三级提示，dangerous 需二次确认 |
| Token 限制 | 输出超过 8000 tokens 时提示用户缩短或分段 |
| 执行隔离 | AI 只生成文本，执行复用现有 executeCommand 逻辑 |
| API Key 加密 | 使用 electron-store 加密存储 |
| 流式取消 | 用户可随时取消正在进行的流式输出 |

## 10. 实现步骤

### Phase 1: Core Agent 重构（v1 接口）
1. 更新 `electron/ai/prompts/command-prompts.ts` - v1 System Prompt
2. 更新 `electron/ai/tools/command-tools.ts` - 新增 get_last_output Tool
3. 重构 `electron/ai/agents/command-agent.ts` - **v1 createAgent + generateStream**
4. 更新 `electron/ai/index.ts` - **IPC 流式传输**

### Phase 2: 类型与接口
5. 创建 `types/ai.ts` - 共享类型（StreamEvent, AIResponse 等）
6. 更新 `electron/preload.ts` - **暴露 chatStream 方法**

### Phase 3: 前端适配
7. 更新 `src/stores/ai.ts` - **流式状态管理**
8. 更新 `src/components/AICommandPanel.vue` - **流式显示 UI**

### Phase 4: 集成测试
9. 集成 `saveExecutionResult` 到命令执行流程
10. 测试场景：
    - 命令生成 + 流式输出
    - Tool 调用（分析输出）+ 流式输出
    - 手动粘贴 + 流式输出
    - 多轮追问 + 上下文保持
    - 流式取消 + 错误处理

## 11. 使用示例

### 示例 1: 命令生成 + 流式输出 + 执行

```
用户: 查询所有配置项
AI [流式]: "我来帮您查询所有配置项..."
         "建议命令如下："
         [调用 generate_command]
展示命令卡片: get / --prefix --keys-only
用户: [点击执行]
--- 命令已执行，开启新会话 ---
```

### 示例 2: 错误分析 + 流式输出

```
用户: get /nonexistent
[执行失败: Error: key not found]
用户: 分析错误
AI [流式]: "我来分析这个错误..."
         🔧 获取数据中...
         "错误原因: Key '/nonexistent' 不存在 (exitCode: 1)
         
          建议:
          1. 使用 --prefix 查询是否有相似 key
          2. 检查 key 路径是否正确
          3. 确认该配置是否已创建"
用户: 帮我查找相似 key
AI [流式]: "我来帮您查找..."
         [生成: get /non --prefix --keys-only]
```

### 示例 3: 手动粘贴 + 流式分析

```
用户: [粘贴 1000 行 member list 输出]
      "总结一下集群状态"
AI [流式]: "我来总结集群状态..."
         "集群状态摘要：
          - 总节点数: 3
          - 健康节点: 2
          - 异常节点: 1 (ID: xxx, 状态: unhealthy)
          - Leader: ID yyy
          
          建议: 检查异常节点日志..."
```

---

**设计日期**: 2026-05-23  
**版本**: v2.1 - 流式对话式 AI Agent (LangChain v1)
