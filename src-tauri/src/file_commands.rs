//! AmNote 文件操作命令模块
//!
//! 提供本地文件存储、外部文件浏览、Base64 编解码等 Tauri 命令。

use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

// ============================================================
// 应用数据目录
// ============================================================

/// 获取应用数据目录下的 files 子目录（不存在则创建）
fn files_dir(app: &AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().expect("failed to get app data dir");
    let files = dir.join("amnote-data").join("files");
    if !files.exists() {
        let _ = fs::create_dir_all(&files);
    }
    files
}

// ============================================================
// 当前查看路径（线程安全全局状态）
// ============================================================

/// 当前用户正在查看的外部目录路径
static CURRENT_VIEWING_PATH: Mutex<Option<String>> = Mutex::new(None);

/// 查询结果结构体
#[derive(Serialize)]
pub struct ViewPathResult {
    pub success: bool,
    pub path: Option<String>,
}

/// 设置当前查看路径
#[tauri::command]
pub fn set_current_viewing_path(path: Option<String>) -> ViewPathResult {
    if let Ok(mut guard) = CURRENT_VIEWING_PATH.lock() {
        *guard = path.clone();
    }
    ViewPathResult { success: true, path }
}

/// 获取当前查看路径
#[tauri::command]
pub fn get_current_viewing_path() -> ViewPathResult {
    if let Ok(guard) = CURRENT_VIEWING_PATH.lock() {
        ViewPathResult {
            success: true,
            path: guard.clone(),
        }
    } else {
        ViewPathResult {
            success: false,
            path: None,
        }
    }
}

// ============================================================
// 数据库路径
// ============================================================

/// 获取数据库文件绝对路径
#[tauri::command]
pub fn get_db_path(app: AppHandle) -> String {
    let dir = app.path().app_data_dir().expect("failed to get app data dir");
    dir.join("amnote.db").to_string_lossy().to_string()
}

// ============================================================
// 本地文件操作（应用数据目录下的附件）
// ============================================================

/// 保存本地文件的结果
#[derive(Serialize)]
pub struct SaveLocalFileResult {
    pub path: String,
    pub error: Option<String>,
}

/// 保存本地文件（图片等），返回相对路径 `amnote-data/files/xxx`
///
/// - 文件大小限制 1MB
/// - 文件名格式：`note_{noteId}_{timestamp}.{ext}`
#[tauri::command]
pub fn save_local_file(app: AppHandle, buffer: Vec<u8>, filename: String, note_id: i64) -> SaveLocalFileResult {
    const MAX_FILE_SIZE: usize = 1 * 1024 * 1024; // 1MB

    if buffer.len() > MAX_FILE_SIZE {
        return SaveLocalFileResult {
            path: String::new(),
            error: Some(format!(
                "文件大小超过限制（最大1MB），当前大小：{:.2}MB",
                buffer.len() as f64 / 1024.0 / 1024.0
            )),
        };
    }

    // 提取扩展名，默认 .png
    let ext = filename
        .rsplit_once('.')
        .map(|(_, e)| format!(".{}", e))
        .unwrap_or_else(|| ".png".to_string());

    let new_filename = format!("note_{}_{}{}", note_id, chrono::Utc::now().timestamp_millis(), ext);
    let file_path = files_dir(&app).join(&new_filename);

    match fs::write(&file_path, &buffer) {
        Ok(_) => SaveLocalFileResult {
            path: format!("amnote-data/files/{}", new_filename),
            error: None,
        },
        Err(e) => SaveLocalFileResult {
            path: String::new(),
            error: Some(e.to_string()),
        },
    }
}

// ============================================================
// 文件信息与扫描
// ============================================================

/// 文件元信息（序列化为 camelCase，与前端 FileInfo 接口对齐）
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub filename: String,
    pub size: u64,
    pub size_formatted: String,
    pub modified_time: String,
    pub path: String,
}

/// 递归遍历目录，收集所有文件信息
fn walk_files(dir: &PathBuf, result: &mut Vec<FileInfo>) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk_files(&path, result);
            } else if let Ok(meta) = entry.metadata() {
                result.push(FileInfo {
                    filename: entry.file_name().to_string_lossy().to_string(),
                    size: meta.len(),
                    size_formatted: format_file_size(meta.len()),
                    modified_time: meta
                        .modified()
                        .map(|t| {
                            t.duration_since(std::time::UNIX_EPOCH)
                                .map(|d| d.as_secs().to_string())
                                .unwrap_or_default()
                        })
                        .unwrap_or_default(),
                    path: path.to_string_lossy().to_string(),
                });
            }
        }
    }
}

