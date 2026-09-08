//! Locate the Codex CLI binary.
//!
//! `/opt/homebrew/bin/codex` is usually a symlink to the npm package's Node
//! launcher (`bin/codex.js`), which then execs the native binary. Spawning the
//! native binary directly avoids the extra `node` hop and makes `kill` hit the
//! real process.

use std::path::{Path, PathBuf};

/// Environment variable that overrides all other resolution.
pub const BIN_ENV: &str = "MOMMYCODEX_CODEX_BIN";

/// Relative path (from the `@openai/codex` package root) to the native binary
/// for the current platform.
fn native_relative_path() -> Option<&'static str> {
    if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        Some("node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex")
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        Some("node_modules/@openai/codex-darwin-x64/vendor/x86_64-apple-darwin/bin/codex")
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        Some("node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex")
    } else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
        Some("node_modules/@openai/codex-linux-arm64/vendor/aarch64-unknown-linux-musl/bin/codex")
    } else if cfg!(all(windows, target_arch = "x86_64")) {
        Some("node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe")
    } else if cfg!(all(windows, target_arch = "aarch64")) {
        Some("node_modules/@openai/codex-win32-arm64/vendor/aarch64-pc-windows-msvc/bin/codex.exe")
    } else {
        None
    }
}

/// Pure mapping: given the *resolved* path of the npm launcher
/// (`.../node_modules/@openai/codex/bin/codex.js`), return where the native
/// binary should live. Does not touch the filesystem.
pub fn native_for_launcher(resolved: &Path) -> Option<PathBuf> {
    let rel = native_relative_path()?;
    let mut cur = resolved.parent();
    while let Some(dir) = cur {
        let is_pkg_root = dir.file_name().map(|n| n == "codex").unwrap_or(false)
            && dir
                .parent()
                .and_then(|p| p.file_name())
                .map(|n| n == "@openai")
                .unwrap_or(false);
        if is_pkg_root {
            return Some(dir.join(rel));
        }
        cur = dir.parent();
    }
    None
}

fn is_executable_file(p: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::metadata(p)
            .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
    }
    #[cfg(not(unix))]
    {
        p.is_file()
    }
}

/// Prefer the native binary when `candidate` is (or links to) the npm launcher.
fn prefer_native(candidate: PathBuf) -> PathBuf {
    // npm on Windows installs a .cmd/.ps1 shim beside node_modules, not a symlink.
    let launcher = if cfg!(windows) && candidate.extension().is_some_and(|e| e == "cmd" || e == "ps1") {
        candidate.parent().unwrap_or(Path::new(".")).join("node_modules/@openai/codex/bin/codex.js")
    } else { candidate.clone() };
    let resolved = std::fs::canonicalize(&launcher).unwrap_or(launcher);
    let looks_like_launcher = resolved
        .to_string_lossy()
        .replace('\\', "/").contains("@openai/codex/")
        || resolved.extension().map(|e| e == "js").unwrap_or(false);
    if looks_like_launcher {
        if let Some(native) = native_for_launcher(&resolved) {
            if is_executable_file(&native) {
                return native;
            }
        }
    }
    candidate
}

fn home() -> Option<PathBuf> {
    std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(PathBuf::from)
}

/// Resolution order:
/// 1. explicit override from settings (if executable)
/// 2. `MOMMYCODEX_CODEX_BIN`
/// 3. `codex` on PATH (mapped to the native binary when it is the npm launcher)
/// 4. well-known install locations
pub fn resolve_codex_binary(override_path: Option<&str>) -> Result<PathBuf, String> {
    if let Some(o) = override_path.map(str::trim).filter(|s| !s.is_empty()) {
        let p = PathBuf::from(o);
        if is_executable_file(&p) {
            return Ok(prefer_native(p));
        }
        return Err(format!("configured codex binary is not executable: {o}"));
    }

    if let Some(env) = std::env::var_os(BIN_ENV) {
        let p = PathBuf::from(env);
        if is_executable_file(&p) {
            return Ok(prefer_native(p));
        }
        return Err(format!(
            "{BIN_ENV} points to a non-executable path: {}",
            p.display()
        ));
    }

    if let Ok(found) = which::which("codex") {
        return Ok(prefer_native(found));
    }

    let mut fallbacks: Vec<PathBuf> = vec![];
    if let Some(appdata) = std::env::var_os("APPDATA") {
        fallbacks.push(PathBuf::from(appdata).join("npm/codex.cmd"));
    }
    if let Some(rel) = native_relative_path() {
        fallbacks.push(PathBuf::from("/opt/homebrew/lib/node_modules/@openai/codex").join(rel));
        fallbacks.push(PathBuf::from("/usr/local/lib/node_modules/@openai/codex").join(rel));
    }
    fallbacks.push(PathBuf::from("/opt/homebrew/bin/codex"));
    fallbacks.push(PathBuf::from("/usr/local/bin/codex"));
    if let Some(h) = home() {
        fallbacks.push(h.join(".local/bin/codex"));
        fallbacks.push(h.join(".npm-global/bin/codex"));
    }
    for p in fallbacks {
        if is_executable_file(&p) {
            return Ok(prefer_native(p));
        }
    }

    Err("could not find the `codex` CLI. Install it with `npm i -g @openai/codex` or set the binary path in MommyCodex settings.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    fn maps_npm_launcher_to_native_binary() {
        let launcher = Path::new("/opt/homebrew/lib/node_modules/@openai/codex/bin/codex.js");
        let native = native_for_launcher(launcher).expect("mapping");
        assert_eq!(
            native,
            PathBuf::from("/opt/homebrew/lib/node_modules/@openai/codex/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex")
        );
    }

    #[cfg(windows)]
    #[test]
    fn npm_cmd_shim_resolves_to_native_executable() {
        let root = tempfile::tempdir().unwrap();
        let package = root.path().join("node_modules/@openai/codex");
        let native = package.join(native_relative_path().unwrap());
        std::fs::create_dir_all(native.parent().unwrap()).unwrap();
        std::fs::write(&native, b"fixture").unwrap();
        let shim = root.path().join("codex.cmd");
        std::fs::write(&shim, b"fixture").unwrap();
        assert_eq!(prefer_native(shim), native);
    }
    #[cfg(windows)]
    #[test]
    fn installed_windows_codex_can_launch_directly() {
        if std::env::var("MOMMYCODEX_TEST_INSTALLED_CODEX").as_deref() != Ok("1") { return; }
        let binary = resolve_codex_binary(None).unwrap();
        assert_eq!(binary.extension().unwrap(), "exe");
        let output = std::process::Command::new(binary).arg("--version").output().unwrap();
        assert!(output.status.success());
        assert!(String::from_utf8_lossy(&output.stdout).contains("codex"));
    }
    #[test]
    fn non_launcher_paths_do_not_map() {
        assert!(native_for_launcher(Path::new("/usr/local/bin/codex")).is_none());
        assert!(native_for_launcher(Path::new("/x/y/codex/bin/codex.js")).is_none());
    }
}
