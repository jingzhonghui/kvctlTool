import { defineStore } from 'pinia'
import { ref } from 'vue'
import { v4 as uuidv4 } from 'uuid'

interface OutputItem {
  id: string
  command: string
  stdout: string
  stderr: string
  exitCode: number
  duration: number
  timestamp: number
  pending?: boolean
}

interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'warning'
}

export const useOutputStore = defineStore('output', () => {
  const outputs = ref<OutputItem[]>([])
  const toasts = ref<Toast[]>([])
  const isExecuting = ref(false)

  function addOutput(item: OutputItem) {
    outputs.value.push(item)
  }

  function addPendingOutput(command: string): string {
    const id = uuidv4()
    outputs.value.push({
      id,
      command,
      stdout: '',
      stderr: '',
      exitCode: 0,
      duration: 0,
      timestamp: Date.now(),
      pending: true
    })
    return id
  }

  function updateOutputResult(id: string, result: { stdout: string; stderr: string; exitCode: number; duration: number }) {
    const output = outputs.value.find(o => o.id === id)
    if (output) {
      output.stdout = result.stdout
      output.stderr = result.stderr
      output.exitCode = result.exitCode
      output.duration = result.duration
      output.pending = false
    }
  }

  function clear() {
    outputs.value = []
  }

  function addToast(message: string, type: Toast['type'] = 'success') {
    const toast: Toast = {
      id: uuidv4(),
      message,
      type
    }
    toasts.value.push(toast)
    const duration = type === 'error' ? 3000 : 1000
    setTimeout(() => {
      toasts.value = toasts.value.filter(t => t.id !== toast.id)
    }, duration)
  }

  function startExecute() {
    isExecuting.value = true
  }

  function endExecute() {
    isExecuting.value = false
  }

  return {
    outputs,
    toasts,
    isExecuting,
    addOutput,
    addPendingOutput,
    updateOutputResult,
    clear,
    addToast,
    startExecute,
    endExecute
  }
})