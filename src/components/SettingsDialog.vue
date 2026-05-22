<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { useConnectionStore } from '../stores/connection'
import { useSSHStore } from '../stores/ssh'
import { useAIStore } from '../stores/ai'
import RemoteFileBrowserDialog from './RemoteFileBrowserDialog.vue'

const settingsStore = useSettingsStore()
const connectionStore = useConnectionStore()
const sshStore = useSSHStore()
const aiStore = useAIStore()

const toolPath = ref('')
const outputFontSize = ref(14)
const uiFontSize = ref(14)
const showRemoteBrowser = ref(false)
const testingAI = ref(false)
const aiTestResult = ref<{ success: boolean; message: string } | null>(null)

const props = defineProps<{
  visible: boolean
  executeMode: 'local' | 'ssh'
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
}>()

watch(() => props.visible, (val) => {
  if (val) {
    toolPath.value = connectionStore.toolPath
    outputFontSize.value = settingsStore.outputFontSize
    uiFontSize.value = settingsStore.uiFontSize
    aiTestResult.value = null
  }
})

function save() {
  connectionStore.setToolPath(toolPath.value || 'craftctl')
  settingsStore.setOutputFontSize(outputFontSize.value)
  settingsStore.setUiFontSize(uiFontSize.value)
  emit('update:visible', false)
}

function cancel() {
  emit('update:visible', false)
}

async function testAIConnection() {
  testingAI.value = true
  aiTestResult.value = null
  try {
    const result = await aiStore.testConnection()
    aiTestResult.value = {
      success: result.success,
      message: result.success ? '连接成功' : (result.error || '连接失败')
    }
  } finally {
    testingAI.value = false
  }
}

async function saveAIConfig() {
  // 解构出需要保存的配置，避免传递响应式对象
  const { provider, apiKey, baseUrl, model, temperature, maxTokens, enabled } = aiStore.config
  await aiStore.saveConfig({ provider, apiKey, baseUrl, model, temperature, maxTokens, enabled })
}

async function browsePath() {
  const mode = props.executeMode || connectionStore.mode
  if (mode === 'ssh') {
    if (!sshStore.isConnected) {
      const result = await window.api.ssh.checkConnection()
      if (!result.connected) {
        alert('当前未建立 SSH 连接，请先切换到 SSH 远程模式并连接服务器后再试。')
        return
      }
      sshStore.isConnected = true
    }
    showRemoteBrowser.value = true
    return
  }

  const path = await window.api.dialog.openFile()
  if (path) {
    toolPath.value = path
  }
}

function onRemotePathSelected(path: string | null) {
  if (path) {
    toolPath.value = path
  }
}

const isDark = computed(() => settingsStore.theme === 'dark')

function setTheme(dark: boolean) {
  if (settingsStore.theme !== (dark ? 'dark' : 'light')) {
    settingsStore.toggleTheme()
  }
}
</script>

