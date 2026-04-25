import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { v4 as uuidv4 } from 'uuid'

export interface ConnectionConfig {
  protocol: 'tcp' | 'udp' | 'http'
  host: string
  port: number
}

export const useConnectionStore = defineStore('connection', () => {
  const protocol = ref<'tcp' | 'udp' | 'http'>('tcp')
  const host = ref('127.0.0.1')
  const port = ref(7375)
  const mode = ref<'local' | 'ssh'>('local')
  const history = ref<any[]>([])
  const toolPath = ref('craftctl')
  const selectedAddress = ref('')
  const currentSshConfigId = ref<string | null>(null)

  const endpoint = computed(() => `${protocol.value}://${host.value}:${port.value}`)

  const endpointFlag = computed(() => {
    if (protocol.value === 'http') {
      return `--endpoints=${endpoint.value}`
    }
    return `-e ${endpoint.value}`
  })

  async function setMode(newMode: 'local' | 'ssh') {
    mode.value = newMode
  }

  async function setToolPath(path: string) {
    toolPath.value = path
    await window.api.store.set('toolPath', path)
  }

  async function loadToolPath() {
    const saved = await window.api.store.get('toolPath')
    if (saved) toolPath.value = saved
  }

  // ================== 本地连接配置持久化 ==================

  async function loadLocalConnection() {
    const saved = await window.api.store.get('localConnection')
    if (saved) {
      if (saved.protocol) protocol.value = saved.protocol
      if (saved.host) host.value = saved.host
      if (saved.port) port.value = saved.port
    }
  }

  async function saveLocalConnection() {
    if (mode.value !== 'local') return
    await window.api.store.set('localConnection', {
      protocol: protocol.value,
      host: host.value,
      port: port.value
    })
  }

  // ================== SSH 关联连接配置持久化 ==================

  async function loadSSHConnection(sshConfigId: string | null) {
    if (!sshConfigId) return
    currentSshConfigId.value = sshConfigId
    const map = await window.api.store.get('sshConnectionMap')
    const saved = map?.[sshConfigId]
    if (saved) {
      if (saved.protocol) protocol.value = saved.protocol
      if (saved.host) host.value = saved.host
      if (saved.port) port.value = saved.port
    }
  }

  async function saveSSHConnection(sshConfigId: string | null) {
    if (mode.value !== 'ssh' || !sshConfigId) return
    const map = (await window.api.store.get('sshConnectionMap')) || {}
    map[sshConfigId] = {
      protocol: protocol.value,
      host: host.value,
      port: port.value
    }
    await window.api.store.set('sshConnectionMap', map)
  }

  // ================== 通用保存（根据当前模式自动判断） ==================

  async function saveCurrentConnection() {
    if (mode.value === 'local') {
      await saveLocalConnection()
    } else if (mode.value === 'ssh' && currentSshConfigId.value) {
      await saveSSHConnection(currentSshConfigId.value)
    }
  }

  // ================== 历史地址 ==================

  async function saveAddress() {
    if (!host.value) return
    const addr = {
      id: uuidv4(),
      protocol: protocol.value,
      host: host.value,
      port: port.value,
      lastUsedAt: Date.now()
    }
    await window.api.db.saveServiceAddress(addr)
    await loadHistory()
  }

  async function loadHistory() {
    const addresses = await window.api.db.getServiceAddresses()
    history.value = addresses || []
  }

  // 监听连接字段变化，自动持久化（debounce 通过调用方控制）
  watch([protocol, host, port], () => {
    saveCurrentConnection()
  })

  return {
    protocol,
    host,
    port,
    mode,
    history,
    toolPath,
    currentSshConfigId,
    endpoint,
    endpointFlag,
    setMode,
    setToolPath,
    loadToolPath,
    loadLocalConnection,
    saveLocalConnection,
    loadSSHConnection,
    saveSSHConnection,
    saveCurrentConnection,
    saveAddress,
    loadHistory
  }
})