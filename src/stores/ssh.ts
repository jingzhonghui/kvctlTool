import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useOutputStore } from './output'

export const useSSHStore = defineStore('ssh', () => {
  const configs = ref<any[]>([])
  const selectedConfigId = ref<string | null>(null)
  const connectionStatus = ref<Record<string, 'connected' | 'disconnected' | 'error'>>({})
  const isConnected = ref(false)

  const selectedConfig = computed(() => 
    configs.value.find(c => c.id === selectedConfigId.value)
  )

  async function loadConfigs() {
    const stored = await window.api.db.getSSHConfigs()
    configs.value = stored || []
  }

  async function saveConfig(config: any) {
    await window.api.db.saveSSHConfig(config)
    await loadConfigs()
  }

  async function deleteConfig(id: string) {
    await window.api.db.deleteSSHConfig(id)
    if (selectedConfigId.value === id) {
      selectedConfigId.value = null
      isConnected.value = false
    }
    await loadConfigs()
  }

  async function selectConfig(config: any) {
    const outputStore = useOutputStore()
    selectedConfigId.value = config.id
    
    const result = await window.api.ssh.connect({
      host: config.host,
      port: config.port,
      username: config.username,
      authType: config.authType,
      password: config.password,
      privateKeyPath: config.privateKeyPath,
      passphrase: config.passphrase
    })
    
    if (result.success) {
      connectionStatus.value[config.id] = 'connected'
      isConnected.value = true
      outputStore.addToast(`SSH 连接成功: ${config.name}`, 'success')
    } else {
      connectionStatus.value[config.id] = 'error'
      isConnected.value = false
      outputStore.addToast(`SSH 连接失败: ${result.error}`, 'error')
    }
  }

  function getStatusClass(id: string) {
    return connectionStatus.value[id] || 'disconnected'
  }

  async function disconnect() {
    await window.api.ssh.disconnect()
    isConnected.value = false
    connectionStatus.value[selectedConfigId.value || ''] = 'disconnected'
  }

  return {
    configs,
    selectedConfigId,
    selectedConfig,
    connectionStatus,
    isConnected,
    loadConfigs,
    saveConfig,
    deleteConfig,
    selectConfig,
    getStatusClass,
    disconnect
  }
})