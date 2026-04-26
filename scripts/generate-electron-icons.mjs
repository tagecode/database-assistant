import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const buildDir = path.join(root, 'build')
const inputPng = path.join(buildDir, 'icon.png')

if (!existsSync(inputPng)) {
  console.error('Missing source icon: build/icon.png (expect >= 1024x1024 recommended)')
  process.exit(1)
}

execSync('pnpm exec electron-icon-builder --input build/icon.png --output build', {
  cwd: root,
  stdio: 'inherit',
  shell: true,
})

const macIcns = path.join(buildDir, 'icons', 'mac', 'icon.icns')
const winIco = path.join(buildDir, 'icons', 'win', 'icon.ico')
if (!existsSync(macIcns) || !existsSync(winIco)) {
  console.error('Expected outputs not found after electron-icon-builder:', { macIcns, winIco })
  process.exit(1)
}

mkdirSync(buildDir, { recursive: true })
copyFileSync(macIcns, path.join(buildDir, 'icon.icns'))
copyFileSync(winIco, path.join(buildDir, 'icon.ico'))
console.log('Wrote build/icon.icns, build/icon.ico (electron-builder 资源目录)')
