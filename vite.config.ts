import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? listFiles(full) : [full]
  })
}

// สร้าง dist/sw.js จาก sw-template.js พร้อมรายการไฟล์ที่ต้อง precache (ไม่ต้องพึ่ง package เพิ่ม)
function offlineServiceWorker(): Plugin {
  let publicDir = ''
  return {
    name: 'offline-service-worker',
    apply: 'build',
    configResolved(config) {
      publicDir = config.publicDir
    },
    generateBundle(_options, bundle) {
      const files = new Set<string>(['./'])
      for (const name of Object.keys(bundle)) {
        if (!name.endsWith('.map')) files.add(name)
      }
      if (publicDir) {
        try {
          for (const f of listFiles(publicDir)) {
            files.add(relative(publicDir, f).split('\\').join('/'))
          }
        } catch {
          // ไม่มีโฟลเดอร์ public
        }
      }
      files.delete('sw.js')
      const list = [...files].sort()
      const version = createHash('sha256').update(list.join('|')).digest('hex').slice(0, 10)
      const hash = createHash('sha256')
      for (const name of Object.keys(bundle).sort()) {
        const item = bundle[name]
        if (!item || name.endsWith('.map')) continue
        hash.update(name).update(item.type === 'chunk' ? item.code : String(item.source))
      }
      const template = readFileSync(fileURLToPath(new URL('./sw-template.js', import.meta.url)), 'utf-8')
      const source = template
        .replace("/*__VERSION__*/ 'dev'", JSON.stringify(`${version}-${hash.digest('hex').slice(0, 10)}`))
        .replace('/*__PRECACHE__*/ []', JSON.stringify(list))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    offlineServiceWorker(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor'
          }
        },
      },
    },
  },
  // GitHub Pages serves this project under /<repository-name>/.
  base: process.env.GITHUB_ACTIONS === 'true' ? '/pali-memorize-vue/' : './',
  // Server configuration
  server: {
    port: 3000,
    strictPort: true,
    host: true,
  },
})