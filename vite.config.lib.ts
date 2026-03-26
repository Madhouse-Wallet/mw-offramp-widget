import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

export default defineConfig({
  plugins: [
    react(),
    // Injects compiled CSS as a <style> tag at runtime — no separate .css file
    // needed. Consumers just include the single JS bundle.
    cssInjectedByJsPlugin(),
  ],

  resolve: {
    alias: [
      // Replace the Next.js-specific API client (src/api/client.ts) with the
      // lib version (lib/api/client.ts) for all components.
      // Vite aliases match against the resolved absolute path, so we point the
      // *file on disk* at the lib replacement — regardless of how deep the
      // relative import is from the importing file.
      {
        find: resolve(__dirname, 'src/api/client.ts'),
        replacement: resolve(__dirname, 'lib/api/client.ts'),
      },
      {
        find: '@',
        replacement: resolve(__dirname, 'src'),
      },
    ],
  },

  // Don't copy public/ assets — this is a library, not a web app
  publicDir: false,

  build: {
    outDir: 'dist-lib',
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'lib/index.ts'),
      name: 'MWOfframpWidget',
      // Produces three formats:
      //   dist-lib/mw-offramp-widget.es.js   — ESM for bundler consumers
      //   dist-lib/mw-offramp-widget.umd.js  — UMD for script-tag / CDN use
      formats: ['es', 'umd'],
      fileName: (format) => `mw-offramp-widget.${format}.js`,
    },
    rollupOptions: {
      // React is a peer dependency — don't bundle it.
      // ESM consumers must have react + react-dom in their own bundle.
      // UMD consumers must load React globally (window.React, window.ReactDOM).
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'react/jsx-runtime': 'ReactJSXRuntime',
        },
      },
    },
  },
})