/// 扫描被引用的文件（简化：返回空，实际由前端 SQL 处理）
#[tauri::command]
pub fn scan_referenced_files() -> Vec<String> {
    Vec::new()
}

/// 预览未使用的文件（返回应用数据目录下所有文件列表）
#[tauri::command]
pub fn preview_unused_files(app: AppHandle) -> Vec<FileInfo> {
    let mut result = Vec::new();
    walk_files(&files_dir(&app), &mut result);
    result
}

/// 获取所有文件（同 preview_unused_files）
#[tauri::command]
pub fn get_all_files(app: AppHandle) -> Vec<FileInfo> {
    preview_unused_files(app)
}

/// 获取文件完整路径
#[tauri::command]
pub fn get_file_path(app: AppHandle, filename: String) -> String {
    files_dir(&app).join(&filename).to_string_lossy().to_string()
}

// ============================================================
// 文件读取
// ============================================================

/// 读取文件为 Base64，返回 `{ base64: "data:mime;base64,...", error?: string }`
///
/// base64 字段包含完整 data URI，可直接用于 `<img src>` 或文本解码。
/// 支持 `amnote-data/files/xxx` 相对路径（自动解析到应用数据目录）。
#[tauri::command]
pub fn read_file_as_base64(app: AppHandle, file_path: String) -> serde_json::Value {
    // 相对路径 amnote-data/files/xxx → 应用数据目录绝对路径
    let resolved = if file_path.starts_with("amnote-data/") {
        let dir = app.path().app_data_dir().expect("failed to get app data dir");
        dir.join(&file_path).to_string_lossy().to_string()
    } else {
        file_path.clone()
    };

    let data = match fs::read(&resolved) {
        Ok(d) => d,
        Err(e) => return serde_json::json!({ "error": e.to_string() }),
    };
    let b64 = base64_encode(&data);
    let mime = guess_mime(&resolved);
    serde_json::json!({ "base64": format!("data:{};base64,{}", mime, b64) })
}

/// 根据文件扩展名猜测 MIME 类型
pub(crate) fn guess_mime(path: &str) -> &'static str {
    let ext = std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    match ext.as_str() {
        // 图片
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        // 文档
        "pdf" => "application/pdf",
        "html" | "htm" => "text/html",
        // 代码 / 配置
        "css" => "text/css",
        "js" => "text/javascript",
        "json" => "application/json",
        "xml" => "text/xml",
        "yaml" | "yml" => "text/yaml",
        "md" | "markdown" => "text/markdown",
        "txt" | "log" | "cfg" | "ini" | "toml" | "env" => "text/plain",
        // 编程语言
        "py" => "text/x-python",
        "java" => "text/x-java",
        "c" | "h" => "text/x-c",
        "cpp" | "hpp" | "cc" => "text/x-c++",
        "go" => "text/x-go",
        "rs" => "text/x-rust",
        "sql" => "text/x-sql",
        "sh" | "bat" | "ps1" => "text/x-shellscript",
        "vue" => "text/x-vue",
        "jsx" | "tsx" => "text/x-jsx",
        "scss" | "less" => "text/x-scss",
        // 兜底
        _ => "application/octet-stream",
    }
}

// ============================================================
// 文件删除 / 清理
// ============================================================

/// 删除应用数据目录下的指定文件，返回 `{ success: bool, message?: string }`
#[tauri::command]
pub fn delete_file(app: AppHandle, filename: String) -> serde_json::Value {
    let file_path = files_dir(&app).join(&filename);
    if !file_path.exists() {
        return serde_json::json!({ "success": true }); // 文件不存在视为成功（幂等）
    }
    match fs::remove_file(&file_path) {
        Ok(_) => serde_json::json!({ "success": true }),
        Err(e) => serde_json::json!({ "success": false, "message": e.to_string() }),
    }
}

/// 清理未使用的文件（简化版，暂不实现）
#[tauri::command]
pub fn clean_unused_files() -> serde_json::Value {
    serde_json::json!({ "deleted": 0, "freedSpace": 0 })
}

// ============================================================
// 外部文件操作
// ============================================================

/// 支持的图片扩展名列表
const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico"];

/// 目录扫描最大深度
const MAX_SCAN_DEPTH: usize = 3;

