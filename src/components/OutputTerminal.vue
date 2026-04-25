<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { useOutputStore } from '../stores/output'

const outputStore = useOutputStore()
const outputAreaRef = ref<HTMLElement | null>(null)
const showSearch = ref(false)
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

function highlightText(text: string): string {
  if (!searchQuery.value || !text) return text
  const escaped = searchQuery.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escaped})`, 'gi')
  return text.replace(regex, '<mark class="highlight">$1</mark>')
}

function toggleSearch() {
  showSearch.value = !showSearch.value
  if (!showSearch.value) {
    searchQuery.value = ''
  }
}

function clearSearch() {
  searchQuery.value = ''
}

function copyAll() {
  const text = outputStore.outputs.map(o => {
    const parts = []
    parts.push(`> ${o.command}`)
    if (o.stdout) parts.push(o.stdout)
    if (o.stderr) parts.push(o.stderr)
    return parts.join('\n')
  }).join('\n\n')
  navigator.clipboard.writeText(text)
  if (text) {
    outputStore.addToast('已复制到剪贴板', 'success')
  }
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
        <button class="toolbar-btn" :class="{ active: showSearch }" @click="toggleSearch">搜索 {{ searchQuery ? `(${filteredOutputs.length})` : '' }}</button>
        <button class="toolbar-btn" @click="clearOutput">清空</button>
        <button class="toolbar-btn" :class="{ active: autoScroll }" @click="toggleAutoScroll">滚动 {{ autoScroll ? '锁定' : '自动' }}</button>
      </div>
    </div>
    <div v-if="showSearch" class="search-bar">
      <input 
        class="search-input" 
        v-model="searchQuery" 
        placeholder="输入关键字搜索输出..." 
        autofocus
      />
      <span class="search-count" v-if="searchQuery">{{ filteredOutputs.length }} / {{ outputStore.outputs.length }}</span>
      <button class="search-clear" @click="clearSearch" v-if="searchQuery">&times;</button>
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
        <div class="output-cmd" v-html="highlightText('&gt; ' + output.command)"></div>
        <div v-if="output.stdout" class="output-body" v-html="highlightText(output.stdout)"></div>
        <div v-if="output.stderr" class="output-error" v-html="highlightText(output.stderr)"></div>
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

.search-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color);
}

.search-input {
  flex: 1;
  padding: 6px 10px;
  background: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 12px;
  outline: none;
}

.search-input:focus {
  border-color: var(--accent);
}

.search-count {
  font-size: 11px;
  color: var(--text-secondary);
}

.search-clear {
  width: 20px;
  height: 20px;
  border: none;
  background: var(--border-color);
  border-radius: 50%;
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.search-clear:hover {
  background: var(--danger);
  color: #fff;
}

:deep(.highlight) {
  background: rgba(255, 215, 0, 0.4);
  color: inherit;
  padding: 1px 2px;
  border-radius: 2px;
}
</style>