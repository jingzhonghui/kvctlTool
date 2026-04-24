<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSSHStore } from '../stores/ssh'
import { v4 as uuidv4 } from 'uuid'

const sshStore = useSSHStore()

const showDialog = ref(false)
const editingConfig = ref<any>(null)

onMounted(() => {
  sshStore.loadConfigs()
})

function selectConfig(config: any) {
  sshStore.selectConfig(config)
}

function openAddDialog() {
  editingConfig.value = {
    id: uuidv4(),
    name: '',
    host: '',
    port: 22,
    username: '',
    authType: 'password',
    password: ''
  }
  showDialog.value = true
}

async function saveConfig() {
  if (!editingConfig.value.name || !editingConfig.value.host || !editingConfig.value.username) {
    return
  }
  editingConfig.value.createdAt = Date.now()
  editingConfig.value.updatedAt = Date.now()
  await sshStore.saveConfig(editingConfig.value)
  showDialog.value = false
}

async function deleteConfig(id: string) {
  await sshStore.deleteConfig(id)
}

function closeDialog() {
  showDialog.value = false
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
      :class="['ssh-card', { active: sshStore.selectedConfigId === config.id }]"
      @click="selectConfig(config)"
    >
      <div class="ssh-card-header">
        <span class="ssh-name">{{ config.name }}</span>
        <span :class="['ssh-status', sshStore.getStatusClass(config.id)]"></span>
      </div>
      <div class="ssh-info">{{ config.username }}@{{ config.host }}:{{ config.port }}</div>
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
        <div v-else class="form-group">
          <label class="form-label">私钥路径</label>
          <input class="form-input" v-model="editingConfig.privateKeyPath" placeholder="如：~/.ssh/id_rsa" />
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" @click="saveConfig">保存</button>
          <button class="btn" @click="closeDialog">取消</button>
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

.modal-footer {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>