/// 扫描外部目录，返回树形结构
///
/// 返回格式：`{ success: bool, tree: [{ name, path, children, files, hasChildren, loaded }] }`
/// - 目录节点：name=目录名, children=子目录, files=当前目录文件
/// - 文件节点：name="(文件)", files=文件列表
#[tauri::command]
pub fn scan_external_dirs(parent_path: Option<String>) -> serde_json::Value {
    let path_str = match parent_path {
        Some(p) if !p.is_empty() => p,
        _ => return serde_json::json!({ "success": false, "error": "未设置查看路径" }),
    };

    let root = match std::path::Path::new(&path_str).canonicalize() {
        Ok(p) => p,
        Err(e) => return serde_json::json!({ "success": false, "error": format!("路径无效: {}", e) }),
    };

    if !root.is_dir() {
        return serde_json::json!({ "success": false, "error": "路径不是目录" });
    }

    let tree = scan_dir(&root, 0);
    serde_json::json!({ "success": true, "tree": tree })
}

/// 递归扫描目录，生成树形 JSON 结构
fn scan_dir(dir: &std::path::Path, depth: usize) -> Vec<serde_json::Value> {
    if depth > MAX_SCAN_DEPTH {
        return Vec::new();
    }

    let mut dirs: Vec<serde_json::Value> = Vec::new();
    let mut files: Vec<serde_json::Value> = Vec::new();

    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        // 跳过隐藏文件/目录（以 . 开头）
        if name.starts_with('.') {
            continue;
        }

        if path.is_dir() {
            let has_children = fs::read_dir(&path).map(|mut r| r.next().is_some()).unwrap_or(false);
            // 仅展开第一层子目录，更深层级懒加载
            let children = if depth < 1 {
                scan_dir(&path, depth + 1)
            } else {
                Vec::new()
            };
            dirs.push(serde_json::json!({
                "name": name,
                "path": path.to_string_lossy().to_string(),
                "children": children,
                "files": [],
                "hasChildren": has_children,
                "loaded": depth < 1,
            }));
        } else if path.is_file() {
            let ext = path.extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            let is_image = IMAGE_EXTENSIONS.contains(&ext.as_str());
            let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            files.push(serde_json::json!({
                "id": 0,
                "filename": name,
                "path": path.to_string_lossy().to_string(),
                "size": size,
                "isImage": is_image,
            }));
        }
    }

    // 排序：目录和文件分别按名称排序
    dirs.sort_by(|a, b| a["name"].as_str().cmp(&b["name"].as_str()));
    files.sort_by(|a, b| a["filename"].as_str().cmp(&b["filename"].as_str()));

    // 将当前目录下的文件放在最前面的虚拟节点中
    let mut result = Vec::new();
    if !files.is_empty() {
        result.push(serde_json::json!({
            "name": "(文件)",
            "path": dir.to_string_lossy().to_string(),
            "children": [],
            "files": files,
            "hasChildren": false,
            "loaded": true,
        }));
    }
    result.extend(dirs);
    result
}

/// 用系统默认程序打开外部文件
#[tauri::command]
pub fn open_external_file(file_path: String) -> Result<serde_json::Value, String> {
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err(format!("文件不存在: {}", file_path));
    }

    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(&file_path)
        .spawn()
        .map_err(|e| format!("打开文件失败: {}", e))?;

    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&file_path)
        .spawn()
        .map_err(|e| format!("打开文件失败: {}", e))?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&file_path)
        .spawn()
        .map_err(|e| format!("打开文件失败: {}", e))?;

    Ok(serde_json::json!({ "success": true }))
}

/// 保存内容到外部文件（Base64 编码）
#[tauri::command]
pub fn save_external_file(file_path: String, base64_content: String) -> Result<(), String> {
    let data = base64_decode(&base64_content).map_err(|e| e.to_string())?;
    fs::write(&file_path, &data).map_err(|e| e.to_string())
}

/// 创建外部目录（递归创建）
#[tauri::command]
pub fn create_external_dir(dir_path: String) -> Result<(), String> {
    fs::create_dir_all(&dir_path).map_err(|e| e.to_string())
}

