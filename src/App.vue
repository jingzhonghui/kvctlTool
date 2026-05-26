<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue'
import { useConnectionStore } from './stores/connection'
import { useOutputStore } from './stores/output'
import { useSettingsStore } from './stores/settings'
import { useSSHStore } from './stores/ssh'
import { useAIStore } from './stores/ai'
import ConnectionPanel from './components/ConnectionPanel.vue'
import KVOperationPanel from './components/KVOperationPanel.vue'
import AdvancedOptions from './components/AdvancedOptions.vue'
import SSHManager from './components/SSHManager.vue'
import AICommandPanel from './components/AICommandPanel.vue'
import OutputTerminal from './components/OutputTerminal.vue'
import CommandBar from './components/CommandBar.vue'
import AppHeader from './components/AppHeader.vue'
import SettingsDialog from './components/SettingsDialog.vue'

const connectionStore = useConnectionStore()
const outputStore = useOutputStore()
const settingsStore = useSettingsStore()
const sshStore = useSSHStore()
const aiStore = useAIStore()

const executeMode = ref<'local' | 'ssh'>('local')
const showSettings = ref(false)
const showResultPanel = ref(true)
const sidebarWidth = ref(320)
const isResizing = ref(false)
const showAIAssistant = ref(false)
const aiPanelWidth = ref(350)

