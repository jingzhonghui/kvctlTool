<script setup lang="ts">
import { ref, computed } from 'vue'
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

const examples = [
  '查询 /app/config 的值',
  '查询所有以 /service 开头的 key',
  '设置 /app/name 为 myapp',
  '删除 /temp/data',
  '查看集群成员列表',
  '查询所有配置并只返回 key'
]

const safetyClass = computed(() => {
  if (!aiStore.generatedCommand) return ''
  return `safety-${aiStore.generatedCommand.safetyLevel}`
})

const canExecute = computed(() => {
  return aiStore.generatedCommand && !outputStore.isExecuting
})

async function generate() {
  if (!userInput.value.trim()) {
    outputStore.addToast('请输入您想执行的操作描述', 'warning')
    return
  }

  const context = {
    protocol: connectionStore.protocol,
    host: connectionStore.host,
    port: connectionStore.port,
    toolPath: connectionStore.toolPath
  }

  console.log('[AI Panel] generate() 被调用，context:', context)
  await aiStore.generateCommand(userInput.value, context)
}

function useExample(example: string) {
  userInput.value = example
  showExamples.value = false
}

async function execute() {
  if (!aiStore.generatedCommand) return

  const cmd = aiStore.generatedCommand.command
  
  // 安全检查
  if (aiStore.generatedCommand.safetyLevel === 'dangerous') {
    const confirmed = confirm(`⚠️ 危险操作确认\n\n${aiStore.generatedCommand.warnings.join('\n')}\n\n确定要执行吗？`)
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
    
    // 清空生成的命令
    aiStore.clearGeneratedCommand()
    userInput.value = ''
  } finally {
    outputStore.endExecute()
  }
}

function cancel() {
  aiStore.clearGeneratedCommand()
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
</script>

<template>
  <div class="sidebar-section ai-section">
    <div class="section-title">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
      </svg>
      AI 助手
      <span v-if="!aiStore.isEnabled" class="badge-disabled">未启用</span>
    </div>

    <!-- 输入区 -->
    <div class="ai-input-area">
      <textarea
        v-model="userInput"
        class="ai-textarea"
        placeholder="描述您想执行的操作，例如：查询所有以 /app 开头的配置"
        :disabled="aiStore.isGenerating || !aiStore.isEnabled"
        rows="2"
        @keyup.ctrl.enter="generate"
      />

      <div class="ai-actions">
        <div class="ai-actions-left">
          <button
            class="btn btn-sm btn-secondary"
            @click="showExamples = !showExamples"
            :disabled="!aiStore.isEnabled"
          >
            示例
          </button>
          <button
            class="btn btn-sm btn-secondary"
            @click="resetThread"
            :disabled="!aiStore.isEnabled"
            title="重置对话上下文"
          >
            重置对话
          </button>
        </div>
        <button
          class="btn btn-sm btn-primary"
          @click="generate"
          :disabled="aiStore.isGenerating || !userInput.trim() || !aiStore.isEnabled"
        >
          <span v-if="aiStore.isGenerating" class="spinner"></span>
          {{ aiStore.isGenerating ? '生成中...' : '生成命令' }}
        </button>
      </div>
    </div>

    <!-- 示例下拉 -->
    <div v-if="showExamples" class="ai-examples">
      <div 
        v-for="example in examples" 
        :key="example"
        class="ai-example-item"
        @click="useExample(example)"
      >
        {{ example }}
      </div>
    </div>

    <!-- 生成结果区 -->
    <div v-if="aiStore.generatedCommand" class="ai-result">
      <div class="ai-command-display">
        <code class="ai-command">{{ aiStore.generatedCommand.command }}</code>
        <p class="ai-description">{{ aiStore.generatedCommand.description }}</p>
      </div>

      <!-- 安全提示 -->
      <div v-if="aiStore.generatedCommand.warnings.length" class="ai-warnings">
        <div 
          v-for="warning in aiStore.generatedCommand.warnings" 
          :key="warning"
          class="ai-warning"
          :class="safetyClass"
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
      <div class="ai-execute-actions">
        <button 
          class="btn btn-sm" 
          :class="[
            aiStore.generatedCommand.safetyLevel === 'dangerous' ? 'btn-danger' : 
            aiStore.generatedCommand.safetyLevel === 'warning' ? 'btn-warning' : 
            'btn-success'
          ]"
          @click="execute"
          :disabled="!canExecute"
        >
          执行命令
        </button>
        <button class="btn btn-sm btn-secondary" @click="cancel">
          取消
        </button>
      </div>
    </div>

    <!-- 错误提示 -->
    <div v-if="aiStore.error" class="ai-error">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="15" y1="9" x2="9" y2="15"/>
        <line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
      {{ aiStore.error }}
    </div>

    <!-- 未启用提示 -->
    <div v-if="!aiStore.isEnabled" class="ai-disabled-hint">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="16" x2="12" y2="12"/>
        <line x1="12" y1="8" x2="12.01" y2="8"/>
      </svg>
      请在设置中配置 AI Provider 以启用此功能
    </div>
  </div>
</template>

<style scoped>
.ai-section {
  border-top: 1px solid var(--border-color);
}

.ai-input-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ai-textarea {
  width: 100%;
  padding: 8px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  resize: vertical;
  min-height: 60px;
  font-family: inherit;
}

.ai-textarea:focus {
  outline: none;
  border-color: var(--accent);
}

.ai-textarea:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ai-actions {
  display: flex;
  gap: 8px;
  justify-content: space-between;
  align-items: center;
}

.ai-actions-left {
  display: flex;
  gap: 8px;
}

.ai-examples {
  margin-top: 8px;
  padding: 8px;
  background: var(--bg-secondary);
  border-radius: 6px;
  border: 1px solid var(--border-color);
}

.ai-example-item {
  padding: 6px 8px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
}

.ai-example-item:hover {
  background: var(--bg-primary);
  color: var(--accent);
}

.ai-result {
  margin-top: 12px;
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: 6px;
  border: 1px solid var(--border-color);
}

.ai-command-display {
  margin-bottom: 12px;
}

.ai-command {
  display: block;
  padding: 8px 12px;
  background: var(--bg-primary);
  border-radius: 4px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 12px;
  color: var(--accent);
  word-break: break-all;
  border-left: 3px solid var(--accent);
}

.ai-description {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.ai-warnings {
  margin-bottom: 12px;
}

.ai-warning {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 12px;
  margin-bottom: 6px;
}

.ai-warning.safety-safe {
  background: rgba(35, 197, 94, 0.1);
  color: #23c55e;
  border: 1px solid rgba(35, 197, 94, 0.2);
}

.ai-warning.safety-warning {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.2);
}

.ai-warning.safety-dangerous {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.ai-execute-actions {
  display: flex;
  gap: 8px;
}

.ai-error {
  margin-top: 12px;
  padding: 10px 12px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 6px;
  color: #ef4444;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.ai-disabled-hint {
  margin-top: 12px;
  padding: 10px 12px;
  background: var(--bg-secondary);
  border: 1px dashed var(--border-color);
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.badge-disabled {
  margin-left: auto;
  padding: 2px 6px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 10px;
  color: var(--text-secondary);
  font-weight: normal;
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

.btn-sm {
  padding: 4px 10px;
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
</style>
