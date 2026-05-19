<script setup lang="ts">
import { useSettingsStore } from '../stores/settings'

const settingsStore = useSettingsStore()
</script>

<template>
  <div class="sidebar-section">
    <div class="section-title">高级选项</div>
    <div class="switch-item">
      <span class="switch-label">前缀查询 (--prefix)</span>
      <div 
        class="switch" 
        :class="{ on: settingsStore.prefixQuery }"
        @click="settingsStore.togglePrefixQuery"
      ></div>
    </div>
    <div class="switch-item">
      <span class="switch-label">仅查询 Key (--keys-only)</span>
      <div 
        class="switch" 
        :class="{ on: settingsStore.keysOnly }"
        @click="settingsStore.toggleKeysOnly"
      ></div>
    </div>
    <div class="switch-item">
      <span class="switch-label">保留输出历史</span>
      <div 
        class="switch" 
        :class="{ on: settingsStore.preserveOutput }"
        @click="settingsStore.togglePreserveOutput"
      ></div>
    </div>
  </div>
</template>