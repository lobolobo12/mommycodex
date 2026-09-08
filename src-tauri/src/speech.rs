use serde_json::{json, Value};
use std::io::Write;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{ipc::Channel, State};
use tempfile::TempPath;
use tokio::sync::watch;

const MOMMY_VOICE: &str = "60bd8f0f5bbc462a8fa1686dd81af336";
const NYX_VOICE: &str = "857b089972de4840baf7830a089d98da";
const FISH_URL: &str = "https://api.fish.audio/v1/tts";
const KEY_SERVICE: &str = "com.lovrobor.mommycodex.fish-audio";
#[cfg(target_os = "macos")]
const KEY_ACCOUNT: &str = "api-key";
const MAX_AUDIO: usize = 20 * 1024 * 1024;

#[cfg(target_os = "macos")]
fn read_key() -> Result<Option<String>, String> {
    match security_framework::passwords::get_generic_password(KEY_SERVICE, KEY_ACCOUNT) {
        Ok(bytes) => String::from_utf8(bytes)
            .map(Some)
            .map_err(|_| "The saved Fish API key is invalid. Replace it in Settings.".into()),
        Err(error) if error.code() == -25300 => Ok(None),
        Err(_) => Err(
            "Could not access the Fish API key in Keychain. Allow MommyCodex access and try again."
                .into(),
        ),
    }
}
#[cfg(windows)]
fn read_key() -> Result<Option<String>, String> { crate::windows::read_key(KEY_SERVICE) }
#[cfg(not(any(target_os = "macos", windows)))]
fn read_key() -> Result<Option<String>, String> {
    Err("Voice playback currently requires the macOS app.".into())
}

#[tauri::command]
pub async fn speech_key_status() -> Result<bool, String> {
    Ok(read_key()?.is_some())
}

#[tauri::command]
pub async fn speech_save_key(api_key: String) -> Result<(), String> {
    let key = api_key.trim();
    if key.is_empty() || key.len() > 4096 || key.chars().any(char::is_whitespace) {
        return Err("Enter a valid Fish Audio API key.".into());
    }
    #[cfg(target_os = "macos")]
    return security_framework::passwords::set_generic_password(
        KEY_SERVICE,
        KEY_ACCOUNT,
        key.as_bytes(),
    )
    .map_err(|_| "Could not save the Fish API key in Keychain.".into());
    #[cfg(windows)]
    return crate::windows::save_key(KEY_SERVICE, key);
    #[cfg(not(any(target_os = "macos", windows)))]
    Err("Key storage is not supported on this platform.".into())
}

#[tauri::command]
pub async fn speech_remove_key() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    return match security_framework::passwords::delete_generic_password(KEY_SERVICE, KEY_ACCOUNT) {
        Ok(()) => Ok(()),
        Err(error) if error.code() == -25300 => Ok(()),
        Err(_) => Err("Could not remove the Fish API key from Keychain.".into()),
    };
    #[cfg(windows)]
    return crate::windows::remove_key(KEY_SERVICE);
    #[cfg(not(any(target_os = "macos", windows)))]
    Err("Key storage is not supported on this platform.".into())
}

#[derive(Default)]
struct Playback {
    latest: u64,
    child: Option<Child>,
    audio: Option<TempPath>,
}
impl Playback {
    fn stop(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        self.audio = None;
    }
    fn accept(&mut self, id: u64) -> bool {
        if id <= self.latest {
            return false;
        }
        self.latest = id;
        self.stop();
        true
    }
}

pub struct SpeechState {
    playback: Mutex<Playback>,
    changed: watch::Sender<u64>,
}
impl Default for SpeechState {
    fn default() -> Self {
        Self {
            playback: Mutex::default(),
            changed: watch::channel(0).0,
        }
    }
}
impl SpeechState {
    fn accept(&self, id: u64) -> Result<bool, String> {
        let mut playback = self
            .playback
            .lock()
            .map_err(|_| "Speech state unavailable")?;
        if !playback.accept(id) {
            return Ok(false);
        }
        self.changed.send_replace(id);
        Ok(true)
    }
    pub fn shutdown(&self) {
        if let Ok(mut playback) = self.playback.lock() {
            playback.stop();
            self.changed.send_replace(u64::MAX);
        }
    }
}

