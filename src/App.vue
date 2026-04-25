<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
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

onMounted(async () => {
  await settingsStore.loadSettings()
  await connectionStore.loadToolPath()
  await connectionStore.loadLocalConnection()
  executeMode.value = 'local'
  connectionStore.setMode('local')

  const checkResult = await window.api.craftctl.check()
  if (!checkResult.available) {
    executeMode.value = 'ssh'
    connectionStore.setMode('ssh')
  }
})

function toggleMode(mode: 'local' | 'ssh') {
  if (executeMode.value === mode) return

  // 先保存当前模式的连接配置
  connectionStore.saveCurrentConnection()

  executeMode.value = mode
  connectionStore.setMode(mode)
  window.api.store.set('executeMode', mode)

  if (mode === 'local') {
    connectionStore.loadLocalConnection()
  } else if (mode === 'ssh') {
    // 切换到 SSH 模式时，加载当前选中的 SSH 配置对应的连接信息
    if (sshStore.selectedConfigId) {
      connectionStore.loadSSHConnection(sshStore.selectedConfigId)
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

const currentModeLabel = computed(() => {
  return executeMode.value === 'local' ? '本地模式' : 'SSH 远程'
})
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
      <aside class="sidebar">
        <ConnectionPanel />
        <KVOperationPanel />
        <AdvancedOptions />
        <SSHManager v-if="executeMode === 'ssh'" />
      </aside>
      
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
</style>