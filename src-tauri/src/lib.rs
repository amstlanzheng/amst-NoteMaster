//! AmNote Tauri 应用入口
//!
//! 负责：
//! 1. 从旧 Electron 数据目录迁移数据库和图片
//! 2. 数据库表结构迁移
//! 3. 注册 Tauri 插件和自定义命令

use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};
use std::fs;
use std::path::PathBuf;

mod file_commands;

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
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
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
            // 导入（占位）
            file_commands::import_file,
            file_commands::import_folder,
            file_commands::resolve_file_conflict,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
