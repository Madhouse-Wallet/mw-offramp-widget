#!/usr/bin/env node
/**
 * scripts/build-lib.js
 *
 * Builds the mw-offramp-widget as an embeddable JS library.
 *
 * What it does:
 *   1. Checks that required build-time dev-dependencies are installed;
 *      installs any that are missing automatically.
 *   2. Runs the Vite library build (vite.config.lib.ts).
 *   3. Generates a TypeScript declaration file (index.d.ts) via tsc.
 *   4. Writes a package.json stub into dist-lib/ so the output can be
 *      published to npm or consumed via a local `npm link`.
 *
 * Output — dist-lib/
 *   mw-offramp-widget.es.js    ESM bundle (tree-shakeable, for bundlers)
 *   mw-offramp-widget.umd.js   UMD bundle (for <script> tags / CDN use)
 *   index.d.ts                 TypeScript declarations
 *   package.json               Publishable package metadata
 *
 * Usage:
 *   node scripts/build-lib.js
 *
 * The build will fail fast and clearly if anything is misconfigured.
 */

'use strict'

const { execSync, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'dist-lib')

// ─── Required build-time packages ─────────────────────────────────────────────
// These are only needed for the library build, not for the Next.js app.
// We check for them and install if missing so the script is self-contained.
//
// Note: rollup ships platform-specific native bindings as optional dependencies.
// npm has a known bug (https://github.com/npm/cli/issues/4828) where optional
// deps are skipped on incremental installs. We detect and fix this automatically.

const BUILD_DEPS = [
  { pkg: 'vite', version: '5' },
  { pkg: '@vitejs/plugin-react', version: '4' },
  { pkg: 'vite-plugin-css-injected-by-js', version: null },
]

function isInstalled(pkg) {
  try {
    require.resolve(pkg, { paths: [ROOT] })
    return true
  } catch {
    return false
  }
}

function rollupNativeBinding() {
  const os = process.platform
  const arch = process.arch
  if (os === 'win32' && arch === 'x64') return '@rollup/rollup-win32-x64-msvc'
  if (os === 'win32' && arch === 'arm64') return '@rollup/rollup-win32-arm64-msvc'
  if (os === 'darwin' && arch === 'x64') return '@rollup/rollup-darwin-x64'
  if (os === 'darwin' && arch === 'arm64') return '@rollup/rollup-darwin-arm64'
  if (os === 'linux' && arch === 'x64') return '@rollup/rollup-linux-x64-gnu'
  if (os === 'linux' && arch === 'arm64') return '@rollup/rollup-linux-arm64-gnu'
  return null
}

function ensureDeps() {
  const toInstall = BUILD_DEPS
    .filter(({ pkg }) => !isInstalled(pkg))
    .map(({ pkg, version }) => (version ? `${pkg}@${version}` : pkg))

  if (toInstall.length > 0) {
    console.log(`Installing missing build dependencies: ${toInstall.join(', ')}`)
    const result = spawnSync(
      'npm',
      ['install', '--save-dev', '--no-fund', '--no-audit', ...toInstall],
      { cwd: ROOT, stdio: 'inherit', shell: true },
    )
    if (result.status !== 0) {
      console.error('Failed to install build dependencies.')
      process.exit(1)
    }
  }

  // Fix the npm optional-deps bug for rollup native bindings
  const nativeBinding = rollupNativeBinding()
  if (nativeBinding && !isInstalled(nativeBinding)) {
    console.log(`Fixing missing rollup native binding: ${nativeBinding}`)
    const result = spawnSync(
      'npm',
      ['install', '--save-dev', '--no-fund', '--no-audit', nativeBinding],
      { cwd: ROOT, stdio: 'inherit', shell: true },
    )
    if (result.status !== 0) {
      console.error(`Failed to install ${nativeBinding}.`)
      process.exit(1)
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`)
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts })
  } catch {
    console.error(`\nCommand failed: ${cmd}`)
    process.exit(1)
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log('=== mw-offramp-widget library build ===\n')

// 1. Ensure build deps
ensureDeps()

// 2. Vite library build
//    We set TAILWIND_CONFIG so postcss.config.js can pick up the lib-specific
//    tailwind config. Vite reads the POSTCSS_CONFIG env var too — we point it
//    at our lib-specific postcss config.
run(
  'npx vite build --config vite.config.lib.ts',
  {
    env: {
      ...process.env,
      POSTCSS_CONFIG: path.join(ROOT, 'postcss.config.lib.js'),
    },
  },
)

// 3. TypeScript declarations
//    Uses a minimal tsconfig that only processes widget-lib/ + src/components + src/types.
const tsconfig = {
  compilerOptions: {
    target: 'ES2017',
    module: 'ESNext',
    moduleResolution: 'bundler',
    jsx: 'react-jsx',
    strict: true,
    declaration: true,
    declarationDir: DIST,
    emitDeclarationOnly: true,
    outDir: DIST,
    rootDir: ROOT,
    paths: { '@/*': ['./src/*'] },
    skipLibCheck: true,
  },
  include: [
    'widget-lib/**/*',
    'src/components/**/*',
    'src/types.ts',
    'src/lib/**/*',
  ],
}

const tsconfigPath = path.join(ROOT, 'tsconfig.lib.json')
fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2))

run(`npx tsc --project ${tsconfigPath}`)

// Clean up temp tsconfig
fs.unlinkSync(tsconfigPath)

// 4. Copy server files into dist-lib/
fs.copyFileSync(
  path.join(ROOT, 'widget-lib/proxy-server.js'),
  path.join(DIST, 'proxy-server.js'),
)
console.log('\n✓ dist-lib/proxy-server.js written')

fs.copyFileSync(
  path.join(ROOT, 'widget-lib/nextjs-proxy-handler.js'),
  path.join(DIST, 'nextjs-proxy-handler.js'),
)
console.log('✓ dist-lib/nextjs-proxy-handler.js written')

// 5. Write dist-lib/package.json
const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))

const distPkg = {
  name: rootPkg.name,
  version: rootPkg.version,
  description: rootPkg.description,
  main: './mw-offramp-widget.umd.js',
  module: './mw-offramp-widget.es.js',
  types: './widget-lib/index.d.ts',
  bin: {
    'mw-offramp-proxy': './proxy-server.js',
  },
  exports: {
    '.': {
      import: './mw-offramp-widget.es.js',
      require: './mw-offramp-widget.umd.js',
    },
  },
  peerDependencies: {
    react: '>=18',
    'react-dom': '>=18',
  },
  peerDependenciesMeta: {
    // express is only needed if you use proxy-server.js
    express: { optional: true },
  },
  sideEffects: false,
  license: rootPkg.license ?? 'UNLICENSED',
}

fs.writeFileSync(
  path.join(DIST, 'package.json'),
  JSON.stringify(distPkg, null, 2),
)
console.log('\n✓ dist-lib/package.json written')

// ─── Summary ──────────────────────────────────────────────────────────────────

const files = fs.readdirSync(DIST).sort()
console.log('\n=== Build complete ===')
console.log('Output: dist-lib/')
files.forEach((f) => {
  const size = fs.statSync(path.join(DIST, f)).size
  if (fs.statSync(path.join(DIST, f)).isFile()) {
    console.log(`  ${f.padEnd(40)} ${(size / 1024).toFixed(1)} kB`)
  }
})
console.log('\nESM:  dist-lib/mw-offramp-widget.es.js')
console.log('UMD:  dist-lib/mw-offramp-widget.umd.js')
console.log('Types: dist-lib/lib/index.d.ts')
