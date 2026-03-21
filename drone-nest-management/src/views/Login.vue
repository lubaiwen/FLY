<template>
  <div class="login-container">
    <div class="login-bg">
      <div class="bg-gradient"></div>
      <div class="bg-pattern"></div>
      <div class="floating-elements">
        <div class="drone drone-1"></div>
        <div class="drone drone-2"></div>
        <div class="drone drone-3"></div>
        <div class="nest nest-1"></div>
        <div class="nest nest-2"></div>
      </div>
    </div>
    
    <div class="login-content">
      <div class="login-header">
        <div class="logo">
          <svg viewBox="0 0 60 60" class="logo-icon">
            <defs>
              <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#00d4ff"/>
                <stop offset="100%" style="stop-color:#0099cc"/>
              </linearGradient>
            </defs>
            <circle cx="30" cy="30" r="28" fill="none" stroke="url(#logoGrad)" stroke-width="2"/>
            <path d="M18 22 L30 16 L42 22 L42 38 L30 44 L18 38 Z" fill="none" stroke="url(#logoGrad)" stroke-width="2"/>
            <circle cx="30" cy="30" r="6" fill="url(#logoGrad)"/>
          </svg>
        </div>
        <h1 class="title">无人机共享充电机巢管理系统</h1>
        <p class="subtitle">Drone Shared Charging Nest Management System</p>
      </div>

      <div class="login-card">
        <div class="card-glow"></div>
        <el-form
          ref="loginFormRef"
          :model="loginForm"
          :rules="loginRules"
          class="login-form"
          @submit.prevent="handleLogin"
        >
          <div class="form-title">账户登录</div>
          
          <el-form-item prop="username">
            <el-input
              v-model="loginForm.username"
              placeholder="请输入用户名"
              prefix-icon="User"
              size="large"
              clearable
            />
          </el-form-item>
          
          <el-form-item prop="password">
            <el-input
              v-model="loginForm.password"
              type="password"
              placeholder="请输入密码"
              prefix-icon="Lock"
              size="large"
              show-password
              @keyup.enter="handleLogin"
            />
          </el-form-item>

          <div class="form-options">
            <el-checkbox v-model="rememberMe">记住登录状态</el-checkbox>
            <a href="#" class="forgot-link">忘记密码？</a>
          </div>

          <el-form-item>
            <el-button
              type="primary"
              size="large"
              :loading="loading"
              class="login-btn"
              @click="handleLogin"
            >
              <span v-if="!loading">登 录</span>
              <span v-else>登录中...</span>
            </el-button>
          </el-form-item>

          <div class="register-link">
            还没有账号？<router-link to="/register">立即注册</router-link>
          </div>
        </el-form>

        <div class="demo-accounts">
          <div class="demo-title">演示账号</div>
          <div class="demo-list">
            <div class="demo-item" @click="fillDemo('admin', 'admin123')">
              <el-icon><User /></el-icon>
              <span>管理员</span>
            </div>
            <div class="demo-item" @click="fillDemo('operator', 'operator123')">
              <el-icon><Setting /></el-icon>
              <span>运维人员</span>
            </div>
            <div class="demo-item" @click="fillDemo('enterprise', 'enterprise123')">
              <el-icon><OfficeBuilding /></el-icon>
              <span>企业用户</span>
            </div>
          </div>
        </div>
      </div>

      <div class="login-footer">
        <p>© 2026 无人机共享充电机巢管理系统 · 低空经济智能调度平台</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/store/user'

const router = useRouter()
const userStore = useUserStore()

const loginFormRef = ref(null)
const loading = ref(false)
const rememberMe = ref(false)

const loginForm = reactive({
  username: '',
  password: ''
})

const loginRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '用户名长度为3-20个字符', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 20, message: '密码长度为6-20个字符', trigger: 'blur' }
  ]
}

const handleLogin = async () => {
  if (!loginFormRef.value) return
  
  await loginFormRef.value.validate(async (valid) => {
    if (!valid) return
    
    loading.value = true
    try {
      const result = await userStore.login(loginForm)
      if (result.success) {
        ElMessage.success('登录成功')
        router.push('/dashboard')
      } else {
        ElMessage.error(result.message || '登录失败')
      }
    } catch (error) {
      ElMessage.error('登录失败，请稍后重试')
    } finally {
      loading.value = false
    }
  })
}

const fillDemo = (username, password) => {
  loginForm.username = username
  loginForm.password = password
}
</script>

<style lang="scss" scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  background: $bg-darker;
}

.login-bg {
  position: absolute;
  inset: 0;
  overflow: hidden;
  
  .bg-gradient {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at 30% 20%, rgba($primary-color, 0.15) 0%, transparent 50%),
                radial-gradient(ellipse at 70% 80%, rgba($secondary-color, 0.1) 0%, transparent 50%);
  }
  
  .bg-pattern {
    position: absolute;
    inset: 0;
    background-image: 
      linear-gradient(rgba($primary-color, 0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba($primary-color, 0.03) 1px, transparent 1px);
    background-size: 50px 50px;
    animation: patternMove 20s linear infinite;
  }
  
  .floating-elements {
    .drone, .nest {
      position: absolute;
      opacity: 0.1;
    }
    
    .drone {
      width: 60px;
      height: 60px;
      background: $primary-color;
      clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
      animation: float 6s ease-in-out infinite;
    }
    
    .drone-1 { top: 15%; left: 10%; animation-delay: 0s; }
    .drone-2 { top: 60%; left: 5%; animation-delay: 2s; }
    .drone-3 { top: 25%; right: 8%; animation-delay: 4s; }
    
    .nest {
      width: 80px;
      height: 80px;
      background: $secondary-color;
      border-radius: 50%;
      animation: pulse 4s ease-in-out infinite;
    }
    
    .nest-1 { bottom: 20%; left: 15%; animation-delay: 1s; }
    .nest-2 { bottom: 30%; right: 12%; animation-delay: 3s; }
  }
}

