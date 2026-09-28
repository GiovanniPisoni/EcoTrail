import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true }
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/RegisterView.vue'),
      meta: { public: true }
    },
    {
      path: '/',
      component: () => import('@/layouts/HikerLayout.vue'),
      meta: { requiresAuth: true, role: 'hiker' },
      children: [
        { path: '', name: 'hiker-home', component: () => import('@/views/HikerHomeView.vue') }
      ]
    },
    {
      path: '/admin',
      component: () => import('@/layouts/AdminLayout.vue'),
      meta: { requiresAuth: true, role: 'admin' },
      children: [
        { path: '', name: 'admin-home', component: () => import('@/views/AdminHomeView.vue') }
      ]
    },
    {
      path: '/push-test',
      name: 'push-test',
      component: () => import('@/views/PushTest.vue')
    }
  ]
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  const home = auth.isAdmin ? '/admin' : '/'

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login' }
  }

  if (to.meta.role && to.meta.role !== auth.user?.role) {
    return home
  }

  if (to.meta.public && auth.isAuthenticated) {
    return home
  }
})

export default router
