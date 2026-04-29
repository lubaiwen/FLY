<template>
  <div class="layout-container">
    <!-- 侧边栏 -->
    <aside class="sidebar" :class="{ collapsed: isCollapsed }">
      <div class="sidebar-header">
        <div class="logo">
          <svg viewBox="0 0 60 60" class="logo-icon">
            <defs>
              <linearGradient id="sidebarLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#00d4ff"/>
                <stop offset="100%" style="stop-color:#0099cc"/>
              </linearGradient>
            </defs>
            <circle cx="30" cy="30" r="28" fill="none" stroke="url(#sidebarLogoGrad)" stroke-width="2"/>
            <path d="M18 22 L30 16 L42 22 L42 38 L30 44 L18 38 Z" fill="none" stroke="url(#sidebarLogoGrad)" stroke-width="2"/>
            <circle cx="30" cy="30" r="6" fill="url(#sidebarLogoGrad)"/>
          </svg>
          <transition name="fade">
            <span v-if="!isCollapsed" class="logo-text">机巢管理系统</span>
          </transition>
        </div>
        <button class="collapse-btn" @click="toggleCollapse">
          <el-icon><Fold v-if="!isCollapsed" /><Expand v-else /></el-icon>
        </button>
      </div>
      
      <nav class="sidebar-nav">
        <div class="nav-section">
          <div v-if="!isCollapsed" class="nav-section-title">主要功能</div>
          <router-link
            v-for="item in mainMenuItems"
            :key="item.path"
            :to="item.path"
            class="nav-item"
            :class="{ active: isActive(item.path) }"
          >
            <div class="nav-icon-wrapper">
              <el-icon><component :is="item.icon" /></el-icon>
            </div>
            <transition name="fade">
              <span v-if="!isCollapsed" class="nav-text">{{ item.title }}</span>
            </transition>
            <el-badge v-if="item.badge && !isCollapsed" :value="item.badge" class="nav-badge" />
          </router-link>
        </div>
        
        <div class="nav-section">
          <div v-if="!isCollapsed" class="nav-section-title">设备管理</div>
          <router-link
            v-for="item in deviceMenuItems"
            :key="item.path"
            :to="item.path"
            class="nav-item"
            :class="{ active: isActive(item.path) }"
          >
            <div class="nav-icon-wrapper">
              <el-icon><component :is="item.icon" /></el-icon>
            </div>
            <transition name="fade">
              <span v-if="!isCollapsed" class="nav-text">{{ item.title }}</span>
            </transition>
          </router-link>
        </div>
        
        <div class="nav-section">
          <div v-if="!isCollapsed" class="nav-section-title">系统管理</div>
          <router-link
            v-for="item in systemMenuItems"
            :key="item.path"
            :to="item.path"
            class="nav-item"
            :class="{ active: isActive(item.path) }"
          >
            <div class="nav-icon-wrapper">
              <el-icon><component :is="item.icon" /></el-icon>
            </div>
            <transition name="fade">
              <span v-if="!isCollapsed" class="nav-text">{{ item.title }}</span>
            </transition>
            <el-badge v-if="item.path === '/alerts' && alertCount > 0" :value="alertCount" class="nav-badge" />
          </router-link>
        </div>
      </nav>
      
      <div class="sidebar-footer">
        <div class="connection-status" :class="{ connected: wsConnected }">
          <span class="status-dot"></span>
          <transition name="fade">
            <span v-if="!isCollapsed" class="status-text">
              {{ wsConnected ? '实时连接' : '连接断开' }}
            </span>
          </transition>
        </div>
      </div>
    </aside>
    
    <!-- 主内容区 -->
    <div class="main-container">
      <header class="header">
        <div class="header-left">
          <button class="mobile-menu-btn" @click="showMobileMenu = !showMobileMenu">
            <el-icon><Menu /></el-icon>
          </button>
          <div class="breadcrumb">
            <el-icon><Location /></el-icon>
            <span>{{ currentPageTitle }}</span>
          </div>
        </div>
        
        <div class="header-center">
          <div class="quick-stats">
            <div class="stat-item">
              <span class="stat-label">在线机巢</span>
              <span class="stat-value">{{ onlineNestCount }}</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
              <span class="stat-label">充电中</span>
              <span class="stat-value charging">{{ chargingCount }}</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
              <span class="stat-label">利用率</span>
              <span class="stat-value">{{ utilizationRate }}%</span>
            </div>
          </div>
        </div>
        
        <div class="header-right">
          <div class="header-actions">
            <el-tooltip content="刷新数据" placement="bottom">
              <button class="action-btn" @click="refreshData">
                <el-icon><Refresh /></el-icon>
              </button>
            </el-tooltip>
            
            <el-tooltip content="全屏" placement="bottom">
              <button class="action-btn" @click="toggleFullscreen">
                <el-icon><FullScreen /></el-icon>
              </button>
            </el-tooltip>
            
            <el-popover
              placement="bottom-end"
              :width="360"
              trigger="click"
              popper-class="notification-popover"
            >
              <template #reference>
                <button class="action-btn notification-btn">
                  <el-icon><Bell /></el-icon>
                  <span v-if="alertCount > 0" class="notification-badge">{{ alertCount }}</span>
                </button>
              </template>
              <div class="notification-panel">
                <div class="notification-header">
                  <span>通知中心</span>
                  <el-button type="primary" link size="small" @click="markAllRead">
                    全部已读
                  </el-button>
                </div>
                <div class="notification-list">
                  <div
                    v-for="alert in recentAlerts"
                    :key="alert.id"
                    class="notification-item"
                    :class="{ unread: !alert.read }"
                  >
                    <div class="notification-icon" :class="alert.type">
                      <el-icon>
                        <WarningFilled v-if="alert.type === 'warning'" />
                        <CircleCloseFilled v-else-if="alert.type === 'error'" />
                        <SuccessFilled v-else-if="alert.type === 'success'" />
                        <InfoFilled v-else />
                      </el-icon>
                    </div>
                    <div class="notification-content">
                      <div class="notification-title">{{ alert.title }}</div>
                      <div class="notification-message">{{ alert.message }}</div>
                      <div class="notification-time">{{ formatTime(alert.timestamp) }}</div>
                    </div>
                  </div>
                  <div v-if="recentAlerts.length === 0" class="no-notifications">
                    暂无通知
                  </div>
                </div>
                <div class="notification-footer">
                  <router-link to="/alerts">查看全部通知</router-link>
                </div>
              </div>
            </el-popover>
          </div>
          
          <el-dropdown trigger="click" @command="handleUserCommand">
            <div class="user-info">
              <el-avatar :size="36" class="user-avatar">
                {{ userStore.username?.charAt(0)?.toUpperCase() || 'U' }}
              </el-avatar>
              <div class="user-detail">
                <span class="user-name">{{ userStore.username || '用户' }}</span>
                <span class="user-role">{{ getRoleText(userStore.role) }}</span>
              </div>
              <el-icon class="dropdown-icon"><ArrowDown /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">
                  <el-icon><User /></el-icon>
                  个人信息
                </el-dropdown-item>
                <el-dropdown-item command="settings">
                  <el-icon><Setting /></el-icon>
                  系统设置
                </el-dropdown-item>
                <el-dropdown-item divided command="logout">
                  <el-icon><SwitchButton /></el-icon>
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>
      
      <main class="main-content">
        <router-view v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
    
    <!-- 移动端菜单 -->
    <transition name="slide-left">
      <div v-if="showMobileMenu" class="mobile-overlay" @click="showMobileMenu = false">
        <div class="mobile-menu" @click.stop>
          <div class="mobile-menu-header">
            <span>导航菜单</span>
            <el-icon @click="showMobileMenu = false"><Close /></el-icon>
          </div>
          <div class="mobile-menu-content">
            <router-link
              v-for="item in allMenuItems"
              :key="item.path"
              :to="item.path"
              class="mobile-menu-item"
              @click="showMobileMenu = false"
            >
              <el-icon><component :is="item.icon" /></el-icon>
              <span>{{ item.title }}</span>
            </router-link>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from '@/store/user'