fn request_body(text: &str, speed: f64, voice: &str) -> Value {
    json!({ "text": text, "reference_id": voice, "format": "mp3", "mp3_bitrate": 128,
        "prosody": { "speed": speed, "volume": 0, "normalize_loudness": true } })
}
fn api_error(status: u16) -> String {
    match status {
        401 => "Fish Audio rejected the API key. Replace it in Settings.",
        402 => "Fish Audio needs API credits for this request. Check your Fish account or choose the free tier.",
        403 | 404 => "The selected voice or speech model is unavailable to this Fish account.",
        429 => "Fish Audio's request limit was reached. Wait a little and try again.",
        503 => "The selected Fish speech tier is temporarily unavailable. Try again later.",
        _ => "Fish Audio could not generate speech. Check your account and try a shorter reply.",
    }.into()
}

async fn download_audio(
    client: &reqwest::Client,
    url: &str,
    key: &str,
    text: &str,
    speed: f64,
    model: &str,
    voice: &str,
) -> Result<Vec<u8>, String> {
    let mut response = client
        .post(url)
        .bearer_auth(key)
        .header("model", model)
        .json(&request_body(text, speed, voice))
        .send()
        .await
        .map_err(|_| "Could not reach Fish Audio. Check your connection and try again.")?;
    if !response.status().is_success() {
        return Err(api_error(response.status().as_u16()));
    }
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if !content_type.starts_with("audio/") && !content_type.starts_with("application/octet-stream")
    {
        return Err("Fish Audio returned an unexpected response instead of audio.".into());
    }
    let mut audio = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "The speech download was interrupted. Try again.")?
    {
        if audio.len() + chunk.len() > MAX_AUDIO {
            return Err("The audio is too large. Try reading a shorter reply.".into());
        }
        audio.extend_from_slice(&chunk);
    }
    if audio.is_empty() {
        return Err("Fish Audio returned no audio. Try again.".into());
    }
    Ok(audio)
}

#[tauri::command]
pub async fn speech_stop(state: State<'_, SpeechState>, request_id: u64) -> Result<(), String> {
    state.accept(request_id)?;
    Ok(())
}

