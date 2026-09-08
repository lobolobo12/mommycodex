//! Thin transport bridge around a `codex app-server` child process.
//!
//! This module knows *nothing* about the Codex protocol beyond JSON-RPC
//! framing. Every inbound line is classified as one of:
//!
//! * a **response** to a request we sent (`id` present, no `method`) which
//!   resolves the matching pending oneshot,
//! * a **server request** (`method` + `id`) which is forwarded to the webview
//!   and must be answered with [`CodexClient::respond`],
//! * a **notification** (`method` only) which is forwarded to the webview.
//!
//! Everything forwarded to the webview travels through a single ordered
//! [`Channel`], so the UI observes events in the exact order the server
//! emitted them.

use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicI64, AtomicU64, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::ipc::Channel;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command};
use tokio::sync::{mpsc, oneshot, watch, Mutex};

use crate::binary;

/// How long a single request may stay unanswered before we give up. This is a
/// dead-pipe guard, not a latency budget: `thread/start` can legitimately take
/// a while when many plugins and MCP servers boot.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(300);
/// Graceful shutdown budget after closing stdin.
const GRACEFUL_EXIT: Duration = Duration::from_secs(2);
/// Budget after sending SIGKILL.
const KILL_EXIT: Duration = Duration::from_secs(3);
const STDERR_TAIL_LINES: usize = 200;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcError {
    pub code: i64,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

impl RpcError {
    pub fn new(code: i64, message: impl Into<String>) -> Self {
        Self { code, message: message.into(), data: None }
    }
    pub fn not_running() -> Self {
        Self::new(-32000, "codex app-server is not running")
    }
    fn from_value(v: &Value) -> Self {
        Self {
            code: v.get("code").and_then(Value::as_i64).unwrap_or(-32603),
            message: v
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("unknown JSON-RPC error")
                .to_string(),
            data: v.get("data").cloned(),
        }
    }
}

impl std::fmt::Display for RpcError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

#[derive(Debug, Default, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartOptions {
    /// Explicit path to the codex binary (from app settings).
    #[serde(default)]
    pub binary_override: Option<String>,
    /// `key=value` pairs passed as `-c key=value` to the app-server.
    #[serde(default)]
    pub config_overrides: Vec<String>,
    /// Any extra raw CLI arguments.
    #[serde(default)]
    pub extra_args: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartInfo {
    pub binary: String,
    pub pid: Option<u32>,
    pub generation: u64,
    pub already_running: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LineKind {
    Request,
    Notification,
    Response,
    Unknown,
}

/// Classify a parsed JSON-RPC message by the presence of `method` and `id`.
pub fn classify(v: &Value) -> LineKind {
    let has_method = v.get("method").map(|m| m.is_string()).unwrap_or(false);
    let has_id = v.get("id").map(|id| !id.is_null()).unwrap_or(false);
    match (has_method, has_id) {
        (true, true) => LineKind::Request,
        (true, false) => LineKind::Notification,
        (false, true) => LineKind::Response,
        (false, false) => LineKind::Unknown,
    }
}

type Pending = HashMap<i64, oneshot::Sender<Result<Value, RpcError>>>;

struct Running {
    stdin_tx: mpsc::Sender<String>,
    kill_tx: Option<oneshot::Sender<()>>,
    exited_rx: watch::Receiver<bool>,
    pid: Option<u32>,
    binary: PathBuf,
    generation: u64,
}

struct Inner {
    running: Mutex<Option<Running>>,
    sink: StdMutex<Option<Channel<Value>>>,
    next_id: AtomicI64,
    pending: StdMutex<Pending>,
    generation: AtomicU64,
    stderr_tail: StdMutex<VecDeque<String>>,
}

impl Inner {
    fn emit(&self, v: Value) {
        let sink = self.sink.lock().unwrap().clone();
        if let Some(ch) = sink {
            let _ = ch.send(v);
        }
    }

    fn push_stderr(&self, line: String) {
        let mut tail = self.stderr_tail.lock().unwrap();
        if tail.len() >= STDERR_TAIL_LINES {
            tail.pop_front();
        }
        tail.push_back(line);
    }

    fn fail_all_pending(&self, err: RpcError) {
        let drained: Vec<_> = self.pending.lock().unwrap().drain().collect();
        for (_, tx) in drained {
            let _ = tx.send(Err(err.clone()));
        }
    }

    fn handle_line(&self, line: String) {
        let v: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => {
                self.emit(json!({ "type": "stdout", "line": line }));
                return;
            }
        };
        match classify(&v) {
            LineKind::Response => {
                if let Some(id) = v.get("id").and_then(Value::as_i64) {
                    let tx = self.pending.lock().unwrap().remove(&id);
                    if let Some(tx) = tx {
                        let res = match v.get("error") {
                            Some(err) if !err.is_null() => Err(RpcError::from_value(err)),
                            _ => Ok(v.get("result").cloned().unwrap_or(Value::Null)),
                        };
                        let _ = tx.send(res);
                        return;
                    }
                }
                self.emit(json!({ "type": "orphanResponse", "message": v }));
            }
            LineKind::Request => self.emit(json!({
                "type": "request",
                "id": v.get("id").cloned().unwrap_or(Value::Null),
                "method": v.get("method").cloned().unwrap_or(Value::Null),
                "params": v.get("params").cloned().unwrap_or(Value::Null),
            })),
            LineKind::Notification => self.emit(json!({
                "type": "notification",
                "method": v.get("method").cloned().unwrap_or(Value::Null),
                "params": v.get("params").cloned().unwrap_or(Value::Null),
            })),
            LineKind::Unknown => self.emit(json!({ "type": "stdout", "line": line })),
        }
    }
}

pub struct CodexClient {
    inner: Arc<Inner>,
}

impl Default for CodexClient {
    fn default() -> Self {
        Self::new()
    }
}

impl CodexClient {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Inner {
                running: Mutex::new(None),
                sink: StdMutex::new(None),
                next_id: AtomicI64::new(1),
                pending: StdMutex::new(HashMap::new()),
                generation: AtomicU64::new(0),
                stderr_tail: StdMutex::new(VecDeque::new()),
            }),
        }
    }

    /// Spawn the app-server (or, if it is already running, just attach the
    /// new sink — this is what happens on a webview reload during dev).
    pub async fn start(&self, opts: StartOptions, sink: Channel<Value>) -> Result<StartInfo, String> {
        let mut running = self.inner.running.lock().await;
        *self.inner.sink.lock().unwrap() = Some(sink);

        if let Some(r) = running.as_ref() {
            if !*r.exited_rx.borrow() {
                return Ok(StartInfo {
                    binary: r.binary.display().to_string(),
                    pid: r.pid,
                    generation: r.generation,
                    already_running: true,
                });
            }
        }
        *running = None;

        let binary = binary::resolve_codex_binary(opts.binary_override.as_deref())?;
        let generation = self.inner.generation.fetch_add(1, Ordering::SeqCst) + 1;

        let mut cmd = Command::new(&binary);
        cmd.arg("app-server").arg("--listen").arg("stdio://");
        for o in &opts.config_overrides {
            cmd.arg("-c").arg(o);
        }
        for a in &opts.extra_args {
            cmd.arg(a);
        }
        cmd.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("failed to spawn {}: {e}", binary.display()))?;
        let stdin = child.stdin.take().ok_or("child stdin not captured")?;
        let stdout = child.stdout.take().ok_or("child stdout not captured")?;
        let stderr = child.stderr.take().ok_or("child stderr not captured")?;
        let pid = child.id();

        let (stdin_tx, stdin_rx) = mpsc::channel::<String>(512);
        let (kill_tx, kill_rx) = oneshot::channel::<()>();
        let (exited_tx, exited_rx) = watch::channel(false);
        self.inner.stderr_tail.lock().unwrap().clear();

        tauri::async_runtime::spawn(writer_task(stdin, stdin_rx));
        tauri::async_runtime::spawn(reader_task(self.inner.clone(), stdout));
        tauri::async_runtime::spawn(stderr_task(self.inner.clone(), stderr));
        tauri::async_runtime::spawn(waiter_task(
            self.inner.clone(),
            child,
            kill_rx,
            exited_tx,
            generation,
        ));

        *running = Some(Running {
            stdin_tx,
            kill_tx: Some(kill_tx),
            exited_rx,
            pid,
            binary: binary.clone(),
            generation,
        });

        Ok(StartInfo {
            binary: binary.display().to_string(),
            pid,
            generation,
            already_running: false,
        })
    }

    async fn stdin_sender(&self) -> Result<mpsc::Sender<String>, RpcError> {
        let running = self.inner.running.lock().await;
        running
            .as_ref()
            .filter(|r| !*r.exited_rx.borrow())
            .map(|r| r.stdin_tx.clone())
            .ok_or_else(RpcError::not_running)
    }

    async fn send_line(&self, line: String) -> Result<(), RpcError> {
        let tx = self.stdin_sender().await?;
        tx.send(line).await.map_err(|_| RpcError::not_running())
    }

    /// Send a JSON-RPC request and await its response.
    pub async fn request(&self, method: &str, params: Value) -> Result<Value, RpcError> {
        let tx = self.stdin_sender().await?;
        let id = self.inner.next_id.fetch_add(1, Ordering::SeqCst);
        let (res_tx, res_rx) = oneshot::channel();
        self.inner.pending.lock().unwrap().insert(id, res_tx);

        let line = json!({ "id": id, "method": method, "params": params }).to_string();
        if tx.send(line).await.is_err() {
            self.inner.pending.lock().unwrap().remove(&id);
            return Err(RpcError::not_running());
        }

        match tokio::time::timeout(REQUEST_TIMEOUT, res_rx).await {
            Ok(Ok(res)) => res,
            Ok(Err(_)) => Err(RpcError::new(-32000, "request dropped: codex app-server went away")),
            Err(_) => {
                self.inner.pending.lock().unwrap().remove(&id);
                Err(RpcError::new(-32001, format!("request `{method}` timed out")))
            }
        }
    }

    /// Send a JSON-RPC notification (no response expected).
    pub async fn notify(&self, method: &str, params: Value) -> Result<(), RpcError> {
        self.send_line(json!({ "method": method, "params": params }).to_string())
            .await
    }

    /// Answer a server-initiated request. `id` is echoed verbatim.
    pub async fn respond(
        &self,
        id: Value,
        result: Option<Value>,
        error: Option<Value>,
    ) -> Result<(), RpcError> {
        let msg = match error {
            Some(err) => json!({ "id": id, "error": err }),
            None => json!({ "id": id, "result": result.unwrap_or(Value::Null) }),
        };
        self.send_line(msg.to_string()).await
    }

    pub fn stderr_tail(&self) -> Vec<String> {
        self.inner.stderr_tail.lock().unwrap().iter().cloned().collect()
    }

    /// Close stdin (which makes the app-server exit cleanly), then escalate to
    /// SIGKILL if it lingers.
    pub async fn stop(&self) {
        let taken = self.inner.running.lock().await.take();
        let Some(mut r) = taken else { return };
        let Running { stdin_tx, kill_tx, exited_rx, .. } = &mut r;
        let mut exited = exited_rx.clone();
        // Dropping the last sender closes the writer task, which shuts stdin.
        let closed = mpsc::channel::<String>(1).0;
        let _ = std::mem::replace(stdin_tx, closed);

        if *exited.borrow() {
            return;
        }
        let wait_exit = |mut rx: watch::Receiver<bool>| async move {
            while !*rx.borrow() {
                if rx.changed().await.is_err() {
                    break;
                }
            }
        };
        if tokio::time::timeout(GRACEFUL_EXIT, wait_exit(exited.clone())).await.is_err() {
            if let Some(k) = kill_tx.take() {
                let _ = k.send(());
            }
            let _ = tokio::time::timeout(KILL_EXIT, wait_exit(exited.clone())).await;
        }
        let _ = exited.borrow_and_update();
    }

    /// Fast path for app exit: kill immediately, wait briefly.
    pub fn shutdown_blocking(&self) {
        let inner = self.inner.clone();
        tauri::async_runtime::block_on(async move {
            let taken = inner.running.lock().await.take();
            let Some(mut r) = taken else { return };
            if *r.exited_rx.borrow() {
                return;
            }
            if let Some(k) = r.kill_tx.take() {
                let _ = k.send(());
            }
            let mut rx = r.exited_rx.clone();
            let _ = tokio::time::timeout(Duration::from_secs(1), async move {
                while !*rx.borrow() {
                    if rx.changed().await.is_err() {
                        break;
                    }
                }
            })
            .await;
        });
    }
}

