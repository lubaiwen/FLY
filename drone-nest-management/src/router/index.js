import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '@/store/user'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { requiresAuth: false, title: '登录' }
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('@/views/Register.vue'),
    meta: { requiresAuth: false, title: '注册' }
  },
  {
    path: '/',
    component: () => import('@/views/Layout.vue'),
    redirect: '/dashboard',
    meta: { requiresAuth: true },
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/Dashboard.vue'),
        meta: { title: '数据概览' }
      },
      {
        path: 'monitor',
        name: 'Monitor',
        component: () => import('@/views/Monitor.vue'),
        meta: { title: '实时监控' }
      },
      {
        path: 'drones',
        name: 'Drones',
        component: () => import('@/views/Drones.vue'),
        meta: { title: '无人机管理' }
      },
      {
        path: 'nests',
        name: 'Nests',
        component: () => import('@/views/Nests.vue'),
        meta: { title: '机巢管理' }
      },
      {
        path: 'scheduling',
        name: 'Scheduling',
        component: () => import('@/views/Scheduling.vue'),
        meta: { title: '智能调度' }
      },
      {
        path: 'booking',
        name: 'Booking',
        component: () => import('@/views/Booking.vue'),
        meta: { title: '预约调度' }
      },
      {
        path: 'charging',
        name: 'Charging',
        component: () => import('@/views/Charging.vue'),
        meta: { title: '充电管理' }
      },
      {
        path: 'orders',
        name: 'Orders',
        component: () => import('@/views/Orders.vue'),
        meta: { title: '订单管理' }
      },
      {
        path: 'alerts',
        name: 'Alerts',
        component: () => import('@/views/Alerts.vue'),
        meta: { title: '故障报警' }
      },
      {
        path: 'statistics',
        name: 'Statistics',
        component: () => import('@/views/Statistics.vue'),
        meta: { title: '数据统计' }
      },
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('@/views/Settings.vue'),
        meta: { title: '系统设置' }
      }
    ]
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/NotFound.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach(async (to, from, next) => {
  document.title = `${to.meta.title || '无人机机巢管理系统'} - 智能调度平台`

  const userStore = useUserStore()
  const hasToken = !!userStore.token
  const isPublicRoute = to.meta.requiresAuth === false

  if (!isPublicRoute && hasToken && !userStore.userInfo) {
    const valid = await userStore.fetchUserInfo()
    if (!valid) return next('/login')
  }

  if (!isPublicRoute && !userStore.isLoggedIn) {
    next('/login')
  } else if ((to.path === '/login' || to.path === '/register') && userStore.isLoggedIn) {
    next('/dashboard')
  } else {
    next()
  }
})

export default router