import { useNestStore } from '@/store/nest'
import { useAlertStore } from '@/store/alert'
import { useDataSyncStore } from '@/store/dataSync'
import wsClient from '@/utils/websocket'
import { formatDateTime } from '@/utils'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const nestStore = useNestStore()
const alertStore = useAlertStore()
const dataSyncStore = useDataSyncStore()

const isCollapsed = ref(false)
const showMobileMenu = ref(false)
const wsConnected = ref(false)

const mainMenuItems = [
  { path: '/dashboard', title: '数据概览', icon: 'DataAnalysis' },
  { path: '/monitor', title: '实时监控', icon: 'Monitor' },
  { path: '/booking', title: '预约调度', icon: 'Calendar', badge: '' },
  { path: '/charging', title: '充电管理', icon: 'Lightning' }
]

const deviceMenuItems = [
  { path: '/drones', title: '无人机管理', icon: 'Position' },
  { path: '/nests', title: '机巢管理', icon: 'OfficeBuilding' },
  { path: '/orders', title: '订单管理', icon: 'Document' }
]

const systemMenuItems = [
  { path: '/alerts', title: '故障报警', icon: 'Bell' },
  { path: '/statistics', title: '数据统计', icon: 'TrendCharts' },
  { path: '/settings', title: '系统设置', icon: 'Setting' }
]

