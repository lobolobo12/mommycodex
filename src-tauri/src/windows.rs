//! Windows credential storage and isolated audio helpers. No key goes through argv.
use std::{io::Write, os::windows::ffi::OsStrExt, path::Path};
use windows_sys::Win32::{
    Foundation::{GetLastError, ERROR_NOT_FOUND},
    Media::Multimedia::mciSendStringW,
    Security::Credentials::*,
};

fn wide(value: &std::ffi::OsStr) -> Vec<u16> {
    value.encode_wide().chain(Some(0)).collect()
}
pub fn read_key(target: &str) -> Result<Option<String>, String> {
    let target = wide(target.as_ref());
    let mut credential = std::ptr::null_mut();
    // CredRead allocates the blob; copy it before releasing it with CredFree.
    unsafe {
        if CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut credential) == 0 {
            return if GetLastError() == ERROR_NOT_FOUND { Ok(None) }
            else { Err("Could not read Fish key from Windows Credential Manager.".into()) };
        }
        let bytes = std::slice::from_raw_parts((*credential).CredentialBlob, (*credential).CredentialBlobSize as usize).to_vec();
        CredFree(credential.cast());
        String::from_utf8(bytes).map(Some).map_err(|_| "Replace the saved Fish key in Settings.".into())
    }
}
pub fn save_key(target: &str, key: &str) -> Result<(), String> {
    let mut target = wide(target.as_ref());
    let mut account = wide("api-key".as_ref());
    let mut bytes = key.as_bytes().to_vec();
    let credential = CREDENTIALW {
        Type: CRED_TYPE_GENERIC, TargetName: target.as_mut_ptr(),
        CredentialBlobSize: bytes.len() as u32, CredentialBlob: bytes.as_mut_ptr(),
        Persist: CRED_PERSIST_LOCAL_MACHINE, UserName: account.as_mut_ptr(),
        ..unsafe { std::mem::zeroed() }
    };
    let success = unsafe { CredWriteW(&credential, 0) } != 0;
    bytes.fill(0);
    if success { Ok(()) } else { Err("Could not save Fish key in Windows Credential Manager.".into()) }
}
pub fn remove_key(target: &str) -> Result<(), String> {
    let target = wide(target.as_ref());
    unsafe {
        if CredDeleteW(target.as_ptr(), CRED_TYPE_GENERIC, 0) != 0 || GetLastError() == ERROR_NOT_FOUND { Ok(()) }
        else { Err("Could not remove Fish key from Windows Credential Manager.".into()) }
    }
}
fn mci(command: &str) -> Result<(), String> {
    let command = wide(command.as_ref());
    let result = unsafe { mciSendStringW(command.as_ptr(), std::ptr::null_mut(), 0, std::ptr::null_mut()) };
    if result == 0 { Ok(()) } else { Err(format!("Windows audio error {result}. Check your sound device and microphone privacy settings.")) }
}
fn audio_path(path: &Path) -> Result<String, String> {
    let path = path.to_str().ok_or("Audio path is not valid Unicode")?;
    if path.contains(['"', '\r', '\n', '\0']) { return Err("Invalid audio path".into()); }
    // MCI does not understand Win32 extended-path prefixes.
    Ok(format!("\"{}\"", path.strip_prefix(r"\\?\").unwrap_or(path)))
}
fn audio_helper(mode: &str, file: &Path) -> Result<(), String> {
    let path = audio_path(file)?;
    if mode == "--mommycodex-play" {
        mci(&format!("open {path} type mpegvideo alias voice"))?;
        let result = mci("play voice wait");
        let _ = mci("close voice");
        result
    } else {
        mci("open new type waveaudio alias capture")?;
        let result = (|| {
            mci("set capture time format milliseconds channels 1 samplespersec 16000 bitspersample 16 alignment 2 bytespersec 32000")?;
            mci("record capture to 120000")?;
            println!("{{\"event\":\"recording\"}}");
            std::io::stdout().flush().map_err(|e| e.to_string())?;
            let mut line = String::new();
            std::io::stdin().read_line(&mut line).map_err(|e| e.to_string())?;
            mci("stop capture")?;
            // An EOF means the parent went away; never keep an abandoned recording.
            if line.trim() != "stop" { return Err("Recording cancelled".into()); }
            mci(&format!("save capture {path}"))?;
            println!("{{\"event\":\"stopped\"}}");
            Ok(())
        })();
        let _ = mci("close capture");
        result
    }
}
/// Called before starting Tauri so helpers never open another app window.
pub fn run_helper_if_requested() {
    let mut args = std::env::args_os().skip(1);
    let Some(mode) = args.next() else { return; };
    if mode != "--mommycodex-play" && mode != "--mommycodex-record" { return; }
    let result = args.next().ok_or("Missing audio file".into())
        .and_then(|path| audio_helper(mode.to_str().unwrap(), Path::new(&path)));
    if let Err(error) = &result { println!("{}", serde_json::json!({"error":error})); }
    std::process::exit(if result.is_ok() { 0 } else { 1 });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn credentials_round_trip_without_touching_the_user_key() {
        let target = format!("com.lovrobor.mommycodex.test-{}", std::process::id());
        assert_eq!(read_key(&target).unwrap(), None);
        save_key(&target, "fixture-not-a-real-key").unwrap();
        assert_eq!(read_key(&target).unwrap().as_deref(), Some("fixture-not-a-real-key"));
        remove_key(&target).unwrap();
        assert_eq!(read_key(&target).unwrap(), None);
        remove_key(&target).unwrap();
    }
    #[test]
    fn audio_paths_preserve_spaces_and_reject_command_delimiters() {
        assert_eq!(audio_path(Path::new(r"\\?\C:\User Files\voice.mp3")).unwrap(), r#""C:\User Files\voice.mp3""#);
        assert!(audio_path(Path::new("bad\"path")).is_err());
    }
}
