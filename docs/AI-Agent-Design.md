# AI Agent 功能设计方案

## 1. 设计目标

为 kvctlTool 添加 AI Agent 功能，支持自然语言生成 craftctl 命令，同时确保：

- **人类在循环中 (Human-in-the-loop)**：所有生成命令需用户确认后方可执行
- **无自主执行权限**：Agent 只生成文本，不具备直接调用系统的能力
- **对话隔离**：每次对话独立，不保留历史上下文
- **协议无关**：通过 LangChain 支持 OpenAI/Anthropic 任意模型

## 2. 技术选型

| 组件 | 技术方案 | 说明 |
|-----|---------|------|
| AI 框架 | LangChain.js | 统一的 LLM 抽象层 |
| Provider 支持 | @langchain/openai, @langchain/anthropic | 支持 OpenAI 和 Anthropic 协议 |
| Agent 类型 | 无 Agent，直接使用 ChatModel | 仅生成命令，不调用工具 |
| 输出解析 | JsonOutputParser | 结构化输出 |
| 配置存储 | keytar + electron-store | 敏感信息加密存储 |

## 3. 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    用户交互层 (Vue)                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  AICommandPanel.vue                                  │   │
│  │  ├─ 自然语言输入框                                   │   │
│  │  ├─ 生成命令展示区（待确认）                         │   │
│  │  ├─ [执行] [取消] 按钮                               │   │
│  │  └─ 历史记录                                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                            │                                │
│                            ▼ IPC                           │
├─────────────────────────────────────────────────────────────┤
│              LangChain Agent 层 (Electron Main)             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  CommandGenerationAgent                              │   │
│  │  ├─ ChatModel (OpenAI/Anthropic)                    │   │
│  │  ├─ System Prompt (craftctl 专家)                   │   │
│  │  ├─ Output Parser (命令提取)                        │   │
│  │  └─ NO TOOLS (只生成，不执行)                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                            │                                │
│                            ▼                                │
│  输出：{ command: "...", explanation: "...", safety: "..." }│
└─────────────────────────────────────────────────────────────┘
```

## 4. 工作流程

```
用户输入自然语言
       │
       ▼
┌──────────────┐
│ LangChain    │◄── System Prompt（craftctl 专家角色）
│ Chat Model   │◄── 当前连接配置（endpoint, protocol等）
└──────────────┘
       │
       ▼
生成：建议命令 + 解释 + 风险提示
       │
       ▼
展示给用户
       │
   ┌───┴───┐
   ▼       ▼
 [执行]  [取消]
   │       │
   ▼       ▼
调用现有   返回编辑
执行逻辑
（复用 KVOperationPanel
 的 executeCommand）
```

## 5. 模块设计

### 5.1 文件结构

```
electron/
├── ai/
│   ├── config/
│   │   └── provider-config.ts       # Provider 配置管理
│   ├── agents/
│   │   └── command-agent.ts         # 命令生成 Agent
│   ├── prompts/
│   │   └── command-prompts.ts       # System Prompt 模板
│   └── index.ts                     # AI 模块入口与 IPC 处理
```

### 5.2 System Prompt 设计

```typescript
const COMMAND_GENERATION_PROMPT = `你是 craftctl 命令行工具的专家助手。

当前连接配置:
- 协议: {protocol}
- 地址: {host}:{port}
- 工具路径: {toolPath}

你的任务是: 将用户的自然语言描述转换为正确的 craftctl 命令。

## 可用命令参考:
- get <key> [--prefix] [--keys-only] - 查询 key
- put <key> <value> - 存储 key-value
- del <key> - 删除 key
- member list - 查询集群成员

## 输出格式 (JSON):
{
  "command": "完整的命令字符串",
  "description": "这个命令的作用说明",
  "parameters": {
    "key": "解析出的 key",
    "value": "解析出的 value (如果有)",
    "flags": ["--prefix", "--keys-only"] // 使用的选项
  },
  "safetyLevel": "safe | warning | dangerous",
  "warnings": ["可能的数据丢失风险", "其他提示"]
}

## 安全规则:
- 删除操作标记为 warning
- 通配符/前缀删除标记为 dangerous
- 不明确时询问用户确认

只返回 JSON，不要其他解释。`
```

### 5.3 Agent 实现

```typescript
interface CommandGenerationResult {
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

class CommandGenerationAgent {
  async generate(
    userInput: string, 
    context: ConnectionContext
  ): Promise<CommandGenerationResult>
}
```

### 5.4 IPC 接口

```typescript
interface AIAPI {
  // 生成命令（用户确认前）
  generateCommand: (input: string) => Promise<CommandGenerationResult>
  