onMounted(async () => {
  await settingsStore.loadSettings()
  await connectionStore.loadToolPath()
  await aiStore.loadConfig()  // 加载 AI 配置

  const savedWidth = await window.api.store.get('sidebarWidth')
  if (savedWidth && typeof savedWidth === 'number') {
    sidebarWidth.value = savedWidth
  }

  const savedAIWidth = await window.api.store.get('aiPanelWidth')
  if (savedAIWidth && typeof savedAIWidth === 'number') {
    aiPanelWidth.value = savedAIWidth
  }

  const savedAIShow = await window.api.store.get('showAIAssistant')
  if (typeof savedAIShow === 'boolean') {
    showAIAssistant.value = savedAIShow
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

  // 初始化表格列宽
  window.addEventListener('resize', handleResize)
  setTimeout(initColumnWidths, 100)
})

onUnmounted(() => {
  stopResize()
  window.removeEventListener('resize', handleResize)
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

function toggleAIAssistant() {
  showAIAssistant.value = !showAIAssistant.value
  window.api.store.set('showAIAssistant', showAIAssistant.value)
}

const isAIResizing = ref(false)

function startAIResize() {
  isAIResizing.value = true
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onAIResize)
  document.addEventListener('mouseup', stopAIResize)
}

function onAIResize(e: MouseEvent) {
  if (!isAIResizing.value) return
  const minWidth = 280
  const maxWidth = window.innerWidth * 0.5
  // 从右侧计算宽度
  const width = window.innerWidth - e.clientX
  if (width >= minWidth && width <= maxWidth) {
    aiPanelWidth.value = width
  }
}

function stopAIResize() {
  if (!isAIResizing.value) return
  isAIResizing.value = false
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', onAIResize)
  document.removeEventListener('mouseup', stopAIResize)
  window.api.store.set('aiPanelWidth', aiPanelWidth.value)
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
  tableData.value = []
}

function toggleTheme() {
  settingsStore.toggleTheme()
}

function openSettings() {
  showSettings.value = true
}

function toggleResultPanel() {
  showResultPanel.value = !showResultPanel.value
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

// ============ 表格列宽调整 ============
interface ColumnConfig {
  key: string
  width: number
  minWidth: number
}

const tableContainerRef = ref<HTMLElement | null>(null)
const columnConfigs = ref<ColumnConfig[]>([
  { key: 'index', width: 0, minWidth: 50 },
  { key: 'version', width: 0, minWidth: 60 },
  { key: 'key', width: 0, minWidth: 100 },
  { key: 'value', width: 0, minWidth: 100 }
])
const resizingColumn = ref<number | null>(null)
const resizeStartX = ref(0)
const resizeStartWidth = ref(0)

// 初始化均分列宽
function initColumnWidths() {
  if (!tableContainerRef.value) return
  const containerWidth = tableContainerRef.value.clientWidth
  const count = columnConfigs.value.length
  const avgWidth = Math.floor(containerWidth / count)

  columnConfigs.value = columnConfigs.value.map(col => ({
    ...col,
    width: Math.max(col.minWidth, avgWidth)
  }))
}

// 开始调整列宽
function startColumnResize(index: number, e: MouseEvent) {
  e.preventDefault()
  resizingColumn.value = index
  resizeStartX.value = e.clientX
  resizeStartWidth.value = columnConfigs.value[index].width

  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onColumnResize)
  document.addEventListener('mouseup', stopColumnResize)
}

function onColumnResize(e: MouseEvent) {
  if (resizingColumn.value === null) return

  const delta = e.clientX - resizeStartX.value
  const newWidth = Math.max(
    columnConfigs.value[resizingColumn.value].minWidth,
    resizeStartWidth.value + delta
  )
  columnConfigs.value[resizingColumn.value].width = newWidth
}

function stopColumnResize() {
  resizingColumn.value = null
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', onColumnResize)
  document.removeEventListener('mouseup', stopColumnResize)
}

// 监听容器大小变化，重新均分列宽
function handleResize() {
  initColumnWidths()
}

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
      :show-result-panel="showResultPanel"
      :show-a-i-assistant="showAIAssistant"
      @toggle-mode="toggleMode"
      @clear-output="clearOutput"
      @toggle-theme="toggleTheme"
      @open-settings="openSettings"
      @toggle-result-panel="toggleResultPanel"
      @toggle-ai-assistant="toggleAIAssistant"
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
          <div class="result-panel" v-show="showResultPanel">
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
            <div class="panel-content" ref="tableContainerRef">
              <table class="data-table">
                <thead>
                  <tr>
                    <th
                      v-for="(col, index) in columnConfigs"
                      :key="col.key"
                      :style="{ width: col.width + 'px' }"
                      :class="'col-' + col.key"
                    >
                      <span class="th-content">
                        {{ col.key === 'index' ? '序号' : col.key === 'version' ? '版本' : col.key === 'key' ? 'Key' : 'Value' }}
                      </span>
                      <span
                        class="resize-handle"
                        @mousedown="startColumnResize(index, $event)"
                      ></span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="tableData.length === 0">
                    <td :colspan="columnConfigs.length" class="empty-cell">暂无数据</td>
                  </tr>
                  <tr v-for="row in tableData" :key="row.index">
                    <td :style="{ width: columnConfigs[0].width + 'px' }">{{ row.index }}</td>
                    <td :style="{ width: columnConfigs[1].width + 'px' }">{{ row.version }}</td>
                    <td :style="{ width: columnConfigs[2].width + 'px' }">
                      <span
                        class="cell-ellipsis"
                        @mouseenter="showTooltip($event, row.key)"
                        @mouseleave="hideTooltip"
                      >{{ row.key }}</span>
                    </td>
                    <td :style="{ width: columnConfigs[3].width + 'px' }">
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

      <!-- AI Assistant Panel -->
      <template v-if="showAIAssistant">
        <div class="ai-resizer" @mousedown="startAIResize"></div>
        <aside class="ai-sidebar" :style="{ width: aiPanelWidth + 'px' }">
          <AICommandPanel @open-settings="showSettings = true" />
        </aside>
      </template>
    </div>

    <SettingsDialog v-model:visible="showSettings" :execute-mode="executeMode" />

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
  width: 2px;
  background: var(--border-color);
  cursor: col-resize;
  flex-shrink: 0;
  transition: background 0.2s;
}

.resizer:hover {
  background: var(--accent);
}

.ai-sidebar {
  background: var(--bg-primary);
  border-left: 1px solid var(--border-color);
  overflow: hidden;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.ai-resizer {
  width: 2px;
  background: var(--border-color);
  cursor: col-resize;
  flex-shrink: 0;
  transition: background 0.2s;
}

.ai-resizer:hover {
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
  position: relative;
  user-select: none;
}

.data-table th:last-child {
  border-right: none;
}

.th-content {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-right: 8px;
}

.resize-handle {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: col-resize;
  background: transparent;
  transition: background 0.2s;
}

.resize-handle:hover {
  background: var(--accent);
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

/* 列宽通过 JS 动态控制 */

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