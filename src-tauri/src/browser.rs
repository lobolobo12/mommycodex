use serde_json::{json, Value};
use std::{
    path::PathBuf,
    process::Stdio,
    sync::atomic::{AtomicU32, Ordering},
};
use tauri::Manager;
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, ChildStdout, Command},
    sync::Mutex,
};

struct Host {
    child: Child,
    input: ChildStdin,
    output: BufReader<ChildStdout>,
    next: u64,
    info: Value,
    _directory: tempfile::TempDir,
}
#[derive(Default)]
pub struct BrowserState {
    host: Mutex<Option<Host>>,
    pid: AtomicU32,
}
impl BrowserState {
    pub fn shutdown(&self) {
        let pid = self.pid.swap(0, Ordering::SeqCst);
        if pid != 0 {
            let _ = std::process::Command::new("/bin/kill")
                .args(["-TERM", &pid.to_string()])
                .status();
        }
    }
}
fn node_binary() -> Result<PathBuf, String> {
    for p in ["/opt/homebrew/bin/node", "/usr/local/bin/node"] {
        if std::path::Path::new(p).is_file() {
            return Ok(p.into());
        }
    }
    which::which("node")
        .map_err(|_| "Node.js is required for live preview. Install Node 20 or newer.".into())
}
async fn request(host: &mut Host, params: Value) -> Result<Value, String> {
    host.next += 1;
    let id = host.next;
    let mut line =
        serde_json::to_vec(&json!({"id":id,"params":params})).map_err(|e| e.to_string())?;
    line.push(b'\n');
    host.input
        .write_all(&line)
        .await
        .map_err(|e| format!("Preview disconnected: {e}"))?;
    host.input.flush().await.map_err(|e| e.to_string())?;
    let mut output = String::new();
    let size = host
        .output
        .read_line(&mut output)
        .await
        .map_err(|e| e.to_string())?;
    if size == 0 {
        return Err("Preview service stopped. Restart the preview.".into());
    }
    let response: Value = serde_json::from_str(&output).map_err(|e| e.to_string())?;
    if response["id"] != id {
        return Err("Preview response out of order. Restart the app.".into());
    }
    if let Some(error) = response["error"].as_str() {
        return Err(error.to_owned());
    }
    Ok(response["result"].clone())
}
#[tauri::command]
pub async fn browser_action(
    app: tauri::AppHandle,
    state: tauri::State<'_, BrowserState>,
    params: Value,
) -> Result<Value, String> {
    let mut lock = state.host.lock().await;
    if let Some(host) = lock.as_mut() {
        if host.child.try_wait().map_err(|e| e.to_string())?.is_some() {
            *lock = None;
        }
    }
    if lock.is_none() {
        let script = app
            .path()
            .resource_dir()
            .map_err(|e| e.to_string())?
            .join("browser/bridge.cjs");
        let script = if script.exists() {
            script
        } else {
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/browser/bridge.cjs")
        };
        let directory = tempfile::Builder::new()
            .prefix("mommycodex-browser-")
            .tempdir()
            .map_err(|e| e.to_string())?;
        let mut child = Command::new(node_binary()?)
            .arg(script)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(false)
            .spawn()
            .map_err(|e| e.to_string())?;
        state.pid.store(child.id().unwrap_or(0), Ordering::SeqCst);
        let input = child.stdin.take().ok_or("Preview input unavailable")?;
        let output = BufReader::new(child.stdout.take().ok_or("Preview output unavailable")?);
        let dir = directory.path().display().to_string();
        let mut host = Host {
            child,
            input,
            output,
            next: 0,
            info: Value::Null,
            _directory: directory,
        };
        host.info = request(&mut host, json!({"action":"init","directory":dir})).await?;
        *lock = Some(host);
    }
    let host = lock.as_mut().unwrap();
    if params["action"] == "info" {
        return Ok(host.info.clone());
    }
    request(host, params).await
}
