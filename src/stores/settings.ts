import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const useSettingsStore = defineStore('settings', () => {
  const theme = ref<'dark' | 'light'>('dark')
  const prefixQuery = ref(false)
  const keysOnly = ref(false)
  const preserveOutput = ref(false)
  const outputFontSize = ref(14)
  const uiFontSize = ref(14)
  const autoScroll = ref(true)

  async function loadSettings() {
    const saved = await window.api.store.get('settings')
    if (saved) {
      prefixQuery.value = saved.prefixQuery ?? false
      keysOnly.value = saved.keysOnly ?? false
      preserveOutput.value = saved.preserveOutput ?? false
      outputFontSize.value = saved.outputFontSize ?? 14
      uiFontSize.value = saved.uiFontSize ?? 14
      autoScroll.value = saved.autoScroll ?? true
      theme.value = saved.theme ?? 'dark'
    }
    applyTheme()
    applyElementPlusTheme()
    applyFontSizes()
  }

  async function saveSettings() {
    await window.api.store.set('settings', {
      prefixQuery: prefixQuery.value,
      keysOnly: keysOnly.value,
      preserveOutput: preserveOutput.value,
      outputFontSize: outputFontSize.value,
      uiFontSize: uiFontSize.value,
      autoScroll: autoScroll.value,
      theme: theme.value
    })
  }

  function applyFontSizes() {
    document.documentElement.style.setProperty('--output-font-size', `${outputFontSize.value}px`)
    document.documentElement.style.setProperty('--ui-font-size', `${uiFontSize.value}px`)
  }

  function setOutputFontSize(size: number) {
    outputFontSize.value = size
    applyFontSizes()
    saveSettings()
  }

  function setUiFontSize(size: number) {
    uiFontSize.value = size
    applyFontSizes()
    saveSettings()
  }

  function applyTheme() {
    if (theme.value === 'dark') {
      document.documentElement.style.setProperty('--bg-primary', '#0d1117')
      document.documentElement.style.setProperty('--bg-secondary', '#161b22')
      document.documentElement.style.setProperty('--bg-tertiary', '#21262d')
      document.documentElement.style.setProperty('--border-color', '#30363d')
      document.documentElement.style.setProperty('--text-primary', '#c9d1d9')
      document.documentElement.style.setProperty('--text-secondary', '#8b949e')
      document.documentElement.style.setProperty('--input-bg', '#0d1117')
    } else {
      document.documentElement.style.setProperty('--bg-primary', '#ffffff')
      document.documentElement.style.setProperty('--bg-secondary', '#f6f8fa')
      document.documentElement.style.setProperty('--bg-tertiary', '#f0f3f6')
      document.documentElement.style.setProperty('--border-color', '#d0d7de')
      document.documentElement.style.setProperty('--text-primary', '#1f2328')
      document.documentElement.style.setProperty('--text-secondary', '#656d76')
      document.documentElement.style.setProperty('--input-bg', '#ffffff')
    }
  }

  function applyElementPlusTheme() {
    const el = document.documentElement
    if (theme.value === 'dark') {
      el.setAttribute('class', 'dark')
    } else {
      el.setAttribute('class', '')
    }
  }

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
    applyTheme()
    applyElementPlusTheme()
    saveSettings()
  }

  function togglePrefixQuery() {
    prefixQuery.value = !prefixQuery.value
    saveSettings()
  }

  function toggleKeysOnly() {
    keysOnly.value = !keysOnly.value
    saveSettings()
  }

  function togglePreserveOutput() {
    preserveOutput.value = !preserveOutput.value
    saveSettings()
  }

  return {
    theme,
    prefixQuery,
    keysOnly,
    preserveOutput,
    outputFontSize,
    uiFontSize,
    autoScroll,
    loadSettings,
    saveSettings,
    toggleTheme,
    togglePrefixQuery,
    toggleKeysOnly,
    togglePreserveOutput,
    setOutputFontSize,
    setUiFontSize
  }
})