#[tauri::command]
pub async fn speech_speak(
    state: State<'_, SpeechState>,
    request_id: u64,
    text: String,
    speed: f64,
    model: String,
    character: Option<String>,
    on_event: Channel<String>,
) -> Result<(), String> {
    if !state.accept(request_id)? {
        return Ok(());
    }
    if text.trim().is_empty() || text.chars().count() > 10_000 {
        return Err("Read aloud supports replies up to 10,000 characters.".into());
    }
    if !speed.is_finite() || !(0.75..=1.25).contains(&speed) {
        return Err("Choose a speech speed in Settings.".into());
    }
    if model != "s2.1-pro-free" && model != "s2.1-pro" {
        return Err("Choose a Fish speech tier in Settings.".into());
    }
    let voice = match character.as_deref().unwrap_or("mommy") {
        "mommy" => MOMMY_VOICE,
        "nyx" => NYX_VOICE,
        _ => return Err("Choose a companion before reading aloud.".into()),
    };
    let key = read_key()?
        .ok_or("Add your Fish Audio API key in Settings → Companion voice to enable read aloud.")?;
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|_| "Could not initialize the speech connection.")?;
    let mut changes = state.changed.subscribe();
    if *changes.borrow_and_update() != request_id {
        return Ok(());
    }
    let audio = tokio::select! {
        result = download_audio(&client, FISH_URL, &key, &text, speed, &model, voice) => result?,
        _ = changes.changed() => return Ok(()),
    };
    drop(key);
    {
        let mut playback = state
            .playback
            .lock()
            .map_err(|_| "Speech state unavailable")?;
        if playback.latest != request_id {
            return Ok(());
        }
        let mut file = tempfile::Builder::new()
            .prefix("mommycodex-voice-")
            .suffix(".mp3")
            .tempfile()
            .map_err(|_| "Could not prepare speech audio.")?;
        file.write_all(&audio)
            .map_err(|_| "Could not save temporary speech audio.")?;
        let path = file.into_temp_path();
        #[cfg(not(windows))]
        let mut command = Command::new("/usr/bin/afplay");
        #[cfg(windows)]
        let mut command = {
            use std::os::windows::process::CommandExt;
            let mut command = Command::new(std::env::current_exe().map_err(|e| e.to_string())?);
            command.arg("--mommycodex-play").creation_flags(0x08000000);
            command
        };
        let child = command.arg(&path)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| "Could not start audio playback.")?;
        playback.child = Some(child);
        playback.audio = Some(path);
    }
    if on_event.send("playing".into()).is_err() {
        let mut playback = state
            .playback
            .lock()
            .map_err(|_| "Speech state unavailable")?;
        if playback.latest == request_id {
            playback.stop();
        }
        return Ok(());
    }
    loop {
        {
            let mut playback = state
                .playback
                .lock()
                .map_err(|_| "Speech state unavailable")?;
            if playback.latest != request_id {
                return Ok(());
            }
            let Some(child) = playback.child.as_mut() else {
                return Ok(());
            };
            match child.try_wait() {
                Ok(Some(status)) => {
                    playback.child = None;
                    playback.audio = None;
                    return if status.success() {
                        Ok(())
                    } else {
                        Err("Audio playback failed. Check your sound output and try again.".into())
                    };
                }
                Ok(None) => {}
                Err(_) => {
                    playback.stop();
                    return Err("Could not read playback status.".into());
                }
            }
        }
        tokio::time::sleep(Duration::from_millis(80)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;
    use std::net::TcpListener;

    fn mock_http(
        status: &str,
        content_type: &str,
        body: &[u8],
    ) -> (String, std::thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/tts", listener.local_addr().unwrap());
        let response = format!("HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", body.len());
        let bytes = body.to_vec();
        let worker = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut request = Vec::new();
            let mut buffer = [0u8; 4096];
            loop {
                let n = stream.read(&mut buffer).unwrap();
                if n == 0 {
                    break;
                }
                request.extend_from_slice(&buffer[..n]);
                let text = String::from_utf8_lossy(&request);
                if let Some(end) = text.find("\r\n\r\n") {
                    let size: usize = text[..end]
                        .lines()
                        .find_map(|line| {
                            line.to_ascii_lowercase()
                                .strip_prefix("content-length:")
                                .map(|s| s.trim().parse().unwrap())
                        })
                        .unwrap_or(0);
                    if request.len() >= end + 4 + size {
                        break;
                    }
                }
            }
            stream.write_all(response.as_bytes()).unwrap();
            stream.write_all(&bytes).unwrap();
            String::from_utf8(request).unwrap()
        });
        (url, worker)
    }

    #[tokio::test]
    async fn fish_request_authenticates_and_returns_audio_without_changing_tiers() {
        let (url, request) = mock_http("200 OK", "audio/mpeg", b"ID3-audio-fixture");
        let audio = download_audio(
            &reqwest::Client::new(),
            &url,
            "fake-test-key",
            "Hello, darling.",
            1.0,
            "s2.1-pro-free",
            MOMMY_VOICE,
        )
        .await
        .unwrap();
        assert_eq!(audio, b"ID3-audio-fixture");
        let request = request.join().unwrap();
        assert!(request
            .to_ascii_lowercase()
            .contains("authorization: bearer fake-test-key"));
        assert!(request.contains("s2.1-pro-free"));
        let body: Value = serde_json::from_str(request.split("\r\n\r\n").nth(1).unwrap()).unwrap();
        assert_eq!(body["reference_id"], MOMMY_VOICE);
        assert_eq!(body["text"], "Hello, darling.");
    }

    #[tokio::test]
    async fn api_errors_and_non_audio_responses_are_not_played_or_exposed() {
        for (status, mime, body) in [
            (
                "401 Unauthorized",
                "application/json",
                "private server details",
            ),
            ("200 OK", "application/json", "{\"error\":\"bad\"}"),
        ] {
            let (url, request) = mock_http(status, mime, body.as_bytes());
            let error = download_audio(
                &reqwest::Client::new(),
                &url,
                "secret-key",
                "Private reply",
                1.0,
                "s2.1-pro-free",
                MOMMY_VOICE,
            )
            .await
            .unwrap_err();
            assert!(!error.contains("secret-key"));
            assert!(!error.contains("Private reply"));
            assert!(!error.contains("private server details"));
            request.join().unwrap();
        }
    }
    #[test]
    fn late_requests_cannot_restart_stopped_speech() {
        let state = SpeechState::default();
        assert!(state.accept(10).unwrap());
        assert!(state.accept(12).unwrap());
        assert!(!state.accept(11).unwrap());
        assert!(!state.accept(12).unwrap());
        assert_eq!(*state.changed.borrow(), 12);
    }
    #[test]
    fn speech_payload_preserves_text_and_selects_the_mommy_voice() {
        let text = "Mommy fixed it, darling.\nYour build passed.";
        let body = request_body(text, 0.85, MOMMY_VOICE);
        assert_eq!(body["text"], text);
        assert_eq!(body["reference_id"], MOMMY_VOICE);
        assert_eq!(body["prosody"]["speed"], 0.85);
        assert_eq!(body["format"], "mp3");
    }
    #[test]
    fn nyx_uses_a_different_reference_without_rewriting_the_reply() {
        let text = "Good. Let me handle this, darling.";
        let body = request_body(text, 1.0, NYX_VOICE);
        assert_ne!(NYX_VOICE, MOMMY_VOICE);
        assert_eq!(body["reference_id"], NYX_VOICE);
        assert_eq!(body["text"], text);
    }
    #[test]
    fn stopping_reaps_the_player_and_removes_temporary_audio() {
        let mut playback = Playback::default();
        let file = tempfile::NamedTempFile::new().unwrap();
        let path = file.path().to_owned();
        playback.audio = Some(file.into_temp_path());
        #[cfg(unix)]
        let child = Command::new("/bin/sleep").arg("20").spawn().unwrap();
        #[cfg(windows)]
        let child = Command::new("ping.exe").args(["-n", "20", "127.0.0.1"]).stdout(Stdio::null()).spawn().unwrap();
        playback.child = Some(child);
        playback.stop();
        assert!(playback.child.is_none());
        assert!(!path.exists());
    }
}

