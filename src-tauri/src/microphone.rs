use std::{
    process::Stdio,
    sync::atomic::{AtomicU32, AtomicU64, Ordering},
    time::Duration,
};
use tauri::Manager;
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, ChildStdout, Command},
    sync::Mutex,
};
struct Recording {
    child: Child,
    input: ChildStdin,
    output: BufReader<ChildStdout>,
    file: tempfile::NamedTempFile,
    id: u64,
}
#[derive(Default)]
pub struct MicrophoneState {
    recording: Mutex<Option<Recording>>,
    latest: AtomicU64,
    pid: AtomicU32,
}
impl MicrophoneState {
    pub fn shutdown(&self) {
        let pid = self.pid.swap(0, Ordering::SeqCst);
        if pid != 0 {
            let _ = std::process::Command::new("/bin/kill")
                .args(["-TERM", &pid.to_string()])
                .status();
        }
    }
}
#[tauri::command]
pub fn microphone_cancel(state: tauri::State<'_, MicrophoneState>, request_id: u64) {
    if request_id >= state.latest.fetch_max(request_id, Ordering::SeqCst) {
        state.shutdown();
        if let Ok(mut recording) = state.recording.try_lock() {
            *recording = None;
        }
    }
}
#[tauri::command]
pub async fn microphone_start(
    app: tauri::AppHandle,
    state: tauri::State<'_, MicrophoneState>,
    request_id: u64,
) -> Result<(), String> {
    if request_id <= state.latest.fetch_max(request_id, Ordering::SeqCst) {
        return Err("Recording cancelled".into());
    }
    let mut lock = state.recording.lock().await;
    if state.latest.load(Ordering::SeqCst) != request_id {
        return Err("Recording cancelled".into());
    }
    state.shutdown();
    *lock = None;
    let file = tempfile::Builder::new()
        .prefix("mommycodex-mic-")
        .suffix(".wav")
        .tempfile()
        .map_err(|e| e.to_string())?;
    let program = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("native/microphone");
    let program = if program.exists() {
        program
    } else {
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/native/microphone")
    };
    let mut child = Command::new(program)
        .arg(file.path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("Could not start native microphone: {e}"))?;
    let child_pid = child.id().unwrap_or(0);
    state.pid.store(child_pid, Ordering::SeqCst);
    struct Guard<'a> {
        pid: &'a AtomicU32,
        value: u32,
        armed: bool,
    }
    impl Drop for Guard<'_> {
        fn drop(&mut self) {
            if self.armed {
                let _ =
                    self.pid
                        .compare_exchange(self.value, 0, Ordering::SeqCst, Ordering::SeqCst);
            }
        }
    }
    let mut guard = Guard {
        pid: &state.pid,
        value: child_pid,
        armed: true,
    };
    if state.latest.load(Ordering::SeqCst) != request_id {
        return Err("Recording cancelled".into());
    }
    let input = child.stdin.take().ok_or("Microphone input unavailable")?;
    let mut output = BufReader::new(child.stdout.take().ok_or("Microphone output unavailable")?);
    let mut line = String::new();
    tokio::time::timeout(Duration::from_secs(45), output.read_line(&mut line))
        .await
        .map_err(|_| {
            "Microphone permission is still pending. Allow access in macOS, then try again."
        })?
        .map_err(|e| e.to_string())?;
    if state.latest.load(Ordering::SeqCst) != request_id {
        return Err("Recording cancelled".into());
    }
    let event: serde_json::Value =
        serde_json::from_str(&line).map_err(|_| "Native microphone stopped before recording.")?;
    if event["event"] != "recording" {
        return Err(event["error"]
            .as_str()
            .unwrap_or("Microphone could not start")
            .into());
    }
    *lock = Some(Recording {
        child,
        input,
        output,
        file,
        id: request_id,
    });
    guard.armed = false;
    Ok(())
}
#[tauri::command]
pub async fn microphone_finish(
    state: tauri::State<'_, MicrophoneState>,
    request_id: u64,
) -> Result<Vec<u8>, String> {
    let mut lock = state.recording.lock().await;
    if lock.as_ref().map(|r| r.id) != Some(request_id) {
        return Err("No matching microphone recording is active".into());
    }
    let mut recording = lock.take().unwrap();
    if recording.id != request_id || state.latest.load(Ordering::SeqCst) != request_id {
        return Err("Recording cancelled".into());
    }
    let _ = recording.input.write_all(b"stop\n").await;
    let _ = recording.input.flush().await;
    let mut line = String::new();
    let _ = tokio::time::timeout(
        Duration::from_secs(3),
        recording.output.read_line(&mut line),
    )
    .await;
    let _ = tokio::time::timeout(Duration::from_secs(2), recording.child.wait()).await;
    state.pid.store(0, Ordering::SeqCst);
    if state.latest.load(Ordering::SeqCst) != request_id {
        return Err("Recording cancelled".into());
    }
    let audio = std::fs::read(recording.file.path()).map_err(|e| e.to_string())?;
    if audio.len() > 12 * 1024 * 1024 {
        return Err("Recording exceeded 12 MB".into());
    }
    Ok(audio)
}
