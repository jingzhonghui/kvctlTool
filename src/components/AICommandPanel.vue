<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { useAIStore } from '../stores/ai'
import { useConnectionStore } from '../stores/connection'
import { useOutputStore } from '../stores/output'
import { useSettingsStore } from '../stores/settings'
import { useSSHStore } from '../stores/ssh'

const aiStore = useAIStore()
const connectionStore = useConnectionStore()
const outputStore = useOutputStore()
const settingsStore = useSettingsStore()
const sshStore = useSSHStore()

const userInput = ref('')
const showExamples = ref(false)
const messagesContainer = ref<HTMLElement | null>(null)

const examples = [
  '查询 /app/config 的值',
  '查询所有以 /service 开头的 key',
  '设置 /app/name 为 myapp',
  '删除 /temp/data',
  '查看集群成员列表',
  '查询所有配置并只返回 key'
]

// 自动滚动到底部
function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

// 监听消息变化，自动滚动
watch(() => aiStore.messages.length, scrollToBottom)

function getSafetyClass(level: string) {
  return `safety-${level}`
}

function useExample(example: string) {
  userInput.value = example
  showExamples.value = false
}

async function sendMessage() {
  if (!userInput.value.trim() || aiStore.isGenerating) return

  const input = userInput.value.trim()
  userInput.value = ''
  showExamples.value = false

  const context = {
    protocol: connectionStore.protocol,
    host: connectionStore.host,
    port: connectionStore.port,
    toolPath: connectionStore.toolPath
  }

  await aiStore.generateCommand(input, context)
}

async function executeCommand(commandResult: any) {
  if (!commandResult) return

  const cmd = commandResult.command

  // 安全检查
  if (commandResult.safetyLevel === 'dangerous') {
    const confirmed = confirm(`⚠️ 危险操作确认\n\n${commandResult.warnings.join('\n')}\n\n确定要执行吗？`)
    if (!confirmed) return
  }

  // 清空之前的输出（根据设置）
  if (!settingsStore.preserveOutput) {
    outputStore.clear()
  }

  outputStore.startExecute()
  const outputId = outputStore.addPendingOutput(cmd)

  try {
    let result: any

    if (connectionStore.mode === 'ssh' && sshStore.isConnected) {
      result = await window.api.ssh.execute(cmd)
    } else {
      // 解析命令参数
      const parts = cmd.replace(`${connectionStore.toolPath} `, '').split(' ')
      const commandParts = parts.slice(1)

      result = await window.api.craftctl.execute({
        command: commandParts.join(' '),
        mode: connectionStore.mode,
        endpoint: connectionStore.endpoint,
        options: {
          prefix: false,
          keys: false
        }
      })
    }

    outputStore.updateOutputResult(outputId, {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      duration: result.duration
    })

    // 保存地址历史
    await connectionStore.saveAddress()
  } finally {
    outputStore.endExecute()
  }
}

function cancelCommand(messageId: string) {
  aiStore.removeMessage(messageId)
}

async function resetThread() {
  aiStore.resetThread()
  try {
    await window.api.ai.clearThread()
    outputStore.addToast('对话上下文已重置', 'success')
  } catch (err: any) {
    outputStore.addToast('重置对话上下文失败', 'error')
  }
}