  // 配置管理
  getConfig: () => Promise<AIProviderConfig>
  setConfig: (config: AIProviderConfig) => Promise<void>
  testConnection: () => Promise<boolean>
}
```

## 6. UI 设计

### 6.1 AICommandPanel 组件

```vue
<template>
  <div class="ai-panel">
    <!-- 输入区 -->
    <div class="input-section">
      <input 
        v-model="userInput" 
        placeholder="描述你想执行的操作..."
        @keyup.enter="generate"
      />
      <button @click="generate" :disabled="isGenerating">
        {{ isGenerating ? '生成中...' : '生成命令' }}
      </button>
    </div>
    
    <!-- 生成结果区 -->
    <div v-if="generatedCommand" class="result-section">
      <div class="command-display">
        <code>{{ generatedCommand.command }}</code>
        <p class="description">{{ generatedCommand.description }}</p>
      </div>
      
      <!-- 安全提示 -->
      <div v-if="generatedCommand.warnings.length" class="warnings">
        <div v-for="w in generatedCommand.warnings" :key="w" class="warning">
          ⚠️ {{ w }}
        </div>
      </div>
      
      <!-- 操作按钮 -->
      <div class="actions">
        <button @click="execute" :class="['btn-execute', safetyClass]">
          执行命令
        </button>
        <button @click="cancel" class="btn-cancel">取消</button>
      </div>
    </div>
  </div>
</template>
```

### 6.2 集成位置

侧边栏新增「AI 助手」折叠面板，位于 SSH 管理下方。

## 7. 安全设计

| 安全措施 | 实现方式 |
|---------|---------|
| API Key 加密 | 使用 keytar 存储到系统密钥链 |
| 命令确认 | 所有生成命令必须用户点击「执行」 |
| 风险分级 | safe/warning/dangerous 三级提示 |
| 无工具调用 | Agent 不绑定任何 Tool，纯文本生成 |
| 执行复用 | 确认后调用现有 executeCommand，不走 AI 通道 |

## 8. 配置设计

```typescript
interface AIProviderConfig {
  provider: 'openai' | 'anthropic' | 'openai-compatible'
  apiKey: string        // 加密存储
  baseUrl?: string      // 自定义 API 地址
  model: string         // 模型名称
  temperature?: number  // 默认 0.3
  maxTokens?: number    // 默认 2048
  enabled: boolean      // 是否启用 AI 功能
}
```

## 9. 实现步骤

1. **安装依赖**：`@langchain/core`, `@langchain/openai`, `@langchain/anthropic`
2. **配置模块**：`electron/ai/config/provider-config.ts`
3. **Agent 实现**：`electron/ai/agents/command-agent.ts`
4. **Prompt 模板**：`electron/ai/prompts/command-prompts.ts`
5. **IPC 处理**：`electron/ai/index.ts` 和 `electron/preload.ts`
6. **UI 组件**：`src/components/AICommandPanel.vue`
7. **状态管理**：`src/stores/ai.ts`
8. **集成界面**：修改 `App.vue` 添加 AI 面板
9. **设置面板**：在 `SettingsDialog.vue` 添加 AI 配置

## 10. 扩展预留

- **错误诊断 Agent**：分析 stderr 输出，给出修复建议
- **数据分析 Agent**：分析 KV 查询结果，生成报告
- **对话记忆**：可选的跨会话历史保留
- **多轮对话**：支持追问和澄清

---

**设计日期**: 2026-05-21
**版本**: v1.0
