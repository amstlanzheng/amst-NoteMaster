import { join, basename, dirname } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'

export interface SftpConfig {
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
  remotePath: string
}

let tempSftpConfig: SftpConfig | null = null

export function setTempSftpConfig(config: SftpConfig) {
  tempSftpConfig = config
}

export function getTempSftpConfig(): SftpConfig | null {
  return tempSftpConfig
}

async function getSftpClient() {
  try {
    const pkg = await import('ssh2-sftp-client')
    return pkg.default || pkg
  } catch (e: any) {
    if (e.code === 'ERR_MODULE_NOT_FOUND' || e.code === 'MODULE_NOT_FOUND' || e.message?.includes('Cannot find')) {
      throw new Error('SSH/SFTP 模块未安装，请运行 npm install ssh2-sftp-client 安装依赖后重试')
    }
    throw e
  }
}

async function getClient(config: SftpConfig): Promise<any> {
  const SftpClient = await getSftpClient()
  const sftp = new SftpClient()
  const connectConfig: any = {
    host: config.host,
    port: config.port || 22,
    username: config.username,
    readyTimeout: 10000
  }
  if (config.privateKey) {
    connectConfig.privateKey = config.privateKey
  } else if (config.password) {
    connectConfig.password = config.password
  }
  await sftp.connect(connectConfig)
  return sftp
}

async function ensureRemoteDir(sftp: any, remotePath: string) {
  try { await sftp.stat(remotePath) } catch { await sftp.mkdir(remotePath, true) }
}

export async function testSftpConnection(config: SftpConfig): Promise<{ ok: boolean; message: string }> {
  let sftp: any = null
  try {
    sftp = await getClient(config)
    const remotePath = config.remotePath || '/amnote-data'
    await ensureRemoteDir(sftp, remotePath)
    await ensureRemoteDir(sftp, remotePath + '/files')
    return { ok: true, message: '云服务器连接成功' }
  } catch (e: any) {
    return { ok: false, message: '连接失败: ' + (e.message || '未知错误') }
  } finally {
    if (sftp) await sftp.end()
  }
}

export async function uploadAllToRemote(
  config: SftpConfig,
  dbFilePath: string,
  filesDir: string,
  referencedFiles: string[],
  onProgress?: (current: number, total: number, status: string) => void
): Promise<{ ok: boolean; message: string; dbOk: boolean; filesCount: number }> {
  let sftp: any = null
  try {
    sftp = await getClient(config)
    const baseRemote = config.remotePath || '/amnote-data'
    await ensureRemoteDir(sftp, baseRemote)
    await ensureRemoteDir(sftp, baseRemote + '/files')

    let dbOk = false
    if (existsSync(dbFilePath)) {
      if (onProgress) onProgress(0, referencedFiles.length + 1, '正在上传数据库...')
      await sftp.put(dbFilePath, baseRemote + '/amnote.db')
      dbOk = true
      if (onProgress) onProgress(1, referencedFiles.length + 1, '数据库上传完成')
    }

    let filesCount = 0
    for (let i = 0; i < referencedFiles.length; i++) {
      const relPath = referencedFiles[i]
      const localPath = join(filesDir, relPath)
      if (!existsSync(localPath)) continue
      
      const remoteFilePath = (baseRemote + '/files/' + relPath).replace(/\\/g, '/')
      const remoteDir = remoteFilePath.substring(0, remoteFilePath.lastIndexOf('/'))
      try { await sftp.stat(remoteDir) } catch { await sftp.mkdir(remoteDir, true) }
      
      await sftp.put(localPath, remoteFilePath)
      filesCount++
      
      // 每上传5个文件或最后一个文件时发送进度
      if (onProgress && (filesCount % 5 === 0 || filesCount === referencedFiles.length)) {
        onProgress(filesCount + 1, referencedFiles.length + 1, `正在上传文件 ${filesCount}/${referencedFiles.length}`)
      }
    }

    return {
      ok: true,
      message: `上传完成：数据库${dbOk ? ' ✅' : ' ❌'}，${filesCount} 个文件`,
      dbOk,
      filesCount
    }
  } catch (e: any) {
    return { ok: false, message: '上传失败: ' + (e.message || '未知错误'), dbOk: false, filesCount: 0 }
  } finally {
    if (sftp) await sftp.end()
  }
}

export async function downloadAllFromRemote(
  config: SftpConfig,
  localDbPath: string,
  localFilesDir: string
): Promise<{ ok: boolean; message: string; dbOk: boolean; filesCount: number }> {
  let sftp: any = null
  try {
    sftp = await getClient(config)
    const baseRemote = config.remotePath || '/amnote-data'

    if (!existsSync(localFilesDir)) mkdirSync(localFilesDir, { recursive: true })
    const localDbDir = dirname(localDbPath)
    if (!existsSync(localDbDir)) mkdirSync(localDbDir, { recursive: true })

    let dbOk = false
    try {
      const remoteDb = baseRemote + '/amnote.db'
      await sftp.stat(remoteDb)
      await sftp.get(remoteDb, localDbPath)
      dbOk = true
    } catch {
      // 远程没有数据库文件
    }

    let filesCount = 0
    try {
      const remoteFilesDir = baseRemote + '/files'
      async function downloadDir(remoteDir: string, localBase: string): Promise<number> {
        let count = 0
        const list = await sftp!.list(remoteDir)
        for (const item of list) {
          const remoteItem = remoteDir + '/' + item.name
          const localItem = join(localBase, item.name)
          if (item.type === 'd') {
            if (!existsSync(localItem)) mkdirSync(localItem, { recursive: true })
            count += await downloadDir(remoteItem, localItem)
          } else {
            await sftp!.get(remoteItem, localItem)
            count++
          }
        }
        return count
      }
      filesCount = await downloadDir(remoteFilesDir, localFilesDir)
    } catch {
      // 远程没有文件目录
    }

    return {
      ok: true,
      message: `下载完成：数据库${dbOk ? ' ✅' : ' (远程无数据库)'}，${filesCount} 个文件`,
      dbOk,
      filesCount
    }
  } catch (e: any) {
    return { ok: false, message: '下载失败: ' + (e.message || '未知错误'), dbOk: false, filesCount: 0 }
  } finally {
    if (sftp) await sftp.end()
  }
}