function formatTime(timestamp: number) {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="ai-chat-container">
    <!-- 头部 -->
    <div class="ai-header">
      <div class="ai-header-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
        AI 助手
        <span v-if="!aiStore.isEnabled" class="badge-disabled">未启用</span>
      </div>
      <div class="ai-header-actions">
        <button
          class="btn-icon"
          @click="showExamples = !showExamples"
          :disabled="!aiStore.isEnabled"
          title="示例"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
        </button>
        <button
          class="btn-icon"
          @click="resetThread"
          :disabled="!aiStore.isEnabled"
          title="清空对话"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- 示例下拉 -->
    <div v-if="showExamples" class="ai-examples">
      <div class="ai-examples-title">点击使用示例：</div>
      <div class="ai-examples-list">
        <div
          v-for="example in examples"
          :key="example"
          class="ai-example-item"
          @click="useExample(example)"
        >
          {{ example }}
        </div>
      </div>
    </div>

    <!-- 消息列表 -->
    <div ref="messagesContainer" class="ai-messages">
      <!-- 空状态 -->
      <div v-if="aiStore.messages.length === 0" class="ai-empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
        <p class="ai-empty-title">AI 助手</p>
        <p class="ai-empty-desc">描述您想执行的操作，我来帮您生成命令</p>
        <div class="ai-empty-examples">
          <span
            v-for="example in examples.slice(0, 3)"
            :key="example"
            class="ai-empty-example"
            @click="useExample(example)"
          >
            {{ example }}
          </span>
        </div>
      </div>

      <!-- 消息列表 -->
      <template v-else>
        <div
          v-for="message in aiStore.messages"
          :key="message.id"
          class="ai-message"
          :class="[`ai-message-${message.role}`, { 'ai-message-error': message.isError }]"
        >
          <div class="ai-message-content">
            <!-- 用户消息 -->
            <template v-if="message.role === 'user'">
              <div class="ai-message-bubble user">
                {{ message.content }}
              </div>
            </template>

            <!-- AI 消息 -->
            <template v-else>
              <!-- 普通文本回复 -->
              <div v-if="!message.commandResult" class="ai-message-bubble assistant">
                {{ message.content }}
              </div>

              <!-- 命令结果卡片 -->
              <div v-else class="ai-command-card">
                <div class="ai-command-card-header">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="4 17 10 11 4 5"/>
                    <line x1="12" y1="19" x2="20" y2="19"/>
                  </svg>
                  生成的命令
                </div>
                <code class="ai-command-code">{{ message.commandResult.command }}</code>
                <p class="ai-command-desc">{{ message.commandResult.description }}</p>

                <!-- 警告提示 -->
                <div v-if="message.commandResult.warnings.length" class="ai-command-warnings">
                  <div
                    v-for="warning in message.commandResult.warnings"
                    :key="warning"
                    class="ai-command-warning"
                    :class="getSafetyClass(message.commandResult.safetyLevel)"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/>
                      <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    {{ warning }}
                  </div>
                </div>

                <!-- 操作按钮 -->
                <div class="ai-command-actions">
                  <button
                    class="btn btn-sm"
                    :class="[
                      message.commandResult.safetyLevel === 'dangerous' ? 'btn-danger' :
                      message.commandResult.safetyLevel === 'warning' ? 'btn-warning' :
                      'btn-success'
                    ]"
                    @click="executeCommand(message.commandResult)"
                    :disabled="outputStore.isExecuting"
                  >
                    执行命令
                  </button>
                  <button class="btn btn-sm btn-secondary" @click="cancelCommand(message.id)">
                    忽略
                  </button>
                </div>
              </div>
            </template>
          </div>
          <div class="ai-message-time">{{ formatTime(message.timestamp) }}</div>
        </div>

        <!-- 生成中状态 -->
        <div v-if="aiStore.isGenerating" class="ai-message ai-message-assistant">
          <div class="ai-message-content">
            <div class="ai-typing">
              <span class="ai-typing-dot"></span>
              <span class="ai-typing-dot"></span>
              <span class="ai-typing-dot"></span>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- 输入区 -->
    <div class="ai-input-area">
      <div v-if="!aiStore.isEnabled" class="ai-disabled-overlay">
        <span>请在设置中配置 AI Provider 以启用此功能</span>
        <button class="btn btn-sm btn-primary" @click="$emit('open-settings')">打开设置</button>
      </div>
      <textarea
        v-model="userInput"
        class="ai-textarea"
        placeholder="描述您想执行的操作，例如：查询所有以 /app 开头的配置"
        :disabled="aiStore.isGenerating || !aiStore.isEnabled"
        rows="2"
        @keydown.enter.prevent="sendMessage"
      />
      <div class="ai-input-actions">
        <span class="ai-input-hint">按 Enter 发送</span>
        <button
          class="btn btn-sm btn-primary"
          @click="sendMessage"
          :disabled="aiStore.isGenerating || !userInput.trim() || !aiStore.isEnabled"
        >
          <span v-if="aiStore.isGenerating" class="spinner"></span>
          {{ aiStore.isGenerating ? '生成中...' : '发送' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-primary);
}

/* 头部 */
.ai-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
  flex-shrink: 0;
}

.ai-header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.ai-header-actions {
  display: flex;
  gap: 6px;
}

