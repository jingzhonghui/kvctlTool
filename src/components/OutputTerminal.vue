<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { useOutputStore } from '../stores/output'

const outputStore = useOutputStore()
const outputAreaRef = ref<HTMLElement | null>(null)
const searchQuery = ref('')
const autoScroll = ref(true)

const filteredOutputs = computed(() => {
  if (!searchQuery.value) return outputStore.outputs
  const query = searchQuery.value.toLowerCase()
  return outputStore.outputs.filter(o => 
    o.command.toLowerCase().includes(query) ||
    o.stdout.toLowerCase().includes(query) ||
    o.stderr.toLowerCase().includes(query)
  )
})

function formatTime(timestamp: number) {
  const date = new Date(timestamp)
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function copyAll() {
  const text = outputStore.outputs.map(o => o.stdout).join('\n')
  navigator.clipboard.writeText(text)
}

function clearOutput() {
  outputStore.clear()
}

function toggleAutoScroll() {
  autoScroll.value = !autoScroll.value
}

watch(() => outputStore.outputs.length, async () => {
  await nextTick()
  if (autoScroll.value && outputAreaRef.value) {
    outputAreaRef.value.scrollTop = outputAreaRef.value.scrollHeight
  }
})

const scrollToBottom = () => {
  if (outputAreaRef.value) {
    outputAreaRef.value.scrollTop = outputAreaRef.value.scrollHeight
  }
}
</script>

<template>
  <div class="output-panel">
    <div class="output-toolbar">
      <div class="output-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
        </svg>
        命令输出
      </div>
      <div class="output-actions">
        <button class="toolbar-btn" @click="copyAll">复制全部</button>
        <button class="toolbar-btn" @click="searchQuery = searchQuery ? '' : prompt('搜索关键字') || ''">搜索</button>
        <button class="toolbar-btn" @click="clearOutput">清空</button>
        <button class="toolbar-btn" :class="{ active: autoScroll }" @click="toggleAutoScroll">滚动 {{ autoScroll ? '锁定' : '自动' }}</button>
      </div>
    </div>
    <div class="output-area" ref="outputAreaRef">
      <div v-if="!outputStore.outputs.length" class="empty-state">
        命令输出将显示在这里
      </div>
      <div v-for="output in filteredOutputs" :key="output.id" class="output-block">
        <div class="output-meta">
          <span class="output-time">{{ formatTime(output.timestamp) }}</span>
          <span class="output-duration">{{ formatDuration(output.duration) }}</span>
        </div>
        <div class="output-cmd">&gt; {{ output.command }}</div>
        <div v-if="output.stdout" class="output-body">{{ output.stdout }}</div>
        <div v-if="output.stderr" class="output-error">{{ output.stderr }}</div>
        <div class="output-divider">&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt; end &lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.empty-state {
  color: var(--text-secondary);
  text-align: center;
  padding: 40px;
  font-size: 13px;
}

.toolbar-btn.active {
  color: var(--accent);
  background: var(--bg-tertiary);
}
</style>