/// 创建外部空文件（已存在则跳过）
#[tauri::command]
pub fn create_external_file(file_path: String) -> Result<(), String> {
    if !std::path::Path::new(&file_path).exists() {
        fs::write(&file_path, "").map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 删除外部目录（递归删除）
#[tauri::command]
pub fn delete_external_dir(dir_path: String) -> Result<(), String> {
    fs::remove_dir_all(&dir_path).map_err(|e| e.to_string())
}

/// 删除外部文件
#[tauri::command]
pub fn delete_external_file(file_path: String) -> Result<(), String> {
    fs::remove_file(&file_path).map_err(|e| e.to_string())
}

/// 将文本内容写入外部文件（UTF-8）
#[tauri::command]
pub fn save_external_text(file_path: String, content: String) -> Result<(), String> {
    fs::write(&file_path, content).map_err(|e| e.to_string())
}

/// 重命名外部文件或目录（同目录内改名）
#[tauri::command]
pub fn rename_external_path(old_path: String, new_path: String) -> Result<(), String> {
    let src = std::path::Path::new(&old_path);
    if !src.exists() {
        return Err("源路径不存在".to_string());
    }
    if std::path::Path::new(&new_path).exists() {
        return Err("目标名称已存在".to_string());
    }
    fs::rename(src, &new_path).map_err(|e| e.to_string())
}

/// 移动外部文件或目录到目标目录，返回移动后的新路径
#[tauri::command]
pub fn move_external_path(source_path: String, dest_dir: String) -> Result<String, String> {
    let src = std::path::Path::new(&source_path);
    if !src.exists() {
        return Err("源路径不存在".to_string());
    }
    let dest_root = std::path::Path::new(&dest_dir);
    if !dest_root.is_dir() {
        return Err("目标目录不存在".to_string());
    }
    let name = src
        .file_name()
        .ok_or_else(|| "无法获取文件名".to_string())?;
    let dest = dest_root.join(name);
    if dest.exists() {
        return Err("目标目录已存在同名项".to_string());
    }
    fs::rename(src, &dest).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().to_string())
}

// ============================================================
// 导入
// ============================================================

/// 读取文本文件内容，返回 `{ content?: string, error?: string }`
///
/// 用于导入外部文本文件（md/txt/html 等）创建笔记，限制 10MB。
#[tauri::command]
pub fn read_text_file(file_path: String) -> serde_json::Value {
    const MAX_SIZE: u64 = 10 * 1024 * 1024; // 10MB

    let meta = match fs::metadata(&file_path) {
        Ok(m) => m,
        Err(e) => return serde_json::json!({ "error": format!("无法访问文件: {}", e) }),
    };
    if meta.len() > MAX_SIZE {
        return serde_json::json!({ "error": "文件超过 10MB 限制" });
    }

    match fs::read_to_string(&file_path) {
        Ok(content) => serde_json::json!({ "content": content }),
        Err(_) => serde_json::json!({ "error": "文件不是有效的 UTF-8 文本" }),
    }
}

/// 复制外部文件到应用附件目录（amnote-data/files/）
///
/// 返回 `{ success, filename?, conflict?, error? }`：
/// - 同名文件已存在且 overwrite=false → `{ conflict: true, filename }`
/// - 复制成功 → `{ success: true, filename }`
#[tauri::command]
pub fn copy_file_to_attachments(app: AppHandle, source_path: String, overwrite: bool) -> serde_json::Value {
    let src = std::path::Path::new(&source_path);
    if !src.is_file() {
        return serde_json::json!({ "error": "源文件不存在" });
    }

    let filename = src.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unnamed".to_string());
    let dest = files_dir(&app).join(&filename);

    if dest.exists() && !overwrite {
        return serde_json::json!({ "conflict": true, "filename": filename });
    }

    match fs::copy(src, &dest) {
        Ok(_) => serde_json::json!({ "success": true, "filename": filename }),
        Err(e) => serde_json::json!({ "error": format!("复制失败: {}", e) }),
    }
}

// ============================================================
// 工具函数
// ============================================================

/// 格式化文件大小（B / KB / MB）
fn format_file_size(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{} B", bytes)
    } else if bytes < 1024 * 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else {
        format!("{:.1} MB", bytes as f64 / 1024.0 / 1024.0)
    }
}

/// Base64 编码
fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let n = (b0 << 16) | (b1 << 8) | b2;
        result.push(CHARS[((n >> 18) & 63) as usize] as char);
        result.push(CHARS[((n >> 12) & 63) as usize] as char);
        if chunk.len() > 1 {
            result.push(CHARS[((n >> 6) & 63) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(CHARS[(n & 63) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}

/// Base64 解码
fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let input = input.trim_end_matches('=');
    let mut result = Vec::with_capacity(input.len() * 3 / 4);
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        let mut n = 0u32;
        let mut count = 0;
        while count < 4 && i < bytes.len() {
            if let Some(p) = CHARS.iter().position(|&c| c == bytes[i]) {
                n = (n << 6) | (p as u32);
                count += 1;
            }
            i += 1;
        }
        n <<= 6 * (4 - count);
        if count >= 2 {
            result.push((n >> 16) as u8);
        }
        if count >= 3 {
            result.push((n >> 8) as u8);
        }
        if count >= 4 {
            result.push(n as u8);
        }
    }
    Ok(result)
}
