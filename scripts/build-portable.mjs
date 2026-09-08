import { copyFile, mkdir, readdir } from 'fs/promises'
import { join, resolve } from 'path'

const root = resolve(import.meta.dirname, '..')
const releaseDir = join(root, 'src-tauri', 'target', 'release')
const exeName = 'amnote-tauri.exe'

// 生成 output-YYYYMMDD-HHmmss 格式的目录名
const now = new Date()
const ts = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, '0'),
  String(now.getDate()).padStart(2, '0')
].join('') + '-' + [
  String(now.getHours()).padStart(2, '0'),
  String(now.getMinutes()).padStart(2, '0'),
  String(now.getSeconds()).padStart(2, '0')
].join('')

const outputDir = join(root, `output-${ts}`)

try {
  const exePath = join(releaseDir, exeName)

  // 创建输出目录（必须先于 copyFile）
  await mkdir(outputDir, { recursive: true })

  // 复制 exe
  await copyFile(exePath, join(outputDir, exeName)).catch(() => {
    console.error(`❌ 未找到 ${exePath}，请先执行构建`)
    process.exit(1)
  })
  const sizeMB = (await import('fs')).statSync(join(outputDir, exeName)).size / (1024 * 1024)

  console.log(`\n✅ 免安装包已生成：`)
  console.log(`   📁 ${outputDir}`)
  console.log(`   📦 ${exeName} (${sizeMB.toFixed(1)} MB)`)
  console.log(`   💡 双击即可运行，无需安装\n`)
} catch (err) {
  console.error('❌ 打包失败:', err.message)
  process.exit(1)
}
