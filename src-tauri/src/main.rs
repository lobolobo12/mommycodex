// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // GUI apps launched from Finder / LaunchServices get a minimal PATH that
    // lacks /opt/homebrew/bin. Fix it before anything spawns a child so the
    // codex binary, its hooks and MCP servers all see the login-shell PATH.
    #[cfg(windows)]
    mommycodex_lib::windows::run_helper_if_requested();
    #[cfg(target_os = "macos")]
    if let Err(err) = fix_path_env::fix() {
        eprintln!("mommycodex: could not fix PATH from login shell: {err}");
    }
    mommycodex_lib::run()
}
