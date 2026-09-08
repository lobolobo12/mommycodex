pub mod binary;
pub mod codex_client;
mod commands;
mod speech;
mod workspace;
mod browser;
mod microphone;
mod github;

use std::path::PathBuf;

use codex_client::CodexClient;
use tauri::Manager;

/// Process-level launch parameters (argv / env), captured once at startup.
pub struct LaunchState {
    pub initial_cwd: Option<PathBuf>,
}

/// `mommycodex <dir>` (via the shell shim) passes the project directory as
/// argv[1]. Finder may pass `-psn_...`, and `tauri dev` passes nothing, so
/// `MOMMYCODEX_CWD` is the dev-loop escape hatch.
fn detect_initial_cwd() -> Option<PathBuf> {
    let from_argv = std::env::args_os()
        .nth(1)
        .map(PathBuf::from)
        .filter(|p| !p.to_string_lossy().starts_with('-'))
        .filter(|p| p.is_dir());
    let from_env = std::env::var_os("MOMMYCODEX_CWD")
        .map(PathBuf::from)
        .filter(|p| p.is_dir());
    from_argv
        .or(from_env)
        .and_then(|p| std::fs::canonicalize(&p).ok().or(Some(p)))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let initial_cwd = detect_initial_cwd();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(LaunchState { initial_cwd })
        .manage(CodexClient::new())
        .manage(speech::SpeechState::default())
        .manage(speech::TranscriptionState::default())
        .manage(browser::BrowserState::default())
        .manage(microphone::MicrophoneState::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_launch_info,
            commands::resolve_codex_binary,
            commands::codex_start,
            commands::codex_request,
            commands::codex_notify,
            commands::codex_respond,
            commands::codex_stop,
            commands::codex_stderr_tail,
            speech::speech_key_status,
            speech::speech_save_key,
            speech::speech_remove_key,
            speech::speech_speak,
            speech::speech_stop,
            speech::speech_transcribe,
            speech::speech_transcribe_stop,
            browser::browser_action,
            github::github_action,
            microphone::microphone_start,
            microphone::microphone_finish,
            microphone::microphone_cancel,
            workspace::project_memory_load,
            workspace::project_memory_save,
            workspace::checkpoint_start,
            workspace::checkpoint_finish,
            workspace::checkpoint_undo,
            workspace::checkpoint_list,
            workspace::checkpoint_review,
            workspace::checkpoint_files,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
                app.state::<microphone::MicrophoneState>().shutdown();
                app.state::<browser::BrowserState>().shutdown();
                app.state::<speech::SpeechState>().shutdown();
                app.state::<CodexClient>().shutdown_blocking();
            }
            _ => {}
        });
}