@keyframes patternMove {
  0% { transform: translate(0, 0); }
  100% { transform: translate(50px, 50px); }
}

@keyframes float {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-30px) rotate(180deg); }
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 0.1; }
  50% { transform: scale(1.2); opacity: 0.2; }
}

.login-content {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 440px;
  padding: 20px;
}

.login-header {
  text-align: center;
  margin-bottom: 32px;
  
  .logo {
    margin-bottom: 20px;
    
    .logo-icon {
      width: 80px;
      height: 80px;
      filter: drop-shadow(0 0 20px rgba($primary-color, 0.5));
      animation: logoFloat 3s ease-in-out infinite;
    }
  }
  
  .title {
    font-size: 28px;
    font-weight: 700;
    color: $text-primary;
    margin-bottom: 8px;
    letter-spacing: 2px;
    text-shadow: 0 0 30px rgba($primary-color, 0.3);
  }
  
  .subtitle {
    font-size: 13px;
    color: $text-secondary;
    letter-spacing: 1px;
  }
}

@keyframes logoFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

.login-card {
  background: rgba($bg-card, 0.9);
  backdrop-filter: blur(20px);
  border-radius: 20px;
  border: 1px solid $border-color;
  padding: 32px;
  position: relative;
  overflow: hidden;
  
  .card-glow {
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background: radial-gradient(circle, rgba($primary-color, 0.05) 0%, transparent 50%);
    animation: glowRotate 10s linear infinite;
    pointer-events: none;
  }
}

@keyframes glowRotate {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.login-form {
  position: relative;
  z-index: 1;
  
  .form-title {
    font-size: 18px;
    font-weight: 600;
    color: $text-primary;
    margin-bottom: 24px;
    text-align: center;
  }
  
  :deep(.el-form-item) {
    margin-bottom: 20px;
  }
  
  :deep(.el-input) {
    --el-input-bg-color: #{$bg-darker};
    --el-input-border-color: #{$border-color};
    --el-input-text-color: #{$text-primary};
    --el-input-placeholder-color: #{$text-muted};
    --el-input-hover-border-color: #{$primary-color};
    --el-input-focus-border-color: #{$primary-color};
    
    .el-input__wrapper {
      border-radius: 10px;
      padding: 4px 16px;
      box-shadow: none;
      transition: all $transition-normal;
      
      &:hover, &.is-focus {
        box-shadow: 0 0 0 2px rgba($primary-color, 0.2);
      }
    }
  }
  
  .form-options {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    
    :deep(.el-checkbox) {
      --el-checkbox-text-color: #{$text-secondary};
      --el-checkbox-checked-text-color: #{$primary-color};
      --el-checkbox-checked-bg-color: #{$primary-color};
      --el-checkbox-checked-input-border-color: #{$primary-color};
    }
    
    .forgot-link {
      color: $text-secondary;
      font-size: 13px;
      transition: color $transition-fast;
      
      &:hover {
        color: $primary-color;
      }
    }
  }
  
  .login-btn {
    width: 100%;
    height: 48px;
    border-radius: 10px;
    font-size: 16px;
    font-weight: 600;
    letter-spacing: 4px;
    background: linear-gradient(135deg, $primary-color, $primary-dark);
    border: none;
    transition: all $transition-normal;
    
    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba($primary-color, 0.4);
    }
    
    &:active {
      transform: translateY(0);
    }
  }
  
  .register-link {
    text-align: center;
    margin-top: 20px;
    color: $text-secondary;
    font-size: 14px;
    
    a {
      color: $primary-color;
      font-weight: 500;
      margin-left: 4px;
      
      &:hover {
        text-decoration: underline;
      }
    }
  }
}

.demo-accounts {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid $border-color;
  
  .demo-title {
    font-size: 13px;
    color: $text-muted;
    margin-bottom: 12px;
    text-align: center;
  }
  
  .demo-list {
    display: flex;
    gap: 12px;
    justify-content: center;
  }
  
  .demo-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 12px 16px;
    background: rgba($bg-darker, 0.5);
    border-radius: 10px;
    border: 1px solid $border-color;
    cursor: pointer;
    transition: all $transition-fast;
    
    &:hover {
      border-color: $primary-color;
      background: rgba($primary-color, 0.1);
      
      .el-icon {
        color: $primary-color;
      }
    }
    
    .el-icon {
      font-size: 20px;
      color: $text-secondary;
      transition: color $transition-fast;
    }
    
    span {
      font-size: 12px;
      color: $text-secondary;
    }
  }
}

.login-footer {
  margin-top: 32px;
  text-align: center;
  
  p {
    font-size: 12px;
    color: $text-muted;
  }
}

@media screen and (max-width: $breakpoint-sm) {
  .login-header {
    .title {
      font-size: 22px;
    }
    
    .subtitle {
      font-size: 11px;
    }
  }
  
  .login-card {
    padding: 24px 20px;
  }
  
  .demo-accounts .demo-list {
    flex-wrap: wrap;
  }
}
</style>