const allMenuItems = computed(() => [...mainMenuItems, ...deviceMenuItems, ...systemMenuItems])

const currentPageTitle = computed(() => {
  const item = allMenuItems.value.find(i => i.path === route.path)
  return item?.title || '首页'
})

const onlineNestCount = computed(() => nestStore.statistics.online)
const chargingCount = computed(() => nestStore.statistics.occupied)
const utilizationRate = computed(() => nestStore.utilizationRate)
const alertCount = computed(() => alertStore.unreadCount)
const recentAlerts = computed(() => alertStore.alerts.slice(0, 5))

const isActive = (path) => route.path === path

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value
}

const refreshData = async () => {
  ElMessage.success('数据刷新中...')
  await dataSyncStore.syncAllData()
}

const toggleFullscreen = () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen()
  } else {
    document.exitFullscreen()
  }
}

const markAllRead = () => {
  alertStore.markAllAsRead()
}

const formatTime = (timestamp) => {
  return formatDateTime(timestamp, 'MM-DD HH:mm')
}

const getRoleText = (role) => {
  const roles = {
    admin: '管理员',
    operator: '运维人员',
    enterprise: '企业用户'
  }
  return roles[role] || '用户'
}

const handleUserCommand = (command) => {
  switch (command) {
    case 'profile':
      router.push('/settings')
      break
    case 'settings':
      router.push('/settings')
      break
    case 'logout':
      ElMessageBox.confirm('确定要退出登录吗？', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        userStore.logout()
        router.push('/login')
        ElMessage.success('已退出登录')
      }).catch(() => {})
      break
  }
}

onMounted(async () => {
  dataSyncStore.startAutoSync(30000)
  
  wsClient.connect()
  wsClient.on('connected', () => {
    wsConnected.value = true
  })
  wsClient.on('disconnected', () => {
    wsConnected.value = false
  })
  wsClient.on('alert', (data) => {
    alertStore.addAlert(data)
  })
})

onUnmounted(() => {
  dataSyncStore.stopAutoSync()
  wsClient.disconnect()
})
</script>

<style lang="scss" scoped>
.layout-container {
  display: flex;
  min-height: 100vh;
  background: $bg-page;
}

// ============================================
// 侧边栏
// ============================================

