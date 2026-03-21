<template>
  <div class="settings-page">
    <div class="page-header">
      <h1>系统设置</h1>
      <p>管理系统配置和个人偏好</p>
    </div>
    
    <div class="settings-tabs">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="个人信息" name="profile">
          <div class="settings-section">
            <div class="section-header"><h3>基本信息</h3></div>
            <el-form :model="profileForm" label-width="100px" style="max-width: 500px">
              <el-form-item label="用户名"><el-input v-model="profileForm.username" disabled /></el-form-item>
              <el-form-item label="邮箱"><el-input v-model="profileForm.email" /></el-form-item>
              <el-form-item label="手机号"><el-input v-model="profileForm.phone" /></el-form-item>
              <el-form-item label="所属企业"><el-input v-model="profileForm.enterprise" /></el-form-item>
              <el-form-item><el-button type="primary" @click="saveProfile">保存修改</el-button></el-form-item>
            </el-form>
          </div>
        </el-tab-pane>
        
        <el-tab-pane label="安全设置" name="security">
          <div class="settings-section">
            <div class="section-header"><h3>修改密码</h3></div>
            <el-form :model="passwordForm" label-width="100px" style="max-width: 500px">
              <el-form-item label="当前密码"><el-input v-model="passwordForm.oldPassword" type="password" show-password /></el-form-item>
              <el-form-item label="新密码"><el-input v-model="passwordForm.newPassword" type="password" show-password /></el-form-item>
              <el-form-item label="确认密码"><el-input v-model="passwordForm.confirmPassword" type="password" show-password /></el-form-item>
              <el-form-item><el-button type="primary" @click="changePassword">修改密码</el-button></el-form-item>
            </el-form>
          </div>
        </el-tab-pane>
        
        <el-tab-pane label="通知设置" name="notification">
          <div class="settings-section">
            <div class="section-header"><h3>通知偏好</h3></div>
            <div class="setting-item">
              <div class="setting-info"><span class="setting-label">故障报警通知</span><span class="setting-desc">设备故障时发送通知</span></div>
              <el-switch v-model="notificationSettings.faultAlert" />
            </div>
            <div class="setting-item">
              <div class="setting-info"><span class="setting-label">低电量提醒</span><span class="setting-desc">无人机电量低于20%时提醒</span></div>
              <el-switch v-model="notificationSettings.lowBattery" />
            </div>
            <div class="setting-item">
              <div class="setting-info"><span class="setting-label">充电完成通知</span><span class="setting-desc">充电完成时发送通知</span></div>
              <el-switch v-model="notificationSettings.chargingComplete" />
            </div>
          </div>
        </el-tab-pane>
        
        <el-tab-pane label="系统配置" name="system">
          <div class="settings-section">
            <div class="section-header"><h3>地图配置</h3></div>
            <el-form label-width="120px" style="max-width: 500px">
              <el-form-item label="高德地图Key"><el-input v-model="systemSettings.amapKey" placeholder="请输入高德地图API Key" /></el-form-item>
              <el-form-item label="安全密钥"><el-input v-model="systemSettings.securityKey" placeholder="请输入安全密钥" /></el-form-item>
              <el-form-item><el-button type="primary" @click="saveSystemSettings">保存配置</el-button></el-form-item>
            </el-form>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/store/user'

const userStore = useUserStore()
const activeTab = ref('profile')

const profileForm = reactive({
  username: userStore.username || 'admin',
  email: 'admin@example.com',
  phone: '13800138000',
  enterprise: '示例企业'
})

const passwordForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })

const notificationSettings = reactive({
  faultAlert: true,
  lowBattery: true,
  chargingComplete: true
})

const systemSettings = reactive({ amapKey: '', securityKey: '' })

const saveProfile = () => ElMessage.success('个人信息已保存')
const changePassword = () => {
  if (passwordForm.newPassword !== passwordForm.confirmPassword) { ElMessage.error('两次密码输入不一致'); return }
  ElMessage.success('密码修改成功')
}
const saveSystemSettings = () => ElMessage.success('系统配置已保存')
</script>

<style lang="scss" scoped>
.settings-page {
  padding: 24px;
  min-height: 100%;
  overflow-y: auto;
  max-height: calc(100vh - 64px);
}

.page-header {
  margin-bottom: 20px;
  
  h1 {
    font-size: 24px;
    font-weight: 600;
    color: $text-primary;
    margin-bottom: 4px;
  }
  
  p {
    font-size: 14px;
    color: $text-secondary;
  }
}

.settings-tabs {
  background: $bg-card;
  border-radius: $border-radius;
  border: 1px solid $border-color;
  padding: 20px;
  
  :deep(.el-tabs) {
    --el-tabs-header-height: 48px;
    
    .el-tabs__header {
      margin-bottom: 20px;
    }
    
    .el-tabs__nav-wrap::after {
      background-color: $border-color;
    }
    
    .el-tabs__item {
      color: $text-secondary;
      font-size: 14px;
      font-weight: 500;
      padding: 0 20px;
      transition: all 0.2s ease;
      
      &:hover {
        color: $primary-color;
      }
      
      &.is-active {
        color: $primary-color;
        font-weight: 600;
      }
    }
    
    .el-tabs__active-bar {
      background-color: $primary-color;
    }
    
    .el-tabs__content {
      color: $text-primary;
    }
  }
}

.settings-section {
  .section-header {
    margin-bottom: 20px;
    
    h3 {
      font-size: 16px;
      font-weight: 600;
      color: $text-primary;
    }
  }
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  border-bottom: 1px solid $border-color;
  
  &:last-child {
    border-bottom: none;
  }
  
  .setting-info {
    .setting-label {
      display: block;
      font-size: 14px;
      color: $text-primary;
      margin-bottom: 4px;
    }
    
    .setting-desc {
      font-size: 12px;
      color: $text-muted;
    }
  }
}
</style>