<template>
  <div class="settings-overlay" v-if="props.visible">
    <div class="settings-modal">
      <div class="settings-header">
        <span class="settings-title">设置</span>
        <button class="close-btn" @click="cancel">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      
      <div class="settings-body">
        <div class="settings-section">
          <div class="section-title">命令行工具</div>
          <div class="form-group">
            <label class="form-label">kvctl 路径</label>
            <div class="path-input-group">
              <input class="form-input" v-model="toolPath" placeholder="如：/usr/local/bin/craftctl 或 C:\tool\craftctl.exe" />
              <button class="btn" @click="browsePath">浏览</button>
            </div>
          </div>
        </div>
        
        <div class="settings-section">
          <div class="section-title">字体大小</div>
          <div class="form-group">
            <label class="form-label">命令输出界面字体大小</label>
            <div class="font-size-control">
              <input type="range" v-model.number="outputFontSize" min="10" max="24" />
              <span class="font-size-value">{{ outputFontSize }}px</span>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">软件界面字体大小</label>
            <div class="font-size-control">
              <input type="range" v-model.number="uiFontSize" min="12" max="18" />
              <span class="font-size-value">{{ uiFontSize }}px</span>
            </div>
          </div>
        </div>
        
        <div class="settings-section">
          <div class="section-title">外观</div>
          <div class="form-group">
            <label class="form-label">主题</label>
            <div class="theme-toggle">
              <button 
                :class="['theme-btn', { active: isDark }]"
                @click="setTheme(true)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
                深色
              </button>
              <button 
                :class="['theme-btn', { active: !isDark }]"
                @click="setTheme(false)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
                浅色
              </button>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <div class="section-title">AI 助手配置</div>
          
          <div class="form-group">
            <label class="form-label">启用 AI 功能</label>
            <div class="toggle-switch">
              <input 
                type="checkbox" 
                id="ai-enabled"
                v-model="aiStore.config.enabled"
                @change="saveAIConfig"
              />
              <label for="ai-enabled" class="toggle-label"></label>
            </div>
          </div>

          <template v-if="aiStore.config.enabled">
            <div class="form-group">
              <label class="form-label">Provider</label>
              <select class="form-input" v-model="aiStore.config.provider" @change="saveAIConfig">
                <option value="openai">OpenAI</option>
                <option value="openai-compatible">OpenAI 兼容 API</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">
                API Base URL
                <span class="label-hint">{{ aiStore.config.provider === 'openai' ? '(可选，用于代理)' : '(必填)' }}</span>
              </label>
              <input 
                class="form-input" 
                v-model="aiStore.config.baseUrl" 
                :placeholder="aiStore.config.provider === 'openai' ? '默认: https://api.openai.com/v1' : '如：https://api.example.com/v1'"
                @blur="saveAIConfig"
              />
              <div class="input-hint" v-if="aiStore.config.provider === 'openai-compatible'">
                使用 OpenAI 兼容 API 时必须填写，例如：OpenRouter、OneAPI、本地模型等
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">API Key</label>
              <input 
                class="form-input" 
                v-model="aiStore.config.apiKey" 
                type="password"
                placeholder="输入您的 API Key"
                @blur="saveAIConfig"
              />
            </div>

            <div class="form-group">
              <label class="form-label">模型</label>
              <input 
                class="form-input" 
                v-model="aiStore.config.model" 
                list="ai-models"
                placeholder="如：gpt-4, claude-3-opus"
                @blur="saveAIConfig"
              />
              <datalist id="ai-models">
                <option v-for="model in aiStore.recommendedModels" :key="model" :value="model" />
              </datalist>
            </div>

            <div class="form-group">
              <label class="form-label">Temperature ({{ aiStore.config.temperature }})</label>
              <div class="font-size-control">
                <input 
                  type="range" 
                  v-model.number="aiStore.config.temperature" 
                  min="0" 
                  max="1" 
                  step="0.1"
                  @change="saveAIConfig"
                />
              </div>
            </div>

            <div class="ai-test-section">
              <button 
                class="btn btn-sm" 
                @click="testAIConnection"
                :disabled="testingAI || !aiStore.isValid"
              >
                <span v-if="testingAI" class="spinner"></span>
                {{ testingAI ? '测试中...' : '测试连接' }}
              </button>
              
              <div 
                v-if="aiTestResult" 
                class="ai-test-result"
                :class="{ success: aiTestResult.success, error: !aiTestResult.success }"
              >
                {{ aiTestResult.message }}
              </div>
            </div>
          </template>
        </div>
      </div>
      
      <div class="settings-footer">
        <button class="btn" @click="cancel">取消</button>
        <button class="btn btn-primary" @click="save">保存</button>
      </div>
    </div>
  </div>

  <RemoteFileBrowserDialog
    v-model:visible="showRemoteBrowser"
    @select="onRemotePathSelected"
  />
</template>

<style scoped>
.settings-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.settings-modal {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  width: 480px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
}

.settings-title {
  font-size: 16px;
  font-weight: 600;
}

.close-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.settings-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.settings-section {
  margin-bottom: 20px;
}

.settings-section:last-child {
  margin-bottom: 0;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  margin-bottom: 12px;
}

.path-input-group {
  display: flex;
  gap: 8px;
}

.path-input-group .form-input {
  flex: 1;
}

.font-size-control {
  display: flex;
  align-items: center;
  gap: 12px;
}

.font-size-control input[type="range"] {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  background: var(--border-color);
  border-radius: 2px;
  outline: none;
}

.font-size-control input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  background: var(--accent);
  border-radius: 50%;
  cursor: pointer;
}

.font-size-value {
  min-width: 45px;
  text-align: right;
  color: var(--text-secondary);
}

.theme-toggle {
  display: flex;
  gap: 8px;
}

.theme-btn {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 13px;
}

.theme-btn.active {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
}

.theme-btn:not(.active):hover {
  border-color: var(--accent);
  color: var(--text-primary);
}

.settings-footer {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding: 16px 20px;
  border-top: 1px solid var(--border-color);
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-label {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--border-color);
  transition: .3s;
  border-radius: 24px;
}

.toggle-label:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: .3s;
  border-radius: 50%;
}

input:checked + .toggle-label {
  background-color: var(--accent);
}

input:checked + .toggle-label:before {
  transform: translateX(20px);
}

.ai-test-section {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.ai-test-result {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
}

.ai-test-result.success {
  color: #23c55e;
  background: rgba(35, 197, 94, 0.1);
}

.ai-test-result.error {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.label-hint {
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: normal;
  margin-left: 4px;
}

.input-hint {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 4px;
  line-height: 1.4;
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