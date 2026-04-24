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
}

interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'warning'
}

export const useOutputStore = defineStore('output', () => {
  const outputs = ref<OutputItem[]>([])
  const toasts = ref<Toast[]>([])

  function addOutput(item: OutputItem) {
    outputs.value.push(item)
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
    setTimeout(() => {
      toasts.value = toasts.value.filter(t => t.id !== toast.id)
    }, 3000)
  }

  return {
    outputs,
    toasts,
    addOutput,
    clear,
    addToast
  }
})