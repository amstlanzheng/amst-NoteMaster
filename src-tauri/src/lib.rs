//! AmNote Tauri 应用入口
//!
//! 负责：
//! 1. 从旧 Electron 数据目录迁移数据库和图片
//! 2. 数据库表结构迁移
//! 3. 注册 Tauri 插件和自定义命令

use tauri::Manager;
use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};
use std::fs;
use std::path::PathBuf;

mod file_commands;
mod ai_commands;

// ============================================================
// Electron → Tauri 数据迁移
// ============================================================

/// 旧的 Electron 数据目录：%APPDATA%\AmNote
fn old_electron_data_dir() -> Option<PathBuf> {
    std::env::var("APPDATA").ok().map(|d| PathBuf::from(d).join("AmNote"))
}

/// Tauri 数据目录：%APPDATA%\com.amnote.app
fn tauri_data_dir() -> Option<PathBuf> {
    std::env::var("APPDATA").ok().map(|d| PathBuf::from(d).join("com.amnote.app"))
}

/// 在应用启动前（SQL 插件加载前）从旧 Electron 目录迁移数据库和图片
///
/// 迁移策略：
/// - 数据库：当旧库比新库大 10 倍以上时强制覆盖（处理首次迁移场景）
/// - 图片：仅复制新目录中不存在的文件（增量迁移）
fn migrate_from_electron() {
    let new_dir = match tauri_data_dir() {
        Some(d) => d,
        None => return,
    };
    let old_dir = match old_electron_data_dir() {
        Some(d) if d.exists() => d,
        _ => return,
    };
    let _ = fs::create_dir_all(&new_dir);

    // 迁移数据库
    let new_db = new_dir.join("amnote.db");
    let old_db = old_dir.join("amnote.db");
    let old_size = old_db.metadata().map(|m| m.len()).unwrap_or(0);
    let new_size = new_db.metadata().map(|m| m.len()).unwrap_or(0);
    if old_size > 0 && (new_size == 0 || old_size > new_size * 10) {
        // 先删除目标库及 WAL/SHM 文件，确保干净覆盖
        let _ = fs::remove_file(new_dir.join("amnote.db-wal"));
        let _ = fs::remove_file(new_dir.join("amnote.db-shm"));
        let _ = fs::remove_file(&new_db);
        match fs::copy(&old_db, &new_db) {
            Ok(_) => println!("[Migrate] 数据库已迁移 ({} -> {} bytes)", old_size, new_size),
            Err(e) => eprintln!("[Migrate] 数据库迁移失败: {}", e),
        }
    }

    // 迁移图片目录 amnote-data/files
    let new_files = new_dir.join("amnote-data").join("files");
    let old_files = old_dir.join("amnote-data").join("files");
    if old_files.exists() {
        let _ = fs::create_dir_all(&new_files);
        if let Ok(entries) = fs::read_dir(&old_files) {
            for entry in entries.flatten() {
                let src = entry.path();
                if src.is_file() {
                    let filename = entry.file_name();
                    let dst = new_files.join(&filename);
                    if !dst.exists() {
                        match fs::copy(&src, &dst) {
                            Ok(_) => println!("[Migrate] 图片已迁移: {:?}", filename),
                            Err(e) => eprintln!("[Migrate] 图片迁移失败 {:?}: {}", filename, e),
                        }
                    }
                }
            }
        }
    }
}

