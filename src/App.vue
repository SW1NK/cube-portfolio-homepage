<template>
  <div id="app">
    <!-- The cube menu component (with 3D animations) -->
    <CubeMenu />
    <!-- The main content area that changes with the route -->
    <div class="page-content">
      <router-view />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import CubeMenu from './components/CubeMenu.vue';

export default defineComponent({
  name: 'App',
  components: { CubeMenu }
});
</script>

<style lang="scss">
#app {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #f0f0f0;
}

.page-content {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  padding-top: 80px; // leave room for the menu (if needed)
}
</style>
