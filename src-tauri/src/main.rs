// 在 Windows 上始终隐藏控制台窗口（包括 dev 模式）
#![cfg_attr(windows, windows_subsystem = "windows")]

fn main() {
    amnote_tauri_lib::run()
}