.sidebar {
  width: $sidebar-width;
  background: $bg-base;
  border-right: 1px solid $border-default;
  display: flex;
  flex-direction: column;
  transition: width $transition-slow;
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  z-index: $z-fixed;
  
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(0, 212, 255, 0.3), transparent);
  }
  
  &.collapsed {
    width: $sidebar-collapsed-width;
    
    .sidebar-header {
      padding: $space-4 $space-3;
      justify-content: center;
      
      .logo-text {
        display: none;
      }
    }
    
    .nav-section-title {
      display: none;
    }
    
    .nav-item {
      justify-content: center;
      padding: $space-3;
      
      .nav-text {
        display: none;
      }
      
      .nav-badge {
        position: absolute;
        top: 4px;
        right: 4px;
        margin-left: 0;
        
        :deep(.el-badge__content) {
          transform: scale(0.8);
        }
      }
    }
    
    .sidebar-footer {
      padding: $space-4 $space-3;
      justify-content: center;
      
      .status-text {
        display: none;
      }
    }
  }
}

.sidebar-header {
  padding: $space-5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid $border-subtle;
  
  .logo {
    display: flex;
    align-items: center;
    gap: $space-3;
    
    .logo-icon {
      width: 40px;
      height: 40px;
      flex-shrink: 0;
      filter: drop-shadow(0 0 8px rgba(0, 212, 255, 0.3));
    }
    
    .logo-text {
      font-size: $text-lg;
      font-weight: $font-bold;
      color: $text-primary;
      white-space: nowrap;
      letter-spacing: -0.01em;
    }
  }
  
  .collapse-btn {
    width: 32px;
    height: 32px;
    border-radius: $radius-md;
    background: transparent;
    border: 1px solid $border-default;
    color: $text-secondary;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all $transition-fast;
    
    &:hover {
      background: $bg-card;
      color: $primary-color;
      border-color: $primary-color;
      box-shadow: $shadow-glow-sm;
    }
  }
}

.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  padding: $space-4 $space-3;
}

.nav-section {
  margin-bottom: $space-6;
  
  .nav-section-title {
    font-size: 11px;
    font-weight: $font-semibold;
    color: $text-muted;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    padding: 0 $space-3;
    margin-bottom: $space-2;
  }
}

.nav-item {
  display: flex;
  align-items: center;
  gap: $space-3;
  padding: $space-3 $space-4;
  border-radius: $radius-lg;
  color: $text-secondary;
  text-decoration: none;
  transition: all $transition-fast;
  margin-bottom: $space-1;
  position: relative;
  
  .nav-icon-wrapper {
    width: 36px;
    height: 36px;
    border-radius: $radius-md;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all $transition-fast;
    
    .el-icon {
      font-size: 20px;
    }
  }
  
  .nav-text {
    font-size: $text-base;
    white-space: nowrap;
    font-weight: $font-medium;
  }
  
  .nav-badge {
    margin-left: auto;
  }
  
  &:hover {
    color: $primary-color;
    
    .nav-icon-wrapper {
      background: rgba($primary-color, 0.1);
    }
  }
  
  &.active {
    color: $primary-color;
    background: linear-gradient(135deg, rgba($primary-color, 0.15), rgba($primary-color, 0.05));
    border: 1px solid rgba($primary-color, 0.2);
    
    .nav-icon-wrapper {
      background: rgba($primary-color, 0.15);
      box-shadow: 0 0 12px rgba(0, 212, 255, 0.2);
    }
    
    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 50%;
      transform: translateY(-50%);
      width: 3px;
      height: 20px;
      background: $primary-color;
      border-radius: 0 3px 3px 0;
      box-shadow: 0 0 8px rgba(0, 212, 255, 0.5);
    }
  }
}

