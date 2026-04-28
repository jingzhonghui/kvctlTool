<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue'
import { useConnectionStore } from './stores/connection'
import { useOutputStore } from './stores/output'
import { useSettingsStore } from './stores/settings'
import { useSSHStore } from './stores/ssh'
import ConnectionPanel from './components/ConnectionPanel.vue'
import KVOperationPanel from './components/KVOperationPanel.vue'
import AdvancedOptions from './components/AdvancedOptions.vue'
import SSHManager from './components/SSHManager.vue'
import OutputTerminal from './components/OutputTerminal.vue'
import CommandBar from './components/CommandBar.vue'
import AppHeader from './components/AppHeader.vue'
import SettingsDialog from './components/SettingsDialog.vue'

const connectionStore = useConnectionStore()
const outputStore = useOutputStore()
const settingsStore = useSettingsStore()
const sshStore = useSSHStore()

const executeMode = ref<'local' | 'ssh'>('local')
const showSettings = ref(false)
const sidebarWidth = ref(320)
const isResizing = ref(false)

onMounted(async () => {
  await settingsStore.loadSettings()
  await connectionStore.loadToolPath()

  const savedWidth = await window.api.store.get('sidebarWidth')
  if (savedWidth && typeof savedWidth === 'number') {
    sidebarWidth.value = savedWidth
  }

  const savedMode = await window.api.store.get('executeMode')
  const mode: 'local' | 'ssh' = savedMode === 'ssh' ? 'ssh' : 'local'
  executeMode.value = mode
  connectionStore.setMode(mode)

  if (mode === 'local') {
    await connectionStore.loadLocalConnection()
  } else {
    if (sshStore.selectedConfigId) {
      connectionStore.loadSSHConnection(sshStore.selectedConfigId)
    } else {
      connectionStore.toolPath = 'craftctl'
    }
  }
})

onUnmounted(() => {
  stopResize()
})

function startResize() {
  isResizing.value = true
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
}

function onResize(e: MouseEvent) {
  if (!isResizing.value) return
  const minWidth = 200
  const maxWidth = window.innerWidth * 0.6
  if (e.clientX >= minWidth && e.clientX <= maxWidth) {
    sidebarWidth.value = e.clientX
  }
}

function stopResize() {
  if (!isResizing.value) return
  isResizing.value = false
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
  window.api.store.set('sidebarWidth', sidebarWidth.value)
}

async function toggleMode(mode: 'local' | 'ssh') {
  if (executeMode.value === mode) return

  const oldMode = executeMode.value
  executeMode.value = mode
  connectionStore.setMode(mode)
  await window.api.store.set('executeMode', mode)

  if (oldMode === 'local') {
    await connectionStore.saveLocalConnection()
  } else if (oldMode === 'ssh') {
    if (sshStore.selectedConfigId) {
      await connectionStore.saveSSHConnection(sshStore.selectedConfigId)
    }
  }

  if (mode === 'local') {
    await connectionStore.loadLocalConnection()
  } else if (mode === 'ssh') {
    if (sshStore.selectedConfigId) {
      await connectionStore.loadSSHConnection(sshStore.selectedConfigId)
    } else {
      connectionStore.resetToDefaults()
    }
  }
}

// 监听 SSH 选中的配置变化，自动加载/保存关联的连接配置
watch(() => sshStore.selectedConfigId, (newId, oldId) => {
  if (executeMode.value !== 'ssh') return

  // 保存旧配置
  if (oldId) {
    connectionStore.saveSSHConnection(oldId)
  }
  // 加载新配置
  if (newId) {
    connectionStore.loadSSHConnection(newId)
  }
})

function clearOutput() {
  outputStore.clear()
}

function toggleTheme() {
  settingsStore.toggleTheme()
}

function openSettings() {
  showSettings.value = true
}

// ============ 表格数据处理 ============
interface TableRow {
  index: number
  key: string
  value: string
  version: string
}

const tableData = ref<TableRow[]>([])

// 解析 get 命令输出
function parseGetOutput(outputs: any[]): TableRow[] {
  const rows: TableRow[] = []
  let seq = 1
  
  for (const output of outputs) {
    const lines = output.stdout?.split('\n') || []
    
    for (const line of lines) {
      // 过滤掉不需要的行
      if (line.includes('Try to connect') || line.includes('Connected endpint')) {
        continue
      }
      
      // 只处理包含以 / 开头的 key 的行
      // 格式: 时间戳 /key value hv:XX v:XX
      // 或者: /key value hv:XX v:XX
      const match = line.match(/(\/[^\s]+)\s*(.+?)\s+hv:\d+\s+v:(\d+)$/)
      if (match) {
        rows.push({
          index: seq++,
          key: match[1],
          value: match[2],
          version: match[3]
        })
      }
    }
  }
  
  return rows
}

// 监听输出变化，自动更新表格
watch(() => outputStore.outputs, (newOutputs) => {
  if (newOutputs.length > 0) {
    tableData.value = parseGetOutput(newOutputs)
  }
}, { deep: true })

