<script setup lang="ts">
import { ref } from 'vue'
import { useConnectionStore } from '../stores/connection'
import { useOutputStore } from '../stores/output'
import { useSettingsStore } from '../stores/settings'
import { useSSHStore } from '../stores/ssh'
import { v4 as uuidv4 } from 'uuid'

const connectionStore = useConnectionStore()
const outputStore = useOutputStore()
const settingsStore = useSettingsStore()
const sshStore = useSSHStore()

const key = ref('')
const value = ref('')
const loading = ref(false)

async function executeCommand(cmd: string, args: string[] = []) {
  if (!key.value && (cmd === 'get' || cmd === 'del')) {
    outputStore.addToast('请输入 Key', 'warning')
    return
  }
  if (!value.value && cmd === 'put') {
    outputStore.addToast('请输入 Value', 'warning')
    return
  }
  if (connectionStore.mode === 'ssh' && !sshStore.isConnected) {
    outputStore.addToast('当前未建立 SSH 连接，请先连接服务器后再执行命令', 'error')
    return
  }

  loading.value = true
  outputStore.addToast('正在执行...', 'success')

  let result: any
  const opts: string[] = []
  if (settingsStore.prefixQuery) opts.push('--prefix')
  if (settingsStore.keysOnly) opts.push('--keys')
  const fullCmd = [cmd, ...args, ...opts].join(' ').trim()

  if (connectionStore.mode === 'ssh' && sshStore.isConnected) {
    result = await window.api.ssh.execute(`${connectionStore.toolPath} ${connectionStore.endpointFlag} ${fullCmd}`)
  } else {
    result = await window.api.craftctl.execute({
      command: fullCmd,
      mode: connectionStore.mode,
      endpoint: connectionStore.endpoint,
      options: {
        prefix: false,
        keys: false
      }
    })
  }

  if (!settingsStore.preserveOutput) {
    outputStore.clear()
  }

  outputStore.addOutput({
    id: uuidv4(),
    command: `${connectionStore.toolPath} ${connectionStore.endpointFlag} ${fullCmd}`,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    duration: result.duration,
    timestamp: Date.now()
  })

  await connectionStore.saveAddress()
  loading.value = false
}

function handleGet() {
  executeCommand('get', [key.value])
}

function handlePut() {
  executeCommand('put', [key.value, value.value])
}

function handleDel() {
  executeCommand('del', [key.value])
}

function handleMemberList() {
  executeCommand('member list')
}
</script>

<template>
  <div class="sidebar-section">
    <div class="section-title">KV 操作</div>
    <div class="form-group">
      <label class="form-label">Key</label>
      <input class="form-input" v-model="key" placeholder="输入键名" />
    </div>
    <div class="form-group">
      <label class="form-label">Value</label>
      <input class="form-input" v-model="value" placeholder="输入键值" />
    </div>
    <div class="btn-grid">
      <button class="btn btn-primary" @click="handleGet" :disabled="loading">get</button>
      <button class="btn btn-primary" @click="handlePut" :disabled="loading">put</button>
      <button class="btn btn-primary" @click="handleMemberList" :disabled="loading">member list</button>
      <button class="btn btn-danger" @click="handleDel" :disabled="loading">del</button>
    </div>
  </div>
</template>