import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { userApi } from '@/api/user'

export const useUserStore = defineStore('user', () => {
  const token = ref(localStorage.getItem('token') || '')
  const userInfo = ref(JSON.parse(localStorage.getItem('userInfo') || 'null'))
  const permissions = ref([])

  const isLoggedIn = computed(() => !!token.value)
  const username = computed(() => userInfo.value?.username || '')
  const role = computed(() => userInfo.value?.role || '')

  async function login(credentials) {
    try {
      const res = await userApi.login(credentials)
      if (res.code === 200) {
        token.value = res.data.token
        userInfo.value = res.data.user
        permissions.value = res.data.permissions || []
        
        localStorage.setItem('token', res.data.token)
        localStorage.setItem('userInfo', JSON.stringify(res.data.user))
        
        return { success: true }
      }
      return { success: false, message: res.message || '登录失败' }
    } catch (error) {
      console.error('登录失败:', error)
      return { success: false, message: error.message || '网络错误，请稍后重试' }
    }
  }

  async function register(userData) {
    try {
      const res = await userApi.register(userData)
      if (res.code === 200) {
        return { success: true, data: res.data }
      }
      return { success: false, message: res.message || '注册失败' }
    } catch (error) {
      console.error('注册失败:', error)
      return { success: false, message: error.message || '网络错误，请稍后重试' }
    }
  }

  function logout() {
    token.value = ''
    userInfo.value = null
    permissions.value = []
    localStorage.removeItem('token')
    localStorage.removeItem('userInfo')
  }

  async function fetchUserInfo() {
    if (!token.value) return false
    try {
      const res = await userApi.getInfo()
      userInfo.value = res.data || res
      localStorage.setItem('userInfo', JSON.stringify(userInfo.value))
      return true
    } catch (error) {
      logout()
      return false
    }
  }

  function updateUserInfo(info) {
    userInfo.value = { ...userInfo.value, ...info }
    localStorage.setItem('userInfo', JSON.stringify(userInfo.value))
  }

  return {
    token,
    userInfo,
    permissions,
    isLoggedIn,
    username,
    role,
    login,
    register,
    logout,
    fetchUserInfo,
    updateUserInfo
  }
})
