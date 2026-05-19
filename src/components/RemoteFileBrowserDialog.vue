<script setup lang="ts">
import { ref, watch } from 'vue'

interface RemoteFile {
  name: string
  isDir: boolean
}

interface RemoteDirResult {
  dir: string
  files: RemoteFile[]
}

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'select', value: string | null): void
}>()

const currentDir = ref('')
const entries = ref<RemoteFile[]>([])
const loading = ref(false)
const error = ref('')
const selectedPath = ref('')

watch(() => props.visible, (val) => {
  if (val) {
    loadDirectory('')
  } else {
    error.value = ''
    selectedPath.value = ''
  }
})

async function loadDirectory(dir: string) {
  loading.value = true
  error.value = ''
  try {
    const result = await window.api.dialog.openFileRemote(dir) as RemoteDirResult | null
    if (result && result.dir) {
      currentDir.value = result.dir
      const files = result.files || []
      entries.value = files.sort((a, b) => {
        if (a.isDir === b.isDir) return a.name.localeCompare(b.name)
        return a.isDir ? -1 : 1
      })
      selectedPath.value = ''
    } else {
      error.value = '无法读取远程目录'
    }
  } catch (e: any) {
    error.value = e?.message || '读取远程目录失败'
  } finally {
    loading.value = false
  }
}

function goUp() {
  if (!currentDir.value || currentDir.value === '/') return
  const parts = currentDir.value.split('/').filter(Boolean)
  if (parts.length === 0) {
    loadDirectory('/')
  } else {
    parts.pop()
    loadDirectory('/' + parts.join('/'))
  }
}

function selectEntry(name: string, isDir: boolean) {
  const separator = currentDir.value.endsWith('/') ? '' : '/'
  const fullPath = currentDir.value + separator + name
  if (isDir) {
    loadDirectory(fullPath)
  } else {
    selectedPath.value = fullPath
  }
}

function confirmSelection() {
  if (selectedPath.value) {
    emit('select', selectedPath.value)
    closeDialog()
  }
}

function closeDialog() {
  emit('update:visible', false)
}
</script>

<template>
  <div class="remote-overlay" v-if="props.visible">
    <div class="remote-modal">
      <div class="remote-header">
        <span class="remote-title">选择远程文件</span>
        <button class="close-btn" @click="closeDialog">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="remote-body">
        <div class="remote-toolbar">
          <button class="btn-icon" title="上级目录" @click="goUp" :disabled="currentDir === '/' || loading">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 14L4 9l5-5"/>
              <path d="M4 9h16"/>
            </svg>
          </button>
          <div class="current-path">{{ currentDir || '/' }}</div>
        </div>

        <div class="file-list-wrapper">
          <div v-if="loading" class="loading">正在加载…</div>
          <div v-else-if="error" class="remote-error">{{ error }}</div>
          <div v-else-if="entries.length === 0" class="empty-hint">空目录</div>
          <div v-else class="file-list">
            <div
              v-for="entry in entries"
              :key="entry.name"
              :class="['file-item', { selected: selectedPath === (currentDir + (currentDir.endsWith('/') ? '' : '/') + entry.name) }]"
              @click="selectEntry(entry.name, entry.isDir)"
            >
              <svg v-if="entry.isDir" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <span class="file-name">{{ entry.name }}</span>
              <span v-if="entry.isDir" class="file-tag">文件夹</span>
            </div>
          </div>
        </div>
      </div>

      <div class="remote-footer">
        <div class="selected-label" v-if="selectedPath">已选: {{ selectedPath }}</div>
        <div class="remote-actions">
          <button class="btn" @click="closeDialog">取消</button>
          <button class="btn btn-primary" :disabled="!selectedPath" @click="confirmSelection">确认选择</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.remote-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.remote-modal {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  width: 560px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
}

.remote-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-color);
}

.remote-title {
  font-size: 15px;
  font-weight: 600;
}

.close-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.remote-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.remote-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-primary);
}

.btn-icon {
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-icon:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--text-primary);
}

.btn-icon:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.current-path {
  flex: 1;
  font-size: 12px;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-list-wrapper {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}

.loading,
.empty-hint,
.remote-error {
  padding: 24px;
  text-align: center;
  font-size: 13px;
  color: var(--text-secondary);
}

.remote-error {
  color: var(--danger);
}

.file-list {
  display: flex;
  flex-direction: column;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  cursor: pointer;
  transition: background 0.15s;
  font-size: 13px;
}

.file-item:hover {
  background: var(--bg-tertiary);
}

.file-item.selected {
  background: rgba(88, 166, 255, 0.12);
}

.file-name {
  flex: 1;
  color: var(--text-primary);
  word-break: break-all;
}

.file-tag {
  font-size: 11px;
  color: var(--warning);
  border: 1px solid var(--warning);
  border-radius: 3px;
  padding: 0 5px;
  opacity: 0.7;
}

.remote-footer {
  padding: 12px 18px;
  border-top: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.selected-label {
  font-size: 12px;
  color: var(--text-secondary);
  word-break: break-all;
  font-family: var(--font-mono);
}

.remote-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.remote-actions .btn {
  padding: 6px 14px;
}
</style>
