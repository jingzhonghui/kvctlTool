<script setup lang="ts">
import { ref } from 'vue'
import { useConnectionStore } from '../stores/connection'
import { useOutputStore } from '../stores/output'
import { useSettingsStore } from '../stores/settings'
import { useSSHStore } from '../stores/ssh'

const connectionStore = useConnectionStore()
const outputStore = useOutputStore()
const settingsStore = useSettingsStore()
const sshStore = useSSHStore()

const key = ref('')
const value = ref('')

async function executeCommand(cmd: string, args: string[] = []) {
  if (outputStore.isExecuting) {
    return
  }
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

  const opts: string[] = []
  if (settingsStore.prefixQuery) opts.push('--prefix')
  if (settingsStore.keysOnly) opts.push('--keys-only')
  const fullCmd = [cmd, ...args, ...opts].join(' ').trim()
  const displayCmd = `${connectionStore.toolPath} ${connectionStore.endpointFlag} ${fullCmd}`

  if (!settingsStore.preserveOutput) {
    outputStore.clear()
  }

  outputStore.startExecute()
  const outputId = outputStore.addPendingOutput(displayCmd)

  try {
    let result: any

    if (connectionStore.mode === 'ssh' && sshStore.isConnected) {
      result = await window.api.ssh.execute(displayCmd)
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

    outputStore.updateOutputResult(outputId, {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      duration: result.duration
    })

    await connectionStore.saveAddress()
  } finally {
    outputStore.endExecute()
  }
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
      <button class="btn btn-primary" @click="handleGet" :disabled="outputStore.isExecuting">get</button>
      <button class="btn btn-primary" @click="handlePut" :disabled="outputStore.isExecuting">put</button>
      <button class="btn btn-primary" @click="handleMemberList" :disabled="outputStore.isExecuting">member list</button>
      <button class="btn btn-danger" @click="handleDel" :disabled="outputStore.isExecuting">del</button>
    </div>
  </div>
</template>