import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'

export const useConnectionStore = defineStore('connection', () => {
  const protocol = ref<'tcp' | 'udp'>('tcp')
  const host = ref('127.0.0.1')
  const port = ref(7375)
  const mode = ref<'local' | 'ssh'>('local')
  const history = ref<any[]>([])
  const toolPath = ref('craftctl')
  const selectedAddress = ref('')

  const endpoint = computed(() => `${protocol.value}://${host.value}:${port.value}`)

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

  return {
    protocol,
    host,
    port,
    mode,
    history,
    toolPath,
    endpoint,
    setMode,
    setToolPath,
    loadToolPath,
    saveAddress,
    loadHistory
  }
})