async fn writer_task(mut stdin: ChildStdin, mut rx: mpsc::Receiver<String>) {
    while let Some(line) = rx.recv().await {
        if stdin.write_all(line.as_bytes()).await.is_err() {
            break;
        }
        if stdin.write_all(b"\n").await.is_err() {
            break;
        }
        if stdin.flush().await.is_err() {
            break;
        }
    }
    let _ = stdin.shutdown().await;
}

async fn reader_task(inner: Arc<Inner>, stdout: ChildStdout) {
    let mut lines = BufReader::with_capacity(1 << 20, stdout).lines();
    loop {
        match lines.next_line().await {
            Ok(Some(line)) => {
                if line.trim().is_empty() {
                    continue;
                }
                inner.handle_line(line);
            }
            Ok(None) => break,
            Err(e) => {
                inner.emit(json!({ "type": "stderr", "line": format!("[reader] {e}") }));
                break;
            }
        }
    }
}

async fn stderr_task(inner: Arc<Inner>, stderr: ChildStderr) {
    let mut lines = BufReader::new(stderr).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        inner.push_stderr(line.clone());
        inner.emit(json!({ "type": "stderr", "line": line }));
    }
}

async fn waiter_task(
    inner: Arc<Inner>,
    mut child: Child,
    kill_rx: oneshot::Receiver<()>,
    exited_tx: watch::Sender<bool>,
    generation: u64,
) {
    let natural = tokio::select! {
        status = child.wait() => Some(status),
        _ = kill_rx => None,
    };
    let status = match natural {
        Some(s) => s,
        None => {
            let _ = child.start_kill();
            child.wait().await
        }
    };
    let code = status.ok().and_then(|s| s.code());
    let _ = exited_tx.send(true);
    inner.fail_all_pending(RpcError::new(-32000, "codex app-server exited"));
    let tail: Vec<String> = inner.stderr_tail.lock().unwrap().iter().cloned().collect();
    inner.emit(json!({
        "type": "exited",
        "generation": generation,
        "code": code,
        "stderrTail": tail,
    }));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_messages() {
        assert_eq!(classify(&json!({"id": 1, "method": "x", "params": {}})), LineKind::Request);
        assert_eq!(classify(&json!({"method": "x", "params": {}})), LineKind::Notification);
        assert_eq!(classify(&json!({"id": 1, "result": {}})), LineKind::Response);
        assert_eq!(classify(&json!({"id": "abc", "error": {"code": 1, "message": "m"}})), LineKind::Response);
        assert_eq!(classify(&json!({"id": null, "method": "x"})), LineKind::Notification);
        assert_eq!(classify(&json!({"foo": 1})), LineKind::Unknown);
    }

    #[test]
    fn rpc_error_from_value_defaults() {
        let e = RpcError::from_value(&json!({"message": "nope"}));
        assert_eq!(e.code, -32603);
        assert_eq!(e.message, "nope");
        let e = RpcError::from_value(&json!({"code": -32601, "message": "m", "data": {"x": 1}}));
        assert_eq!(e.code, -32601);
        assert_eq!(e.data, Some(json!({"x": 1})));
    }
}
