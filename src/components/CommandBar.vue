<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useConnectionStore } from '../stores/connection'
import { useOutputStore } from '../stores/output'
import { useSettingsStore } from '../stores/settings'
import { useSSHStore } from '../stores/ssh'
import { v4 as uuidv4 } from 'uuid'

const connectionStore = useConnectionStore()
const outputStore = useOutputStore()
const settingsStore = useSettingsStore()
const sshStore = useSSHStore()

const customCommand = ref('')

async function executeCustomCommand() {
  if (outputStore.isExecuting) {
    return
  }
  if (!customCommand.value.trim()) {
    outputStore.addToast('请输入要执行的命令', 'warning')
    return
  }
  if (connectionStore.mode === 'ssh' && !sshStore.isConnected) {
    outputStore.addToast('当前未建立 SSH 连接，请先连接服务器后再执行命令', 'error')
    return
  }

  outputStore.startExecute()
  outputStore.addToast('正在执行...', 'success')

  try {
    let result: any

    if (connectionStore.mode === 'ssh' && sshStore.isConnected) {
      result = await window.api.ssh.execute(`${connectionStore.toolPath} ${connectionStore.endpointFlag} ${customCommand.value}`)
    } else {
      result = await window.api.craftctl.execute({
        command: customCommand.value,
        mode: connectionStore.mode,
        endpoint: connectionStore.endpoint,
        options: {
          prefix: settingsStore.prefixQuery,
          keys: settingsStore.keysOnly
        }
      })
    }

    if (!settingsStore.preserveOutput) {
      outputStore.clear()
    }

    outputStore.addOutput({
      id: uuidv4(),
      command: `${connectionStore.toolPath} ${connectionStore.endpointFlag} ${customCommand.value}`,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      duration: result.duration,
      timestamp: Date.now()
    })

    await connectionStore.saveAddress()
    customCommand.value = ''
  } finally {
    outputStore.endExecute()
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.ctrlKey && e.key === 'Enter') {
    executeCustomCommand()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="command-bar">
    <div class="cmd-input-wrapper">
      <input
        class="cmd-input"
        v-model="customCommand"
        placeholder="输入自定义命令，如: -h"
        :disabled="outputStore.isExecuting"
        @keydown="handleKeydown"
      />
      <span class="cmd-hint">Ctrl + Enter</span>
    </div>
    <button class="btn btn-primary" style="padding: 9px 20px;" @click="executeCustomCommand" :disabled="outputStore.isExecuting">
      {{ outputStore.isExecuting ? '执行中...' : '执行' }}
    </button>
  </div>
</template>