.sidebar-footer {
  padding: $space-4 $space-5;
  border-top: 1px solid $border-subtle;
  
  .connection-status {
    display: flex;
    align-items: center;
    gap: $space-2;
    padding: $space-2 $space-3;
    border-radius: $radius-md;
    background: $bg-card;
    border: 1px solid $border-subtle;
    
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: $danger-color;
      box-shadow: 0 0 6px rgba($danger-color, 0.5);
      animation: pulse 2s infinite;
    }
    
    .status-text {
      font-size: $text-xs;
      color: $text-muted;
      font-weight: $font-medium;
    }
    
    &.connected {
      border-color: rgba($success-color, 0.3);
      
      .status-dot {
        background: $success-color;
        box-shadow: 0 0 6px rgba($success-color, 0.5);
      }
      
      .status-text {
        color: $success-color;
      }
    }
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

// ============================================
// 主内容区
// ============================================

.main-container {
  flex: 1;
  margin-left: $sidebar-width;
  display: flex;
  flex-direction: column;
  transition: margin-left $transition-slow;
  
  .sidebar.collapsed ~ & {
    margin-left: $sidebar-collapsed-width;
  }
}

.header {
  height: $header-height;
  background: $bg-base;
  border-bottom: 1px solid $border-default;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 $space-6;
  position: sticky;
  top: 0;
  z-index: $z-sticky;
  
  &::before {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(0, 212, 255, 0.2), transparent);
  }
}

.header-left {
  display: flex;
  align-items: center;
  gap: $space-4;
  
  .mobile-menu-btn {
    display: none;
    width: 44px;
    height: 44px;
    min-width: 44px;
    min-height: 44px;
    border-radius: $radius-lg;
    background: $bg-card;
    border: 1px solid $border-default;
    color: $text-secondary;
    cursor: pointer;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    position: relative;
    z-index: 60;
    transition: all $transition-fast;
    
    .el-icon {
      font-size: 22px;
    }
    
    &:hover {
      background: rgba($primary-color, 0.1);
      color: $primary-color;
      border-color: $primary-color;
      box-shadow: $shadow-glow-sm;
    }
    
    &:active {
      transform: scale(0.95);
    }
  }
  
  .breadcrumb {
    display: flex;
    align-items: center;
    gap: $space-2;
    color: $text-primary;
    font-size: $text-lg;
    font-weight: $font-semibold;
    letter-spacing: -0.01em;
    
    .el-icon {
      color: $primary-color;
      font-size: 18px;
    }
  }
}

.header-center {
  .quick-stats {
    display: flex;
    align-items: center;
    gap: $space-6;
    background: $bg-card;
    padding: $space-2 $space-5;
    border-radius: $radius-xl;
    border: 1px solid $border-default;
    box-shadow: $shadow-sm;
    
    .stat-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 60px;
      
      .stat-label {
        font-size: 11px;
        color: $text-muted;
        margin-bottom: 2px;
        font-weight: $font-medium;
        letter-spacing: 0.5px;
      }
      
      .stat-value {
        font-size: $text-xl;
        font-weight: $font-bold;
        color: $text-primary;
        line-height: $leading-tight;
        
        &.charging {
          color: $warning-color;
          text-shadow: 0 0 8px rgba($warning-color, 0.3);
        }
      }
    }
    
    .stat-divider {
      width: 1px;
      height: 32px;
      background: $border-subtle;
    }
  }
}

.header-right {
  display: flex;
  align-items: center;
  gap: $space-4;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: $space-2;
  
  .action-btn {
    width: 40px;
    height: 40px;
    border-radius: $radius-lg;
    background: transparent;
    border: 1px solid $border-default;
    color: $text-secondary;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all $transition-fast;
    position: relative;
    
    &:hover {
      background: $bg-card;
      color: $primary-color;
      border-color: $primary-color;
      box-shadow: $shadow-glow-sm;
    }
    
    &.notification-btn {
      .notification-badge {
        position: absolute;
        top: -4px;
        right: -4px;
        min-width: 18px;
        height: 18px;
        background: $danger-color;
        color: white;
        font-size: 11px;
        font-weight: $font-semibold;
        border-radius: 9px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 4px;
        box-shadow: 0 0 8px rgba($danger-color, 0.4);
      }
    }
  }
}