.btn-icon {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-icon:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.btn-icon:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.badge-disabled {
  padding: 2px 6px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 10px;
  color: var(--text-secondary);
  font-weight: normal;
}

/* 示例下拉 */
.ai-examples {
  padding: 12px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.ai-examples-title {
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.ai-examples-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ai-example-item {
  padding: 6px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.ai-example-item:hover {
  border-color: var(--accent);
  color: var(--accent);
}

/* 消息列表 */
.ai-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 空状态 */
.ai-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  color: var(--text-secondary);
  text-align: center;
}

.ai-empty-title {
  margin-top: 16px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.ai-empty-desc {
  margin-top: 8px;
  font-size: 13px;
}

.ai-empty-examples {
  margin-top: 20px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.ai-empty-example {
  padding: 8px 14px;
  font-size: 12px;
  color: var(--accent);
  background: rgba(88, 166, 255, 0.1);
  border: 1px solid rgba(88, 166, 255, 0.2);
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.ai-empty-example:hover {
  background: rgba(88, 166, 255, 0.2);
}

/* 消息 */
.ai-message {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ai-message-user {
  align-items: flex-end;
}

.ai-message-assistant {
  align-items: flex-start;
}

.ai-message-content {
  max-width: 85%;
}

.ai-message-bubble {
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
}

.ai-message-bubble.user {
  background: var(--accent);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.ai-message-bubble.assistant {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-bottom-left-radius: 4px;
}

.ai-message-time {
  font-size: 11px;
  color: var(--text-secondary);
  padding: 0 4px;
}

/* 命令卡片 */
.ai-command-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 14px;
  min-width: 260px;
  border-bottom-left-radius: 4px;
}

.ai-command-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

.ai-command-code {
  display: block;
  padding: 10px 12px;
  background: var(--bg-primary);
  border-radius: 6px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 12px;
  color: var(--accent);
  word-break: break-all;
  border-left: 3px solid var(--accent);
}

.ai-command-desc {
  margin-top: 10px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.ai-command-warnings {
  margin-top: 10px;
}

.ai-command-warning {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 11px;
  margin-bottom: 6px;
}

.ai-command-warning:last-child {
  margin-bottom: 0;
}

.ai-command-warning.safety-safe {
  background: rgba(35, 197, 94, 0.1);
  color: #23c55e;
  border: 1px solid rgba(35, 197, 94, 0.2);
}

.ai-command-warning.safety-warning {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.2);
}

.ai-command-warning.safety-dangerous {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.ai-command-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

/* 输入区 */
.ai-input-area {
  padding: 12px 16px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
  position: relative;
}

.ai-disabled-overlay {
  position: absolute;
  inset: 0;
  background: rgba(13, 17, 23, 0.8);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  z-index: 10;
  padding: 16px;
  text-align: center;
}

.ai-disabled-overlay span {
  color: var(--text-secondary);
  font-size: 13px;
}

.ai-textarea {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 13px;
  resize: none;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s;
}

.ai-textarea:focus {
  border-color: var(--accent);
}

.ai-textarea:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ai-input-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}

.ai-input-hint {
  font-size: 11px;
  color: var(--text-secondary);
}

/* 打字动画 */
.ai-typing {
  display: flex;
  gap: 4px;
  padding: 12px 14px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  border-bottom-left-radius: 4px;
}

.ai-typing-dot {
  width: 8px;
  height: 8px;
  background: var(--text-secondary);
  border-radius: 50%;
  animation: typing 1.4s infinite ease-in-out both;
}

.ai-typing-dot:nth-child(1) {
  animation-delay: -0.32s;
}

.ai-typing-dot:nth-child(2) {
  animation-delay: -0.16s;
}

@keyframes typing {
  0%, 80%, 100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1);
  }
}

/* 按钮样式 */
.btn-sm {
  padding: 6px 14px;
  font-size: 12px;
}

.btn-success {
  background: rgba(35, 197, 94, 0.2);
  color: #23c55e;
  border: 1px solid rgba(35, 197, 94, 0.3);
}

.btn-success:hover:not(:disabled) {
  background: rgba(35, 197, 94, 0.3);
}

.btn-warning {
  background: rgba(245, 158, 11, 0.2);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.btn-warning:hover:not(:disabled) {
  background: rgba(245, 158, 11, 0.3);
}

.btn-danger {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.btn-danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.3);
}

.spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid var(--border-color);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-right: 6px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
