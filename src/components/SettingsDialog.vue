<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { useConnectionStore } from '../stores/connection'

const settingsStore = useSettingsStore()
const connectionStore = useConnectionStore()

const toolPath = ref('')
const outputFontSize = ref(14)
const uiFontSize = ref(14)

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
}>()

watch(() => props.visible, (val) => {
  if (val) {
    toolPath.value = connectionStore.toolPath
    outputFontSize.value = settingsStore.outputFontSize
    uiFontSize.value = settingsStore.uiFontSize
  }
})

function save() {
  if (toolPath.value) {
    connectionStore.setToolPath(toolPath.value)
  }
  settingsStore.setOutputFontSize(outputFontSize.value)
  settingsStore.setUiFontSize(uiFontSize.value)
  emit('update:visible', false)
}

function cancel() {
  emit('update:visible', false)
}

function browsePath() {
  // 使用 Electron 的 dialog API
  window.api.dialog.openFile().then(path => {
    if (path) {
      toolPath.value = path
    }
  })
}

const isDark = computed(() => settingsStore.theme === 'dark')

function setTheme(dark: boolean) {
  if (settingsStore.theme !== (dark ? 'dark' : 'light')) {
    settingsStore.toggleTheme()
  }
}
</script>

<template>
  <div class="settings-overlay" v-if="props.visible" @click.self="cancel">
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
            <label class="form-label">craftctl 路径</label>
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
      </div>
      
      <div class="settings-footer">
        <button class="btn" @click="cancel">取消</button>
        <button class="btn btn-primary" @click="save">保存</button>
      </div>
    </div>
  </div>
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
</style>