// ============================================================
// 应用入口
// ============================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 在 SQL 插件加载前，先从旧 Electron 目录迁移数据
    migrate_from_electron();

    // 数据库迁移：与 AmNote Electron 版本完全对齐的表结构
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_initial_tables",
            sql: "CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                parent_id INTEGER,
                name VARCHAR(100) NOT NULL,
                sort_order INTEGER DEFAULT 0,
                is_favorite INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now','localtime'))
            );
            CREATE TABLE IF NOT EXISTS tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR(50) NOT NULL UNIQUE,
                color VARCHAR(20) DEFAULT '#409EFF'
            );
            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title VARCHAR(255) NOT NULL DEFAULT '',
                content TEXT DEFAULT '',
                content_type VARCHAR(20) DEFAULT 'markdown',
                category_id INTEGER,
                is_favorite INTEGER DEFAULT 0,
                is_pinned INTEGER DEFAULT 0,
                is_deleted INTEGER DEFAULT 0,
                sort_weight INTEGER DEFAULT 999,
                created_at TEXT DEFAULT (datetime('now','localtime')),
                updated_at TEXT DEFAULT (datetime('now','localtime'))
            );
            CREATE TABLE IF NOT EXISTS settings (
                key VARCHAR(100) PRIMARY KEY,
                value TEXT
            );
            CREATE TABLE IF NOT EXISTS note_tags (
                note_id INTEGER NOT NULL,
                tag_id INTEGER NOT NULL,
                PRIMARY KEY (note_id, tag_id)
            );
            CREATE TABLE IF NOT EXISTS note_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                note_id INTEGER NOT NULL,
                title VARCHAR(255),
                content TEXT,
                content_type VARCHAR(20),
                version INTEGER DEFAULT 1,
                created_at TEXT DEFAULT (datetime('now','localtime'))
            );
            CREATE TABLE IF NOT EXISTS search_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                keyword VARCHAR(255) NOT NULL,
                searched_at TEXT DEFAULT (datetime('now','localtime'))
            );
            CREATE TABLE IF NOT EXISTS external_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                original_path TEXT NOT NULL,
                filename TEXT NOT NULL,
                size INTEGER,
                imported_at TEXT DEFAULT (datetime('now','localtime')),
                category_id INTEGER,
                note_id INTEGER,
                FOREIGN KEY (category_id) REFERENCES categories(id),
                FOREIGN KEY (note_id) REFERENCES notes(id)
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "seed_initial_data",
            sql: "INSERT INTO categories (name, sort_order) SELECT '工作', 1 WHERE NOT EXISTS (SELECT 1 FROM categories);
            INSERT INTO categories (name, sort_order) SELECT '学习', 2 WHERE NOT EXISTS (SELECT 1 FROM categories LIMIT 1);
            INSERT INTO categories (name, sort_order) SELECT '生活', 3 WHERE NOT EXISTS (SELECT 1 FROM categories LIMIT 1);
            INSERT INTO tags (name, color) SELECT 'Java', '#f44336' WHERE NOT EXISTS (SELECT 1 FROM tags);
            INSERT INTO tags (name, color) SELECT 'Vue', '#4caf50' WHERE NOT EXISTS (SELECT 1 FROM tags LIMIT 1);
            INSERT INTO tags (name, color) SELECT 'AI', '#2196f3' WHERE NOT EXISTS (SELECT 1 FROM tags LIMIT 1);
            INSERT INTO tags (name, color) SELECT '工作', '#ff9800' WHERE NOT EXISTS (SELECT 1 FROM tags LIMIT 1);",
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(
            SqlBuilder::default()
                .add_migrations("sqlite:amnote.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        // 自定义协议 amnote：为 Markdown 渲染中的本地图片提供数据
        //
        // URL 形式（前端 markdown.ts 按平台生成）：
        // - macOS/Linux: amnote://files/xxx 、amnote://local/<绝对路径>
        // - Windows:     http://amnote.localhost/files/xxx 、http://amnote.localhost/local/<绝对路径>
        //   （WebView2 不支持注册自定义 scheme，Tauri 在 Windows 上映射为虚拟主机）
        .register_uri_scheme_protocol("amnote", |ctx, request| {
            let not_found = || {
                tauri::http::Response::builder()
                    .status(404)
                    .body(Vec::new())
                    .unwrap()
            };

            // 结构化解析 URI，不依赖 host 字符串精确匹配，兼容两种形式：
            // - Windows WebView2 实际发送: amnote://localhost/files/xxx → host = localhost，path = /files/xxx
            // - macOS/Linux 原生 scheme: amnote://files/xxx → host = files，path = /xxx
            let uri = request.uri();
            eprintln!("[amnote] request uri: {}", uri);
            let raw = if uri.scheme_str() == Some("amnote") {
                format!("{}{}", uri.host().unwrap_or_default(), uri.path())
            } else {
                uri.path().trim_start_matches('/').to_string()
            };
            // 剥离 WebView2 映射产生的 localhost/ 前缀
            let raw = raw.strip_prefix("localhost/").unwrap_or(&raw);

            // percent-decode（中文路径在 URI 中是编码形式）
            let decoded = percent_encoding::percent_decode_str(raw)
                .decode_utf8_lossy()
                .to_string();

            // 拒绝目录穿越
            if decoded.contains("..") {
                return not_found();
            }

            let file_path = if let Some(rest) = decoded.strip_prefix("files/") {
                // 应用附件：app_data_dir/amnote-data/files/xxx
                let dir = match ctx.app_handle().path().app_data_dir() {
                    Ok(d) => d,
                    Err(_) => return not_found(),
                };
                dir.join("amnote-data").join("files").join(rest)
            } else if let Some(rest) = decoded.strip_prefix("local/") {
                // 外部绝对路径（非盘符开头视为 Unix 路径，补回根 /）
                if rest.contains(':') {
                    std::path::PathBuf::from(rest)
                } else {
                    std::path::PathBuf::from(format!("/{}", rest))
                }
            } else {
                return not_found();
            };

            match std::fs::read(&file_path) {
                Ok(data) => tauri::http::Response::builder()
                    .header("Content-Type", file_commands::guess_mime(&file_path.to_string_lossy()))
                    .header("Access-Control-Allow-Origin", "*")
                    .body(data)
                    .unwrap(),
                Err(e) => {
                    eprintln!(
                        "[amnote] read failed: {} ({})",
                        file_path.display(),
                        e
                    );
                    not_found()
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            // 本地文件操作
            file_commands::save_local_file,
            file_commands::scan_referenced_files,
            file_commands::preview_unused_files,
            file_commands::get_all_files,
            file_commands::get_file_path,
            file_commands::read_file_as_base64,
            file_commands::delete_file,
            file_commands::clean_unused_files,
            file_commands::get_db_path,
            // 外部文件操作
            file_commands::set_current_viewing_path,
            file_commands::get_current_viewing_path,
            file_commands::scan_external_dirs,
            file_commands::open_external_file,
            file_commands::save_external_file,
            file_commands::create_external_dir,
            file_commands::create_external_file,
            file_commands::delete_external_dir,
            file_commands::delete_external_file,
            file_commands::save_external_text,
            file_commands::rename_external_path,
            file_commands::move_external_path,
            // 导入
            file_commands::read_text_file,
            file_commands::copy_file_to_attachments,
            // AI 助手
            ai_commands::ai_chat_stream,
            ai_commands::ai_abort_stream,
            ai_commands::ai_test_connection,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
