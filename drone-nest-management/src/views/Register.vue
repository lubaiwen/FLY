<template>
  <div class="register-container">
    <div class="register-bg">
      <div class="bg-gradient"></div>
      <div class="bg-pattern"></div>
    </div>
    
    <div class="register-content">
      <div class="register-header">
        <router-link to="/login" class="back-link">
          <el-icon><ArrowLeft /></el-icon>
          <span>返回登录</span>
        </router-link>
        <h1 class="title">创建新账户</h1>
        <p class="subtitle">加入无人机共享充电网络</p>
      </div>

      <div class="register-card">
        <el-form
          ref="registerFormRef"
          :model="registerForm"
          :rules="registerRules"
          class="register-form"
          @submit.prevent="handleRegister"
        >
          <el-form-item prop="username">
            <el-input
              v-model="registerForm.username"
              placeholder="用户名"
              prefix-icon="User"
              size="large"
              clearable
            />
          </el-form-item>
          
          <el-form-item prop="email">
            <el-input
              v-model="registerForm.email"
              placeholder="邮箱地址"
              prefix-icon="Message"
              size="large"
              clearable
            />
          </el-form-item>
          
          <el-form-item prop="phone">
            <el-input
              v-model="registerForm.phone"
              placeholder="手机号码"
              prefix-icon="Phone"
              size="large"
              clearable
            />
          </el-form-item>

          <el-form-item prop="enterprise">
            <el-input
              v-model="registerForm.enterprise"
              placeholder="所属企业"
              prefix-icon="OfficeBuilding"
              size="large"
              clearable
            />
          </el-form-item>
          
          <el-form-item prop="password">
            <el-input
              v-model="registerForm.password"
              type="password"
              placeholder="设置密码"
              prefix-icon="Lock"
              size="large"
              show-password
            />
          </el-form-item>
          
          <el-form-item prop="confirmPassword">
            <el-input
              v-model="registerForm.confirmPassword"
              type="password"
              placeholder="确认密码"
              prefix-icon="Lock"
              size="large"
              show-password
            />
          </el-form-item>

          <el-form-item prop="role">
            <el-select
              v-model="registerForm.role"
              placeholder="选择用户类型"
              size="large"
              style="width: 100%"
            >
              <el-option label="企业用户" value="enterprise" />
              <el-option label="运维人员" value="operator" />
            </el-select>
          </el-form-item>

          <el-form-item prop="agreement">
            <el-checkbox v-model="registerForm.agreement">
              我已阅读并同意
              <a href="#" @click.prevent="showAgreement">《用户服务协议》</a>
              和
              <a href="#" @click.prevent="showPrivacy">《隐私政策》</a>
            </el-checkbox>
          </el-form-item>

          <el-form-item>
            <el-button
              type="primary"
              size="large"
              :loading="loading"
              class="register-btn"
              @click="handleRegister"
            >
              <span v-if="!loading">立即注册</span>
              <span v-else>注册中...</span>
            </el-button>
          </el-form-item>
        </el-form>
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

const registerFormRef = ref(null)
const loading = ref(false)

const registerForm = reactive({
  username: '',
  email: '',
  phone: '',
  enterprise: '',
  password: '',
  confirmPassword: '',
  role: '',
  agreement: false
})

const validatePass = (rule, value, callback) => {
  if (value === '') {
    callback(new Error('请输入密码'))
  } else if (value.length < 6) {
    callback(new Error('密码长度不能少于6位'))
  } else {
    if (registerForm.confirmPassword !== '') {
      registerFormRef.value.validateField('confirmPassword')
    }
    callback()
  }
}

const validatePass2 = (rule, value, callback) => {
  if (value === '') {
    callback(new Error('请再次输入密码'))
  } else if (value !== registerForm.password) {
    callback(new Error('两次输入密码不一致'))
  } else {
    callback()
  }
}

const validateAgreement = (rule, value, callback) => {
  if (!value) {
    callback(new Error('请阅读并同意用户协议'))
  } else {
    callback()
  }
}

const registerRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '用户名长度为3-20个字符', trigger: 'blur' }
  ],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入正确的邮箱格式', trigger: 'blur' }
  ],
  phone: [
    { required: true, message: '请输入手机号码', trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号码', trigger: 'blur' }
  ],
  enterprise: [
    { required: true, message: '请输入所属企业', trigger: 'blur' }
  ],
  password: [
    { required: true, validator: validatePass, trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, validator: validatePass2, trigger: 'blur' }
  ],
  role: [
    { required: true, message: '请选择用户类型', trigger: 'change' }
  ],
  agreement: [
    { validator: validateAgreement, trigger: 'change' }
  ]
}

const handleRegister = async () => {
  if (!registerFormRef.value) return
  
  await registerFormRef.value.validate(async (valid) => {
    if (!valid) return
    
    loading.value = true
    try {
      const result = await userStore.register({
        username: registerForm.username,
        email: registerForm.email,
        phone: registerForm.phone,
        enterprise: registerForm.enterprise,
        password: registerForm.password,
        role: registerForm.role
      })
      
      if (result.success) {
        ElMessage.success('注册成功，请登录')
        router.push('/login')
      } else {
        ElMessage.error(result.message || '注册失败')
      }
    } catch (error) {
      ElMessage.error('注册失败，请稍后重试')
    } finally {
      loading.value = false
    }
  })
}

const showAgreement = () => {
  ElMessage.info('用户服务协议')
}

const showPrivacy = () => {
  ElMessage.info('隐私政策')
}
</script>

<style lang="scss" scoped>
.register-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  background: $bg-darker;
}

.register-bg {
  position: absolute;
  inset: 0;
  overflow: hidden;
  
  .bg-gradient {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at 70% 20%, rgba($primary-color, 0.12) 0%, transparent 50%),
                radial-gradient(ellipse at 30% 80%, rgba($secondary-color, 0.08) 0%, transparent 50%);
  }
  
  .bg-pattern {
    position: absolute;
    inset: 0;
    background-image: 
      linear-gradient(rgba($primary-color, 0.02) 1px, transparent 1px),
      linear-gradient(90deg, rgba($primary-color, 0.02) 1px, transparent 1px);
    background-size: 40px 40px;
  }
}

.register-content {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 440px;
  padding: 20px;
}

.register-header {
  margin-bottom: 24px;
  
  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: $text-secondary;
    font-size: 14px;
    margin-bottom: 16px;
    transition: color $transition-fast;
    
    &:hover {
      color: $primary-color;
    }
  }
  
  .title {
    font-size: 26px;
    font-weight: 700;
    color: $text-primary;
    margin-bottom: 8px;
  }
  
  .subtitle {
    font-size: 14px;
    color: $text-secondary;
  }
}

.register-card {
  background: rgba($bg-card, 0.9);
  backdrop-filter: blur(20px);
  border-radius: 20px;
  border: 1px solid $border-color;
  padding: 32px;
}

.register-form {
  :deep(.el-form-item) {
    margin-bottom: 18px;
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
  
  :deep(.el-select) {
    --el-select-input-focus-border-color: #{$primary-color};
    
    .el-input__wrapper {
      border-radius: 10px;
    }
  }
  
  :deep(.el-checkbox) {
    --el-checkbox-text-color: #{$text-secondary};
    --el-checkbox-checked-text-color: #{$primary-color};
    --el-checkbox-checked-bg-color: #{$primary-color};
    --el-checkbox-checked-input-border-color: #{$primary-color};
    
    a {
      color: $primary-color;
      
      &:hover {
        text-decoration: underline;
      }
    }
  }
  
  .register-btn {
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
  }
}

@media screen and (max-width: $breakpoint-sm) {
  .register-header .title {
    font-size: 22px;
  }
  
  .register-card {
    padding: 24px 20px;
  }
}
</style>
