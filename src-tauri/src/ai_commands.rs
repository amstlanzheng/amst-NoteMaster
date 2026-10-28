//! AmNote AI 助手命令模块
//!
//! 由 Rust 端转发 OpenAI 兼容的 `/chat/completions` 请求，避免 WebView 的 CORS 限制。
//! 流式响应通过 Tauri 事件回传前端：
//! - `ai-chunk`     : `{ requestId, delta }`        正文增量
//! - `ai-reasoning` : `{ requestId, delta }`        思维链增量（如 deepseek-reasoner）
//! - `ai-done`      : `{ requestId }`               正常结束
//! - `ai-error`     : `{ requestId, message }`      发生错误

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Window};

/// 单条对话消息
#[derive(Deserialize, Serialize, Clone)]
pub struct AiMessage {
    pub role: String,
    pub content: String,
}

/// 聊天请求参数（前端以 camelCase 传入）
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatRequest {
    pub request_id: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub messages: Vec<AiMessage>,
    pub temperature: Option<f32>,
    pub stream: Option<bool>,
}

/// 进行中的请求取消标记表
fn abort_registry() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    static REG: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();
    REG.get_or_init(|| Mutex::new(HashMap::new()))
}

/// 规范化 chat completions 接口地址
///
/// - 已以 `/chat/completions` 结尾：原样使用
/// - 以 `/v1` 结尾：追加 `/chat/completions`
/// - 其他：追加 `/v1/chat/completions`（兼容 DeepSeek / Moonshot / DashScope 等）
fn build_endpoint(base_url: &str) -> String {
    let base = base_url.trim().trim_end_matches('/');
    if base.ends_with("/chat/completions") {
        base.to_string()
    } else if base.ends_with("/v1") {
        format!("{}/chat/completions", base)
    } else {
        format!("{}/v1/chat/completions", base)
    }
}

/// 流式聊天：发起请求并将增量通过事件推送给前端（命令本身 await 到流结束）
#[tauri::command]
pub async fn ai_chat_stream(window: Window, request: AiChatRequest) -> Result<(), String> {
    let flag = Arc::new(AtomicBool::new(false));
    if let Ok(mut reg) = abort_registry().lock() {
        reg.insert(request.request_id.clone(), flag.clone());
    }

    let result = run_chat(&window, &request, &flag).await;

    if let Ok(mut reg) = abort_registry().lock() {
        reg.remove(&request.request_id);
    }
    result
}

/// 取消进行中的流式请求
#[tauri::command]
pub fn ai_abort_stream(request_id: String) {
    if let Ok(reg) = abort_registry().lock() {
        if let Some(flag) = reg.get(&request_id) {
            flag.store(true, Ordering::SeqCst);
        }
    }
}

/// 测试模型连通性（非流式，返回模型回复的前若干字符）
#[tauri::command]
pub async fn ai_test_connection(
    base_url: String,
    api_key: String,
    model: String,
) -> Result<String, String> {
    let endpoint = build_endpoint(&base_url);
    let body = serde_json::json!({
        "model": model,
        "messages": [{ "role": "user", "content": "ping" }],
        "stream": false,
        "max_tokens": 16,
    });

    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .post(&endpoint)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("接口返回错误 ({}): {}", status.as_u16(), text));
    }
    Ok(text)
}

/// 实际执行请求与流式解析
async fn run_chat(
    window: &Window,
    request: &AiChatRequest,
    abort: &Arc<AtomicBool>,
) -> Result<(), String> {
    let endpoint = build_endpoint(&request.base_url);
    let use_stream = request.stream.unwrap_or(true);

    let mut body = serde_json::json!({
        "model": request.model,
        "messages": request.messages,
        "stream": use_stream,
    });
    if let Some(t) = request.temperature {
        body["temperature"] = serde_json::json!(t);
    }

    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .post(&endpoint)
        .header("Authorization", format!("Bearer {}", request.api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await;

    let resp = match resp {
        Ok(r) => r,
        Err(e) => {
            let msg = format!("请求失败: {}", e);
            let _ = window.emit(
                "ai-error",
                serde_json::json!({ "requestId": request.request_id, "message": msg }),
            );
            return Err(msg);
        }
    };

    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        let msg = format!("接口返回错误 ({}): {}", status.as_u16(), text);
        let _ = window.emit(
            "ai-error",
            serde_json::json!({ "requestId": request.request_id, "message": msg }),
        );
        return Err(msg);
    }

    // 非流式：一次性解析完整回复
    if !use_stream {
        let text = resp.text().await.unwrap_or_default();
        let content = serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .and_then(|v| v["choices"][0]["message"]["content"].as_str().map(|s| s.to_string()))
            .unwrap_or_default();
        let _ = window.emit(
            "ai-chunk",
            serde_json::json!({ "requestId": request.request_id, "delta": content }),
        );
        let _ = window.emit("ai-done", serde_json::json!({ "requestId": request.request_id }));
        return Ok(());
    }

    // 流式：按 SSE 逐行解析
    let mut stream = resp.bytes_stream();
    let mut buf = String::new();

    while let Some(chunk) = stream.next().await {
        if abort.load(Ordering::SeqCst) {
            break;
        }
        let chunk = match chunk {
            Ok(c) => c,
            Err(e) => {
                let msg = format!("读取响应失败: {}", e);
                let _ = window.emit(
                    "ai-error",
                    serde_json::json!({ "requestId": request.request_id, "message": msg }),
                );
                return Err(msg);
            }
        };
        buf.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(pos) = buf.find('\n') {
            let line = buf[..pos].trim_end_matches('\r').to_string();
            buf.drain(..pos + 1);

            if line.is_empty() || !line.starts_with("data:") {
                continue;
            }
            let data = line[5..].trim();
            if data.is_empty() || data == "[DONE]" {
                continue;
            }
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(data) {
                let delta = v["choices"][0]["delta"]["content"].as_str().unwrap_or("");
                if !delta.is_empty() {
                    let _ = window.emit(
                        "ai-chunk",
                        serde_json::json!({ "requestId": request.request_id, "delta": delta }),
                    );
                }
                let reasoning = v["choices"][0]["delta"]["reasoning_content"].as_str().unwrap_or("");
                if !reasoning.is_empty() {
                    let _ = window.emit(
                        "ai-reasoning",
                        serde_json::json!({ "requestId": request.request_id, "delta": reasoning }),
                    );
                }
            }
        }
    }

    let _ = window.emit("ai-done", serde_json::json!({ "requestId": request.request_id }));
    Ok(())
}
