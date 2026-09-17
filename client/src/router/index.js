import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/push-test',
      name: 'push-test',
      component: () => import('../views/PushTest.vue')
    }
  ]
})

export default router
