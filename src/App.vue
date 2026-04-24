<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useConnectionStore } from './stores/connection'
import { useOutputStore } from './stores/output'
import { useSettingsStore } from './stores/settings'
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

const executeMode = ref<'local' | 'ssh'>('local')
const showSettings = ref(false)

onMounted(async () => {
  await settingsStore.loadSettings()
  await connectionStore.loadToolPath()
  const savedMode = await window.api.store.get('executeMode')
  if (savedMode) executeMode.value = savedMode
  
  const checkResult = await window.api.craftctl.check()
  if (!checkResult.available) {
    executeMode.value = 'ssh'
  }
})

function toggleMode(mode: 'local' | 'ssh') {
  executeMode.value = mode
  connectionStore.setMode(mode)
  window.api.store.set('executeMode', mode)
}

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
    
    <SettingsDialog v-model:visible="showSettings" />
    
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