<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSSHStore } from '../stores/ssh'
import { useOutputStore } from '../stores/output'
import { v4 as uuidv4 } from 'uuid'

const sshStore = useSSHStore()
const outputStore = useOutputStore()

const showDialog = ref(false)
const editingConfig = ref<any>(null)
const testing = ref(false)
const testingError = ref('')
const connectingId = ref<string | null>(null)

onMounted(() => {
  sshStore.loadConfigs()
})

async function handleConnect(config: any) {
  if (sshStore.selectedConfigId === config.id && sshStore.isConnected) {
    await sshStore.disconnect()
  } else {
    if (connectingId.value) return
    if (!config.password && config.authType === 'password') {
      outputStore.addToast('请先在编辑中填写密码', 'warning')
      return
    }
    if (config.authType === 'privateKey' && !config.privateKeyPath) {
      outputStore.addToast('请先在编辑中设置私钥路径', 'warning')
      return
    }

    // 如果当前已有其他连接，先断开
    if (sshStore.isConnected) {
      await sshStore.disconnect()
    }

    connectingId.value = config.id
    sshStore.selectConfig(config).finally(() => {
      connectingId.value = null
    })
  }
}

function openEditDialog(config: any) {
  editingConfig.value = JSON.parse(JSON.stringify(config))
  testingError.value = ''
  showDialog.value = true
}

function openAddDialog() {
  editingConfig.value = {
    id: uuidv4(),
    name: '',
    host: '',
    port: 22,
    username: 'root',
    authType: 'password',
    password: '',
    privateKeyPath: '',
    passphrase: ''
  }
  testingError.value = ''
  showDialog.value = true
}

async function handleDelete(id: string) {
  if (confirm('确认删除该 SSH 配置?')) {
    await sshStore.deleteConfig(id)
  }
}

function closeDialog() {
  showDialog.value = false
}

async function testConnection() {
  testing.value = true
  testingError.value = ''
  try {
    const plainConfig = JSON.parse(JSON.stringify(editingConfig.value))
    const result = await window.api.ssh.testConnect(plainConfig)
    if (result.success) {
      outputStore.addToast('连接成功', 'success')
    } else {
      testingError.value = result.error || '连接失败'
    }
  } catch (err: any) {
    testingError.value = err.message || '测试失败'
  } finally {
    testing.value = false
  }
}

async function saveConfig() {
  try {
    await sshStore.saveConfig(editingConfig.value)
    outputStore.addToast('SSH 配置已保存', 'success')
    showDialog.value = false
  } catch (err: any) {
    testingError.value = err.message || '保存失败'
  }
}
</script>

