/**
 * 跨平台免安装打包脚本
 *
 * 用法：npm run build:portable
 *
 * 各平台产物（统一输出到 output-YYYYMMDD-HHmmss/）：
 * - Windows：amnote-tauri.exe  单文件，双击即用
 * - Linux：  amnote-tauri      单文件（已设可执行权限），依赖系统 WebKitGTK 运行库
 * - macOS：  AmNote.app        应用包，拖入「应用程序」即可
 *
 * 平台差异：macOS 的 GUI 应用必须是 .app 结构（Info.plist / icns 图标），
 * 因此该平台用 `tauri build --bundles app`；Windows / Linux 用 `--no-bundle`
 * 直接产出裸可执行文件（前端资源已由 Tauri 嵌入）。
 */
import { chmod, copyFile, cp, mkdir, readFile, readdir, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { spawnSync } from 'child_process'
import { join, resolve } from 'path'

const root = resolve(import.meta.dirname, '..')
const releaseDir = join(root, 'src-tauri', 'target', 'release')
const isWin = process.platform === 'win32'
const isMac = process.platform === 'darwin'

/** 生成输出目录名 output-YYYYMMDD-HHmmss */
function makeOutputDir() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const ts = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  return join(root, `output-${ts}`)
}

/** 调用本地 Tauri CLI 构建（用 node 直跑 CLI 入口，避免各平台 .cmd / shell 差异） */
function build() {
  const cli = join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')
  const args = isMac ? ['build', '--bundles', 'app'] : ['build', '--no-bundle']
  console.log(`\n🔨 tauri ${args.join(' ')}\n`)
  const { status } = spawnSync(process.execPath, [cli, ...args], { cwd: root, stdio: 'inherit' })
  if (status !== 0) {
    console.error('\n❌ 构建失败，请检查上方日志')
    process.exit(status ?? 1)
  }
}

/** 递归统计文件/目录体积（字节） */
async function sizeInBytes(path) {
  const s = await stat(path)
  if (!s.isDirectory()) return s.size
  let total = 0
  for (const entry of await readdir(path, { withFileTypes: true })) {
    total += await sizeInBytes(join(path, entry.name))
  }
  return total
}

build()

const toMB = (bytes) => (bytes / 1024 / 1024).toFixed(1)
const productName = JSON.parse(await readFile(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8')).productName
const binName = isWin ? 'amnote-tauri.exe' : 'amnote-tauri'
const artifact = isMac
  ? { name: `${productName}.app`, src: join(releaseDir, 'bundle', 'macos', `${productName}.app`) }
  : { name: binName, src: join(releaseDir, binName) }

const outputDir = makeOutputDir()

try {
  if (!existsSync(artifact.src)) {
    console.error(`❌ 未找到构建产物 ${artifact.src}，请先确认构建成功`)
    process.exit(1)
  }

  await mkdir(outputDir, { recursive: true })
  const dest = join(outputDir, artifact.name)

  if (isMac) {
    await cp(artifact.src, dest, { recursive: true })
  } else {
    await copyFile(artifact.src, dest)
    if (!isWin) await chmod(dest, 0o755)
  }

  console.log('\n✅ 免安装包已生成：')
  console.log(`   📁 ${outputDir}`)
  console.log(`   📦 ${artifact.name} (${toMB(await sizeInBytes(dest))} MB)`)
  console.log(isMac ? '   💡 将 AmNote.app 拖入「应用程序」即可，无需安装器\n' : '   💡 双击即可运行，无需安装\n')
} catch (err) {
  console.error('❌ 打包失败:', err.message)
  process.exit(1)
}
