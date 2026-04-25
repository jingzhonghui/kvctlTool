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
        <OutputTerminal />
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
</style>