.user-info {
  display: flex;
  align-items: center;
  gap: $space-3;
  padding: $space-1 $space-3 $space-1 $space-1;
  border-radius: $radius-xl;
  cursor: pointer;
  transition: all $transition-fast;
  border: 1px solid transparent;
  
  &:hover {
    background: $bg-card;
    border-color: $border-default;
  }
  
  .user-avatar {
    background: linear-gradient(135deg, $primary-color, $primary-dark);
    color: white;
    font-weight: $font-semibold;
    box-shadow: 0 0 12px rgba(0, 212, 255, 0.3);
  }
  
  .user-detail {
    display: flex;
    flex-direction: column;
    
    .user-name {
      font-size: $text-base;
      font-weight: $font-medium;
      color: $text-primary;
    }
    
    .user-role {
      font-size: 11px;
      color: $text-muted;
    }
  }
  
  .dropdown-icon {
    color: $text-muted;
    transition: transform $transition-fast;
  }
  
  &:hover .dropdown-icon {
    transform: rotate(180deg);
  }
}

.main-content {
  flex: 1;
  overflow-y: auto;
  background: $bg-page;
}

// ============================================
// 移动端菜单
// ============================================

.mobile-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  z-index: $z-modal;
}

.mobile-menu {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 280px;
  background: $bg-base;
  padding: $space-5;
  border-right: 1px solid $border-default;
  
  .mobile-menu-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: $space-5;
    padding-bottom: $space-4;
    border-bottom: 1px solid $border-default;
    
    span {
      font-size: $text-lg;
      font-weight: $font-bold;
      color: $text-primary;
    }
    
    .el-icon {
      font-size: 20px;
      color: $text-secondary;
      cursor: pointer;
      transition: color $transition-fast;
      
      &:hover {
        color: $primary-color;
      }
    }
  }
  
  .mobile-menu-item {
    display: flex;
    align-items: center;
    gap: $space-3;
    padding: $space-3 $space-4;
    border-radius: $radius-lg;
    color: $text-secondary;
    text-decoration: none;
    margin-bottom: $space-1;
    transition: all $transition-fast;
    
    &:hover, &.active {
      background: linear-gradient(135deg, rgba($primary-color, 0.15), rgba($primary-color, 0.05));
      color: $primary-color;
      border: 1px solid rgba($primary-color, 0.2);
    }
  }
}

// ============================================
// 动画过渡
// ============================================

.page-enter-active,
.page-leave-active {
  transition: opacity 0.2s ease;
}

.page-enter-from,
.page-leave-to {
  opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-left-enter-active,
.slide-left-leave-active {
  transition: all 0.3s ease;
}

.slide-left-enter-from,
.slide-left-leave-to {
  opacity: 0;
  
  .mobile-menu {
    transform: translateX(-100%);
  }
}

// ============================================
// 响应式适配
// ============================================

@media screen and (max-width: $breakpoint-md) {
  .sidebar {
    display: none;
  }
  
  .main-container {
    margin-left: 0;
  }
  
  .header {
    padding: 0 $space-4;
    min-height: $header-height;
  }
  
  .header-left {
    flex-shrink: 0;
    
    .mobile-menu-btn {
      display: flex !important;
      visibility: visible !important;
      opacity: 1 !important;
    }
  }
  
  .header-center {
    display: none;
  }
  
  .mobile-overlay {
    display: block;
  }
  
  .user-detail {
    display: none;
  }
  
  .header-right {
    gap: $space-2;
  }
  
  .header-actions {
    gap: $space-1;
    
    .action-btn {
      width: 36px;
      height: 36px;
      min-width: 36px;
    }
  }
}

@media screen and (max-width: $breakpoint-sm) {
  .header {
    padding: 0 $space-3;
  }
  
  .header-left {
    gap: $space-2;
    
    .mobile-menu-btn {
      width: 40px;
      height: 40px;
      min-width: 40px;
      min-height: 40px;
      
      .el-icon {
        font-size: 20px;
      }
    }
    
    .breadcrumb {
      font-size: $text-base;
      
      .el-icon {
        display: none;
      }
    }
  }
  
  .header-actions .action-btn:not(.notification-btn) {
    display: none;
  }
  
  .user-info {
    padding: $space-1 $space-2 $space-1 $space-1;
    
    .user-avatar {
      width: 32px !important;
      height: 32px !important;
    }
  }
}
</style>
