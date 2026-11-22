import { defineConfig } from 'vite'

export default defineConfig({
  // foliate-js loads its format modules and vendored zip lib via dynamic import;
  // keep it out of dependency pre-bundling so those relative imports resolve.
  optimizeDeps: { exclude: ['foliate-js'] },
})
