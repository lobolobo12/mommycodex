use serde::Serialize;
use serde_json::Value;
use tauri::ipc::Channel;
use tauri::State;

use crate::codex_client::{CodexClient, RpcError, StartInfo, StartOptions};
use crate::LaunchState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchInfo {
    pub initial_cwd: Option<String>,
    pub home: Option<String>,
    pub app_version: String,
}

#[tauri::command]
pub fn get_launch_info(state: State<'_, LaunchState>) -> LaunchInfo {
    LaunchInfo {
        initial_cwd: state.initial_cwd.as_ref().map(|p| p.display().to_string()),
        home: std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(|h| h.to_string_lossy().to_string()),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

#[tauri::command]
pub fn resolve_codex_binary(override_path: Option<String>) -> Result<String, String> {
    crate::binary::resolve_codex_binary(override_path.as_deref())
        .map(|p| p.display().to_string())
}

#[tauri::command]
pub async fn codex_start(
    state: State<'_, CodexClient>,
    opts: StartOptions,
    on_message: Channel<Value>,
) -> Result<StartInfo, String> {
    state.start(opts, on_message).await
}

#[tauri::command]
pub async fn codex_request(
    state: State<'_, CodexClient>,
    method: String,
    params: Value,
) -> Result<Value, RpcError> {
    state.request(&method, params).await
}

#[tauri::command]
pub async fn codex_notify(
    state: State<'_, CodexClient>,
    method: String,
    params: Value,
) -> Result<(), RpcError> {
    state.notify(&method, params).await
}

#[tauri::command]
pub async fn codex_respond(
    state: State<'_, CodexClient>,
    id: Value,
    result: Option<Value>,
    error: Option<Value>,
) -> Result<(), RpcError> {
    state.respond(id, result, error).await
}

#[tauri::command]
pub async fn codex_stop(state: State<'_, CodexClient>) -> Result<(), String> {
    state.stop().await;
    Ok(())
}

#[tauri::command]
pub fn codex_stderr_tail(state: State<'_, CodexClient>) -> Vec<String> {
    state.stderr_tail()
}
