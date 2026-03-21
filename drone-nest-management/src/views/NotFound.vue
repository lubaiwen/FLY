<template>
  <div class="not-found-page">
    <div class="content">
      <div class="error-code">404</div>
      <h1>页面未找到</h1>
      <p>抱歉，您访问的页面不存在</p>
      <el-button type="primary" @click="goHome">返回首页</el-button>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
const router = useRouter()
const goHome = () => router.push('/')
</script>

<style lang="scss" scoped>
.not-found-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: $bg-dark; text-align: center; }
.content { .error-code { font-size: 120px; font-weight: 700; background: linear-gradient(135deg, $primary-color, $primary-dark); -webkit-background-clip: text; -webkit-text-fill-color: transparent; line-height: 1; margin-bottom: 16px; }
  h1 { font-size: 28px; color: $text-primary; margin-bottom: 8px; }
  p { color: $text-secondary; margin-bottom: 24px; }
}
</style>