#[derive(Default)]
pub struct TranscriptionState {
    latest: std::sync::atomic::AtomicU64,
    changed: tokio::sync::Notify,
}
impl TranscriptionState {
    fn cancel(&self, request_id: u64) {
        let previous = self
            .latest
            .fetch_max(request_id, std::sync::atomic::Ordering::SeqCst);
        if request_id >= previous {
            self.changed.notify_waiters();
        }
    }
}
#[tauri::command]
pub fn speech_transcribe_stop(state: tauri::State<'_, TranscriptionState>, request_id: u64) {
    state.cancel(request_id);
}
#[tauri::command]
pub async fn speech_transcribe(
    state: tauri::State<'_, TranscriptionState>,
    request_id: u64,
    audio: Vec<u8>,
    mime: String,
) -> Result<String, String> {
    use std::sync::atomic::Ordering;
    let previous = state.latest.fetch_max(request_id, Ordering::SeqCst);
    if previous >= request_id {
        return Ok(String::new());
    }
    if audio.is_empty() || audio.len() > 12 * 1024 * 1024 {
        return Err("Record up to two minutes of audio (12 MB maximum).".into());
    }
    let (content_type, filename) = if mime.starts_with("audio/mp4") {
        ("audio/mp4", "recording.m4a")
    } else if mime.starts_with("audio/webm") {
        ("audio/webm", "recording.webm")
    } else if mime.starts_with("audio/wav") {
        ("audio/wav", "recording.wav")
    } else {
        return Err("Unsupported microphone audio format.".into());
    };
    let key = read_key()?.ok_or("Add your Fish API key in Settings to use voice input.")?;
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|_| "Could not initialize transcription")?;
    let part = reqwest::multipart::Part::bytes(audio)
        .file_name(filename)
        .mime_str(content_type)
        .map_err(|_| "Invalid audio format")?;
    let form = reqwest::multipart::Form::new()
        .part("audio", part)
        .text("ignore_timestamps", "true");
    let cancelled = state.changed.notified();
    tokio::pin!(cancelled);
    cancelled.as_mut().enable();
    if state.latest.load(Ordering::SeqCst) != request_id {
        return Ok(String::new());
    }
    let work = async {
        let response = client
            .post("https://api.fish.audio/v1/asr")
            .bearer_auth(key)
            .multipart(form)
            .send()
            .await
            .map_err(|_| "Voice transcription could not reach Fish Audio.")?;
        match response.status().as_u16() {
            200 => {}
            401 => return Err("Fish rejected the API key. Replace it in Settings.".to_string()),
            402 => return Err("Fish API credits are needed for voice input.".to_string()),
            429 => return Err("Fish rate limit reached. Try again shortly.".to_string()),
            _ => return Err("Fish could not transcribe this recording. Try again.".to_string()),
        };
        let data: serde_json::Value = response
            .json()
            .await
            .map_err(|_| "Invalid transcription response")?;
        Ok(data["text"]
            .as_str()
            .ok_or("Transcription response had no text")?
            .to_owned())
    };
    tokio::select! {result=work=>result,_=cancelled=>Ok(String::new())}
}

#[cfg(test)]
mod transcription_cancellation_tests {
    use super::*;
    #[tokio::test]
    async fn stale_stop_cannot_cancel_a_new_transcription() {
        let state = TranscriptionState::default();
        state.latest.store(20, std::sync::atomic::Ordering::SeqCst);
        let notified = state.changed.notified();
        tokio::pin!(notified);
        notified.as_mut().enable();
        state.cancel(19);
        assert!(
            tokio::time::timeout(Duration::from_millis(5), &mut notified)
                .await
                .is_err()
        );
        state.cancel(21);
        assert!(
            tokio::time::timeout(Duration::from_millis(100), &mut notified)
                .await
                .is_ok()
        );
    }
}
