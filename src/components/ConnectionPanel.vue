<script setup lang="ts">
import { useConnectionStore } from '../stores/connection'

const connectionStore = useConnectionStore()
</script>

<template>
  <div class="sidebar-section">
    <div class="section-title">连接配置</div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">协议</label>
        <select class="form-select" v-model="connectionStore.protocol">
          <option value="tcp">tcp</option>
          <option value="udp">udp</option>
          <option value="http">http</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">端口</label>
        <input class="form-input" v-model="connectionStore.port" type="number" min="1" max="65535" />
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">IP / 主机地址</label>
      <input 
        class="form-input" 
        v-model="connectionStore.host" 
        placeholder="127.0.0.1 或主机名"
        list="address-history"
      />
      <datalist id="address-history">
        <option v-for="addr in connectionStore.history" :key="addr.id" :value="addr.host" />
      </datalist>
    </div>
  </div>
</template>