// ============ Tooltip 功能 ============
const tooltip = ref({
  show: false,
  text: '',
  x: 0,
  y: 0
})
const tooltipTimer = ref<number | null>(null)

function showTooltip(e: MouseEvent, text: string) {
  // 清除之前的定时器
  if (tooltipTimer.value) {
    clearTimeout(tooltipTimer.value)
    tooltipTimer.value = null
  }

  const target = e.target as HTMLElement
  // 检查文字是否超出（使用 offsetWidth 比较更准确）
  const isOverflowing = target.scrollWidth > target.offsetWidth + 1

  if (isOverflowing) {
    // 延迟 0.5 秒显示
    tooltipTimer.value = window.setTimeout(() => {
      tooltip.value = {
        show: true,
        text,
        x: e.clientX,
        y: e.clientY - 10
      }
    }, 500)
  }
}

function hideTooltip() {
  if (tooltipTimer.value) {
    clearTimeout(tooltipTimer.value)
    tooltipTimer.value = null
  }
  tooltip.value.show = false
}
</script>

<template>
  <div class="app-container">
    <AppHeader 
      :execute-mode="executeMode" 
      @toggle-mode="toggleMode"
      @clear-output="clearOutput"
      @toggle-theme="toggleTheme"
      @open-settings="openSettings"
    />
    
    <div class="app-body">
      <aside class="sidebar" :style="{ width: sidebarWidth + 'px' }">
        <ConnectionPanel />
        <KVOperationPanel />
        <AdvancedOptions />
        <SSHManager v-if="executeMode === 'ssh'" />
      </aside>

      <div class="resizer" @mousedown="startResize"></div>

      <main class="main-content">
        <div class="output-container">
          <div class="result-panel">
            <div class="panel-toolbar">
              <div class="panel-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
                结果
              </div>
            </div>
            <div class="panel-content">
              <table class="data-table">
                <thead>
                  <tr>
                    <th class="col-index">序号</th>
                    <th class="col-version">版本</th>
                    <th class="col-key">Key</th>
                    <th class="col-value">Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="tableData.length === 0">
                    <td colspan="4" class="empty-cell">暂无数据</td>
                  </tr>
                  <tr v-for="row in tableData" :key="row.index">
                    <td>{{ row.index }}</td>
                    <td>{{ row.version }}</td>
                    <td>
                      <span
                        class="cell-ellipsis"
                        @mouseenter="showTooltip($event, row.key)"
                        @mouseleave="hideTooltip"
                      >{{ row.key }}</span>
                    </td>
                    <td>
                      <span
                        class="cell-ellipsis"
                        @mouseenter="showTooltip($event, row.value)"
                        @mouseleave="hideTooltip"
                      >{{ row.value }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <OutputTerminal />
        </div>
        <CommandBar />
      </main>
    </div>
    
    <SettingsDialog v-model:visible="showSettings" :execute-mode="executeMode" />
    
    <div class="toast-container">
      <div
        v-for="toast in outputStore.toasts"
        :key="toast.id"
        :class="['toast', `toast-${toast.type}`]"
      >
        {{ toast.message }}
      </div>
    </div>

    <!-- Tooltip -->
    <div v-if="tooltip.show" class="tooltip" :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }">
      {{ tooltip.text }}
    </div>
  </div>
</template>

<style scoped>
.app-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.resizer {
  width: 1px;
  background: var(--border-color);
  cursor: col-resize;
  flex-shrink: 0;
  transition: background 0.2s;
}

.resizer:hover {
  background: var(--accent);
}

.output-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.result-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-bottom: 1px solid var(--border-color);
}

.panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 13px;
  color: var(--text-primary);
}

.panel-content {
  flex: 1;
  overflow: auto;
  background: var(--bg-primary);
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  table-layout: fixed;
}

.data-table thead {
  background: var(--bg-secondary);
  position: sticky;
  top: 0;
}

.data-table th {
  padding: 10px 12px;
  text-align: left;
  font-weight: 600;
  color: var(--text-primary);
  border-right: 2px solid var(--border-color);
  border-bottom: 2px solid var(--border-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.data-table th:last-child {
  border-right: none;
}

.data-table td {
  padding: 10px 12px;
  border-right: 2px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.data-table td:last-child {
  border-right: none;
}

/* 固定列宽 */
.data-table .col-index {
  width: 40px;
  min-width: 40px;
  max-width: 40px;
}

.data-table .col-key {
  width: 30%;
}

.data-table .col-value {
  width: 60%;
}

.data-table .col-version {
  width: 50px;
  min-width: 50px;
}

.data-table tbody tr:hover {
  background: var(--bg-secondary);
}

.data-table tbody tr:last-child td {
  border-bottom: none;
}

.data-table .empty-cell {
  text-align: center;
  color: var(--text-secondary);
  padding: 40px;
}

/* Tooltip 样式 */
.tooltip {
  position: fixed;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text-primary);
  max-width: 500px;
  word-break: break-all;
  z-index: 1000;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  pointer-events: none;
}

.cell-ellipsis {
  display: block;
  cursor: default;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
}
</style>