<template>
  <div class="sidebar-section">
    <div class="section-title">
      <span>SSH 配置</span>
      <button class="icon-btn" style="width:24px;height:24px;border-radius:4px;" @click="openAddDialog">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    </div>
    
    <div 
      v-for="config in sshStore.configs" 
      :key="config.id"
      :class="['ssh-card', { active: sshStore.selectedConfigId === config.id && sshStore.isConnected }]"
    >
      <div class="ssh-card-header">
        <span class="ssh-name">{{ config.name }}</span>
        <span :class="['ssh-status', sshStore.getStatusClass(config.id)]"></span>
      </div>
      <div class="ssh-info">{{ config.username }}@{{ config.host }}:{{ config.port }}</div>
      <div class="ssh-actions">
        <button 
          class="ssh-action-btn"
          :class="{ connected: sshStore.selectedConfigId === config.id && sshStore.isConnected }"
          :disabled="connectingId === config.id"
          @click.stop="handleConnect(config)"
        >
          <span v-if="connectingId === config.id" class="loading-spinner"></span>
          <span v-else>{{ sshStore.selectedConfigId === config.id && sshStore.isConnected ? '断开' : '连接' }}</span>
        </button>
        <button class="ssh-action-btn" @click.stop="openEditDialog(config)">编辑</button>
        <button class="ssh-action-btn danger" @click.stop="handleDelete(config.id)">删除</button>
      </div>
    </div>
    
    <button class="add-ssh-btn" @click="openAddDialog">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      新增 SSH 配置
    </button>
    
    <div v-if="showDialog" class="modal-overlay" @click.self="closeDialog">
      <div class="modal-content">
        <div class="modal-header">SSH 配置</div>
        
        <div class="form-group">
          <label class="form-label">名称</label>
          <input class="form-input" v-model="editingConfig.name" placeholder="如：生产环境-Node1" />
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">主机</label>
            <input class="form-input" v-model="editingConfig.host" placeholder="192.168.1.1" />
          </div>
          <div class="form-group">
            <label class="form-label">端口</label>
            <input class="form-input" v-model.number="editingConfig.port" type="number" />
          </div>
        </div>
        
        <div class="form-group">
          <label class="form-label">用户名</label>
          <input class="form-input" v-model="editingConfig.username" placeholder="root" />
        </div>
        
        <div class="form-group">
          <label class="form-label">认证方式</label>
          <select class="form-select" v-model="editingConfig.authType">
            <option value="password">密码认证</option>
            <option value="privateKey">私钥认证</option>
          </select>
        </div>
        
        <div v-if="editingConfig.authType === 'password'" class="form-group">
          <label class="form-label">密码</label>
          <input class="form-input" v-model="editingConfig.password" type="password" placeholder="密码" />
        </div>
        
        <template v-else>
          <div class="form-group">
            <label class="form-label">私钥路径</label>
            <input class="form-input" v-model="editingConfig.privateKeyPath" placeholder="如：~/.ssh/id_rsa" />
          </div>
          <div class="form-group">
            <label class="form-label">私钥密码(可选)</label>
            <input class="form-input" v-model="editingConfig.passphrase" type="password" placeholder="私钥密码" />
          </div>
        </template>
        
        <div v-if="testingError" class="error-message">{{ testingError }}</div>
        
        <div class="modal-footer">
          <button class="btn" @click="testConnection" :disabled="testing">
            {{ testing ? '测试中...' : '测试连接' }}
          </button>
          <button class="btn btn-primary" @click="saveConfig" :disabled="testing">保存</button>
          <button class="btn" @click="closeDialog" :disabled="testing">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal-content {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 20px;
  width: 400px;
}

.modal-header {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 16px;
}

.error-message {
  color: var(--danger);
  font-size: 12px;
  margin: 8px 0;
  padding: 8px;
  background: rgba(248, 81, 73, 0.1);
  border-radius: 4px;
}

.modal-footer {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 16px;
}

.form-row {
  display: flex;
  gap: 10px;
}

.form-row .form-group {
  flex: 1;
  margin-bottom: 0;
}

.form-row .form-group:first-child {
  flex: 1;
}

.form-row .form-group:last-child {
  flex: 0 0 65px !important;
}

.form-group {
  margin-bottom: 12px;
}

.form-label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 5px;
}

.form-input, .form-select {
  width: 100%;
  padding: 7px 10px;
  background: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  font-family: var(--font-sans);
}

.form-input:focus, .form-select:focus {
  border-color: var(--accent);
}

.ssh-info {
  font-size: 11px;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  margin-bottom: 10px;
}

.ssh-actions {
  display: flex;
  gap: 6px;
}

.ssh-action-btn {
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.ssh-action-btn:hover {
  border-color: var(--accent);
  color: var(--text-primary);
}

.ssh-action-btn.connected {
  background: var(--btn-primary-bg);
  border-color: rgba(46, 160, 67, 0.4);
  color: #fff;
}

.ssh-action-btn.connected:hover {
  background: var(--danger);
  border-color: var(--danger);
}

.ssh-action-btn.danger:hover {
  border-color: var(--danger);
  color: var(--danger);
}

.ssh-action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.loading-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--border-color);
  border-top-color: var(--text-secondary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>