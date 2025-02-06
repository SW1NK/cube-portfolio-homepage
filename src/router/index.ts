import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';

const routes: Array<RouteRecordRaw> = [
  { path: '/', name: 'Home', component: () => import('../views/Web.vue') },
  { path: '/web', name: 'Web', component: () => import('../views/Web.vue') },
  { path: '/3d', name: 'ThreeD', component: () => import('../views/ThreeD.vue') },
  { path: '/fullstack', name: 'Fullstack', component: () => import('../views/Fullstack.vue') },
  { path: '/about', name: 'About', component: () => import('../views/About.vue') },
  { path: '/projects', name: 'Projects', component: () => import('../views/Projects.vue') },
  { path: '/contact', name: 'Contact', component: () => import('../views/Contact.vue') }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

export default router;
