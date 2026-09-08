//! Project memory and task-local file snapshots. Never alters the Git index.
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::Write,
    path::{Component, Path, PathBuf},
    process::Command,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

static LOCK: Mutex<()> = Mutex::new(());
const MAX_BYTES: u64 = 256 * 1024 * 1024;
const MAX_FILES: usize = 20_000;
type Result<T> = std::result::Result<T, String>;
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn id() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos()
        .to_string()
}
fn root(cwd: &str) -> Result<PathBuf> {
    let p = fs::canonicalize(cwd).map_err(err)?;
    if !p.is_dir() {
        return Err("Choose a project folder.".into());
    }
    Ok(p)
}
fn safe_relative(name: &str) -> Result<&Path> {
    let p = Path::new(name);
    if p.as_os_str().is_empty() || p.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err("Invalid checkpoint path".into());
    }
    Ok(p)
}
fn project_dir(base: &Path, cwd: &Path) -> Result<PathBuf> {
    fs::create_dir_all(base).map_err(err)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(base, fs::Permissions::from_mode(0o700)).map_err(err)?;
    }
    // Stable collision-free encoding; split into components to avoid NAME_MAX.
    let encoded: String = cwd
        .to_string_lossy()
        .as_bytes()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    let mut p = base.join("projects");
    for chunk in encoded.as_bytes().chunks(120) {
        p.push(std::str::from_utf8(chunk).unwrap());
    }
    p.push("data");
    fs::create_dir_all(&p).map_err(err)?;
    Ok(p)
}
fn atomic_json(path: &Path, value: &impl Serialize) -> Result<()> {
    let mut file =
        tempfile::NamedTempFile::new_in(path.parent().ok_or("Missing parent")?).map_err(err)?;
    serde_json::to_writer(&mut file, value).map_err(err)?;
    file.flush().map_err(err)?;
    file.persist(path).map_err(err)?;
    Ok(())
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMemory {
    pub stack: String,
    pub preferences: String,
    pub run_command: String,
    pub check_command: String,
    pub preview_url: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
struct Entry {
    blob: String,
    mode: u32,
    link: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Checkpoint {
    pub id: String,
    pub label: String,
    pub thread_id: String,
    pub created_at: u64,
    pub status: String,
    pub changed: Vec<String>,
    pub error: Option<String>,
}
#[derive(Serialize, Deserialize)]
struct Record {
    info: Checkpoint,
    cwd: String,
    before: BTreeMap<String, Entry>,
    after: Option<BTreeMap<String, Entry>>,
}
fn excluded(path: &Path) -> bool {
    path.components().any(|c| {
        matches!(
            c.as_os_str().to_str(),
            Some(
                ".git"
                    | "node_modules"
                    | "target"
                    | "dist"
                    | "build"
                    | ".next"
                    | ".pnpm-store"
                    | ".venv"
                    | "__pycache__"
            )
        )
    })
}
fn walk(dir: &Path, base: &Path, paths: &mut BTreeSet<PathBuf>) -> Result<()> {
    for item in fs::read_dir(dir).map_err(err)? {
        let p = item.map_err(err)?.path();
        let rel = p.strip_prefix(base).map_err(err)?;
        if excluded(rel) {
            continue;
        }
        let meta = fs::symlink_metadata(&p).map_err(err)?;
        if meta.is_dir() {
            walk(&p, base, paths)?;
        } else {
            paths.insert(rel.to_owned());
        }
        if paths.len() > MAX_FILES {
            return Err("Project exceeds 20,000 checkpoint files.".into());
        }
    }
    Ok(())
}
fn paths(cwd: &Path) -> Result<BTreeSet<PathBuf>> {
    let mut command = Command::new("git");
    #[cfg(windows)]
    { use std::os::windows::process::CommandExt; command.creation_flags(0x08000000); }
    let output = command
        .args([
            "ls-files",
            "-z",
            "--cached",
            "--others",
            "--exclude-standard",
        ])
        .current_dir(cwd)
        .output()
        .map_err(err)?;
    let mut paths = BTreeSet::new();
    if output.status.success() {
        for raw in output.stdout.split(|b| *b == 0).filter(|b| !b.is_empty()) {
            let name =
                std::str::from_utf8(raw).map_err(|_| "Checkpoint requires UTF-8 file paths")?;
            let rel = safe_relative(name)?;
            if !excluded(rel) && fs::symlink_metadata(cwd.join(rel)).is_ok() {
                paths.insert(rel.to_owned());
            }
        }
    } else {
        walk(cwd, cwd, &mut paths)?;
    }
    Ok(paths)
}
fn checked_path(cwd: &Path, name: &str) -> Result<PathBuf> {
    let rel = safe_relative(name)?;
    let mut p = cwd.to_owned();
    let parts: Vec<_> = rel.components().collect();
    for part in &parts[..parts.len() - 1] {
        p.push(part);
        match fs::symlink_metadata(&p) {
            Ok(m) if m.file_type().is_symlink() || !m.is_dir() => {
                return Err(format!("Parent changed for {name}; restore stopped."))
            }
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(err(e)),
            _ => {}
        }
    }
    Ok(cwd.join(rel))
}
#[cfg(unix)]
fn mode(m: &fs::Metadata) -> u32 {
    use std::os::unix::fs::PermissionsExt;
    m.permissions().mode() & 0o777
}
#[cfg(not(unix))]
fn mode(_: &fs::Metadata) -> u32 {
    0
}
fn snapshot(cwd: &Path, folder: &Path) -> Result<BTreeMap<String, Entry>> {
    fs::create_dir_all(folder).map_err(err)?;
    let mut entries = BTreeMap::new();
    let mut total = 0;
    for (i, rel) in paths(cwd)?.into_iter().enumerate() {
        if i >= MAX_FILES {
            return Err("Project exceeds checkpoint file limit.".into());
        }
        let name = rel.to_str().ok_or("Invalid file name")?.to_owned();
        let p = checked_path(cwd, &name)?;
        let meta = fs::symlink_metadata(&p).map_err(err)?;
        if !meta.is_file() && !meta.file_type().is_symlink() {
            continue;
        }
        total += meta.len();
        if total > MAX_BYTES {
            return Err("Project exceeds 256 MB checkpoint limit. Dependency and build folders are excluded.".into());
        }
        let link = meta.file_type().is_symlink();
        let bytes = if link {
            fs::read_link(&p)
                .map_err(err)?
                .to_str()
                .ok_or("Invalid symlink")?
                .as_bytes()
                .to_vec()
        } else {
            fs::read(&p).map_err(err)?
        };
        let blob = i.to_string();
        fs::write(folder.join(&blob), bytes).map_err(err)?;
        entries.insert(
            name,
            Entry {
                blob,
                mode: mode(&meta),
                link,
            },
        );
    }
    Ok(entries)
}
fn equivalent(a: Option<&Entry>, af: &Path, b: Option<&Entry>, bf: &Path) -> Result<bool> {
    match (a, b) {
        (None, None) => Ok(true),
        (Some(a), Some(b)) => Ok(a.mode == b.mode
            && a.link == b.link
            && fs::read(af.join(&a.blob)).map_err(err)?
                == fs::read(bf.join(&b.blob)).map_err(err)?),
        _ => Ok(false),
    }
}
fn start(base: &Path, cwd: &Path, label: String, thread_id: String) -> Result<Checkpoint> {
    let info = Checkpoint {
        id: id(),
        label: label.chars().take(160).collect(),
        thread_id,
        created_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs(),
        status: "capturing".into(),
        changed: vec![],
        error: None,
    };
    let dir = project_dir(base, cwd)?.join("checkpoints").join(&info.id);
    fs::create_dir_all(&dir).map_err(err)?;
    let before = match snapshot(cwd, &dir.join("before")) {
        Ok(s) => s,
        Err(e) => {
            let _ = fs::remove_dir_all(&dir);
            return Err(e);
        }
    };
    let record = Record {
        info: Checkpoint {
            status: "running".into(),
            ..info
        },
        cwd: cwd.display().to_string(),
        before,
        after: None,
    };
    atomic_json(&dir.join("record.json"), &record)?;
    Ok(record.info)
}
fn load(base: &Path, cwd: &Path, key: &str) -> Result<(PathBuf, Record)> {
    if key.is_empty() || !key.bytes().all(|b| b.is_ascii_digit()) {
        return Err("Invalid checkpoint ID".into());
    }
    let dir = project_dir(base, cwd)?.join("checkpoints").join(key);
    let record: Record =
        serde_json::from_slice(&fs::read(dir.join("record.json")).map_err(err)?).map_err(err)?;
    if record.cwd != cwd.display().to_string() {
        return Err("Checkpoint belongs to another project".into());
    }
    Ok((dir, record))
}
fn finish(base: &Path, cwd: &Path, key: &str) -> Result<Checkpoint> {
    let (dir, mut record) = load(base, cwd, key)?;
    if record.after.is_some() {
        return Ok(record.info);
    }
    let after = snapshot(cwd, &dir.join("after"))?;
    let all: BTreeSet<_> = record.before.keys().chain(after.keys()).cloned().collect();
    for name in all {
        if !equivalent(
            record.before.get(&name),
            &dir.join("before"),
            after.get(&name),
            &dir.join("after"),
        )? {
            record.info.changed.push(name);
        }
    }
    record.after = Some(after);
    record.info.status = "ready".into();
    atomic_json(&dir.join("record.json"), &record)?;
    Ok(record.info)
}
fn restore_entry(cwd: &Path, name: &str, entry: Option<&Entry>, folder: &Path) -> Result<()> {
    let path = checked_path(cwd, name)?;
    if let Ok(meta) = fs::symlink_metadata(&path) {
        if meta.is_dir() {
            return Err(format!("{name} is now a folder"));
        }
        fs::remove_file(&path).map_err(err)?;
    }
    if let Some(e) = entry {
        fs::create_dir_all(path.parent().unwrap()).map_err(err)?;
        let bytes = fs::read(folder.join(&e.blob)).map_err(err)?;
        if e.link {
            #[cfg(unix)]
            std::os::unix::fs::symlink(std::str::from_utf8(&bytes).map_err(err)?, &path)
                .map_err(err)?;
            #[cfg(not(unix))]
            return Err("Symlink restore unsupported".into());
        } else {
            fs::write(&path, bytes).map_err(err)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(&path, fs::Permissions::from_mode(e.mode)).map_err(err)?;
            }
        }
    }
    Ok(())
}
fn undo(base: &Path, cwd: &Path, key: &str) -> Result<Checkpoint> {
    restore(base, cwd, key, false)
}
fn restore(base: &Path, cwd: &Path, key: &str, forward: bool) -> Result<Checkpoint> {
    let (dir, mut record) = load(base, cwd, key)?;
    if !forward && ["restored", "pending", "discarded"].contains(&record.info.status.as_str()) {
        return Err("Checkpoint already restored".into());
    }
    if forward && !["pending", "restored"].contains(&record.info.status.as_str()) {
        return Err("This proposal is not waiting to be applied".into());
    }
    let completed = record.after.as_ref().ok_or("Task has no completed snapshot; cannot safely restore")?;
    let (after, target, expected_folder, target_folder) = if forward {
        (&record.before, completed, dir.join("before"), dir.join("after"))
    } else {
        (completed, &record.before, dir.join("after"), dir.join("before"))
    };
    #[cfg(windows)]
    if record.info.changed.iter().any(|name| after.get(name).is_some_and(|e| e.link) || target.get(name).is_some_and(|e| e.link)) {
        return Err("Windows checkpoint restore does not support changed symbolic links. No files were modified; review those changes with Git.".into());
    }
    // Check every affected path before writing anything. Later edits are never discarded.
    for name in &record.info.changed {
        let p = checked_path(cwd, name)?;
        let expected = after.get(name);
        let same = match fs::symlink_metadata(&p) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => expected.is_none(),
            Err(e) => return Err(err(e)),
            Ok(m) => match expected {
                None => false,
                Some(e) => {
                    let link = m.file_type().is_symlink();
                    if link != e.link || mode(&m) != e.mode || m.is_dir() {
                        false
                    } else {
                        let bytes = if link {
                            fs::read_link(&p)
                                .map_err(err)?
                                .to_string_lossy()
                                .as_bytes()
                                .to_vec()
                        } else {
                            fs::read(&p).map_err(err)?
                        };
                        bytes == fs::read(expected_folder.join(&e.blob)).map_err(err)?
                    }
                }
            },
        };
        if !same {
            return Err(format!(
                "{name} changed after this task. Undo stopped to preserve your newer edits."
            ));
        }
    }
    let mut touched = vec![];
    for name in &record.info.changed {
        touched.push(name);
        if let Err(e) = restore_entry(cwd, name, target.get(name), &target_folder) {
            let mut failures = vec![];
            for n in touched.into_iter().rev() {
                if let Err(r) = restore_entry(cwd, n, after.get(n), &expected_folder) {
                    failures.push(r);
                }
            }
            return Err(format!(
                "Restore failed: {e}. Recovery errors: {}. Snapshot retained at {}",
                failures.join("; "),
                dir.display()
            ));
        }
    }
    record.info.status = if forward { "accepted" } else { "restored" }.into();
    atomic_json(&dir.join("record.json"), &record)?;
    Ok(record.info)
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewFile { path: String, kind: String, before: Option<String>, after: Option<String>, binary: bool }
fn proposal_files(base: &Path, cwd: &Path, key: &str) -> Result<Vec<ReviewFile>> {
    let (dir, record) = load(base, cwd, key)?;
    let after = record.after.as_ref().ok_or("Snapshot is not finished")?;
    record.info.changed.iter().map(|name| {
        let before_entry = record.before.get(name);
        let after_entry = after.get(name);
        let read = |entry: Option<&Entry>, folder: &str| -> Result<Option<String>> {
            let Some(entry) = entry else { return Ok(None) };
            let bytes = fs::read(dir.join(folder).join(&entry.blob)).map_err(err)?;
            if bytes.len() > 256 * 1024 || bytes.contains(&0) { return Ok(None) }
            Ok(String::from_utf8(bytes).ok())
        };
        let before = read(before_entry, "before")?;
        let after_text = read(after_entry, "after")?;
        Ok(ReviewFile { path: name.clone(), kind: if before_entry.is_none() { "added" } else if after_entry.is_none() { "deleted" } else { "modified" }.into(), binary: (before_entry.is_some() && before.is_none()) || (after_entry.is_some() && after_text.is_none()), before, after: after_text })
    }).collect()
}
fn decide_proposal(base: &Path, cwd: &Path, key: &str, action: &str) -> Result<Checkpoint> {
    if action == "accept" { return restore(base, cwd, key, true) }
    let (_, initial) = load(base, cwd, key)?;
    match action {
        "stage" if initial.info.status == "ready" => { undo(base, cwd, key)?; },
        "discard" if initial.info.status == "pending" => {},
        _ => return Err("Invalid proposal action or state".into()),
    }
    let (dir, mut record) = load(base, cwd, key)?;
    record.info.status = if action == "stage" { "pending" } else { "discarded" }.into();
    atomic_json(&dir.join("record.json"), &record)?;
    Ok(record.info)
}
#[tauri::command]
pub async fn checkpoint_review(app: tauri::AppHandle, cwd: String, id: String, action: String) -> Result<Checkpoint> {
    tauri::async_runtime::spawn_blocking(move || {
        let _g = LOCK.lock().map_err(err)?;
        decide_proposal(&base(&app)?, &root(&cwd)?, &id, &action)
    }).await.map_err(err)?
}
#[tauri::command]
pub async fn checkpoint_files(app: tauri::AppHandle, cwd: String, id: String) -> Result<Vec<ReviewFile>> {
    tauri::async_runtime::spawn_blocking(move || {
        let _g = LOCK.lock().map_err(err)?;
        proposal_files(&base(&app)?, &root(&cwd)?, &id)
    }).await.map_err(err)?
}
fn base(app: &tauri::AppHandle) -> Result<PathBuf> {
    app.path()
        .app_data_dir()
        .map(|p| p.join("harness"))
        .map_err(err)
}
#[tauri::command]
pub fn project_memory_load(app: tauri::AppHandle, cwd: String) -> Result<ProjectMemory> {
    let _guard = LOCK.lock().map_err(err)?;
    let file = project_dir(&base(&app)?, &root(&cwd)?)?.join("memory.json");
    match fs::read(file) {
        Ok(v) => serde_json::from_slice(&v).map_err(err),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(ProjectMemory::default()),
        Err(e) => Err(err(e)),
    }
}
#[tauri::command]
pub fn project_memory_save(
    app: tauri::AppHandle,
    cwd: String,
    memory: ProjectMemory,
) -> Result<()> {
    let _guard = LOCK.lock().map_err(err)?;
    if [
        &memory.stack,
        &memory.preferences,
        &memory.run_command,
        &memory.check_command,
        &memory.preview_url,
    ]
    .iter()
    .any(|s| s.len() > 16_000)
    {
        return Err("Memory fields must be under 16,000 bytes".into());
    }
    atomic_json(
        &project_dir(&base(&app)?, &root(&cwd)?)?.join("memory.json"),
        &memory,
    )
}
#[tauri::command]
pub async fn checkpoint_start(
    app: tauri::AppHandle,
    cwd: String,
    label: String,
    thread_id: String,
) -> Result<Checkpoint> {
    tauri::async_runtime::spawn_blocking(move || {
        let _g = LOCK.lock().map_err(err)?;
        start(&base(&app)?, &root(&cwd)?, label, thread_id)
    })
    .await
    .map_err(err)?
}
#[tauri::command]
pub async fn checkpoint_finish(
    app: tauri::AppHandle,
    cwd: String,
    id: String,
) -> Result<Checkpoint> {
    tauri::async_runtime::spawn_blocking(move || {
        let _g = LOCK.lock().map_err(err)?;
        finish(&base(&app)?, &root(&cwd)?, &id)
    })
    .await
    .map_err(err)?
}
#[tauri::command]
pub async fn checkpoint_undo(app: tauri::AppHandle, cwd: String, id: String) -> Result<Checkpoint> {
    tauri::async_runtime::spawn_blocking(move || {
        let _g = LOCK.lock().map_err(err)?;
        undo(&base(&app)?, &root(&cwd)?, &id)
    })
    .await
    .map_err(err)?
}
#[tauri::command]
pub fn checkpoint_list(app: tauri::AppHandle, cwd: String) -> Result<Vec<Checkpoint>> {
    let _g = LOCK.lock().map_err(err)?;
    let folder = project_dir(&base(&app)?, &root(&cwd)?)?.join("checkpoints");
    let mut result = vec![];
    if folder.exists() {
        for dir in fs::read_dir(folder).map_err(err)? {
            let dir = dir.map_err(err)?.path();
            if let Ok(bytes) = fs::read(dir.join("record.json")) {
                if let Ok(r) = serde_json::from_slice::<Record>(&bytes) {
                    result.push(r.info);
                }
            }
        }
    }
    result.sort_by(|a, b| {
        b.created_at
            .cmp(&a.created_at)
            .then_with(|| b.id.cmp(&a.id))
    });
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn proposal_stage_accept_undo_and_conflict() {
        let b = tempfile::tempdir().unwrap();
        let p = tempfile::tempdir().unwrap();
        fs::write(p.path().join("a"), "user baseline").unwrap();
        let c = start(b.path(), p.path(), "proposal".into(), "thread".into()).unwrap();
        fs::write(p.path().join("a"), "proposal").unwrap();
        fs::write(p.path().join("new"), [0,255]).unwrap();
        finish(b.path(), p.path(), &c.id).unwrap();
        let files=proposal_files(b.path(),p.path(),&c.id).unwrap();
        assert_eq!(files[0].before.as_deref(),Some("user baseline"));
        assert!(files[1].binary);
        assert_eq!(decide_proposal(b.path(),p.path(),&c.id,"stage").unwrap().status,"pending");
        assert_eq!(fs::read_to_string(p.path().join("a")).unwrap(),"user baseline");
        assert!(!p.path().join("new").exists());
        fs::write(p.path().join("a"),"later user edit").unwrap();
        assert!(decide_proposal(b.path(),p.path(),&c.id,"accept").is_err());
        assert!(!p.path().join("new").exists());
        fs::write(p.path().join("a"),"user baseline").unwrap();
        decide_proposal(b.path(),p.path(),&c.id,"accept").unwrap();
        assert_eq!(fs::read(p.path().join("new")).unwrap(),[0,255]);
        undo(b.path(),p.path(),&c.id).unwrap();
        assert_eq!(fs::read_to_string(p.path().join("a")).unwrap(),"user baseline");
    }
    #[test]
    fn discard_does_not_write_project_files() {
        let b=tempfile::tempdir().unwrap();let p=tempfile::tempdir().unwrap();
        fs::write(p.path().join("a"),"before").unwrap();
        let c=start(b.path(),p.path(),"".into(),"".into()).unwrap();
        fs::remove_file(p.path().join("a")).unwrap();
        finish(b.path(),p.path(),&c.id).unwrap();
        decide_proposal(b.path(),p.path(),&c.id,"stage").unwrap();
        fs::write(p.path().join("a"),"user edit during review").unwrap();
        decide_proposal(b.path(),p.path(),&c.id,"discard").unwrap();
        assert_eq!(fs::read_to_string(p.path().join("a")).unwrap(),"user edit during review");
        assert!(decide_proposal(b.path(),p.path(),&c.id,"accept").is_err());
    }
    #[test]
    fn undo_preserves_dirty_baseline_and_unrelated_newer_files() {
        let base = tempfile::tempdir().unwrap();
        let project = tempfile::tempdir().unwrap();
        let p = project.path();
        fs::write(p.join("a.txt"), "existing dirty edits").unwrap();
        let c = start(base.path(), p, "task".into(), "thread".into()).unwrap();
        fs::write(p.join("a.txt"), "agent edit").unwrap();
        fs::write(p.join("new.txt"), "added").unwrap();
        let c = finish(base.path(), p, &c.id).unwrap();
        assert_eq!(c.changed.len(), 2);
        fs::write(p.join("unrelated.txt"), "later work").unwrap();
        undo(base.path(), p, &c.id).unwrap();
        assert_eq!(
            fs::read_to_string(p.join("a.txt")).unwrap(),
            "existing dirty edits"
        );
        assert!(!p.join("new.txt").exists());
        assert!(p.join("unrelated.txt").exists());
    }
    #[test]
    fn later_edit_blocks_entire_restore() {
        let b = tempfile::tempdir().unwrap();
        let p = tempfile::tempdir().unwrap();
        fs::write(p.path().join("a"), "before").unwrap();
        let c = start(b.path(), p.path(), "".into(), "".into()).unwrap();
        fs::write(p.path().join("a"), "agent").unwrap();
        fs::write(p.path().join("b"), "agent").unwrap();
        finish(b.path(), p.path(), &c.id).unwrap();
        fs::write(p.path().join("b"), "user").unwrap();
        assert!(undo(b.path(), p.path(), &c.id)
            .unwrap_err()
            .contains("newer edits"));
        assert_eq!(fs::read_to_string(p.path().join("a")).unwrap(), "agent");
    }
    #[test]
    fn deleted_files_and_binary_files_restore() {
        let b = tempfile::tempdir().unwrap();
        let p = tempfile::tempdir().unwrap();
        fs::write(p.path().join("a"), [0, 255, 128]).unwrap();
        let c = start(b.path(), p.path(), "".into(), "".into()).unwrap();
        fs::remove_file(p.path().join("a")).unwrap();
        finish(b.path(), p.path(), &c.id).unwrap();
        undo(b.path(), p.path(), &c.id).unwrap();
        assert_eq!(fs::read(p.path().join("a")).unwrap(), [0, 255, 128]);
    }
    #[test]
    #[cfg(unix)]
    fn symlink_parent_cannot_escape_restore() {
        let b = tempfile::tempdir().unwrap();
        let p = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        fs::create_dir(p.path().join("dir")).unwrap();
        fs::write(p.path().join("dir/a"), "before").unwrap();
        let c = start(b.path(), p.path(), "".into(), "".into()).unwrap();
        fs::write(p.path().join("dir/a"), "after").unwrap();
        finish(b.path(), p.path(), &c.id).unwrap();
        fs::remove_dir_all(p.path().join("dir")).unwrap();
        std::os::unix::fs::symlink(outside.path(), p.path().join("dir")).unwrap();
        assert!(undo(b.path(), p.path(), &c.id).is_err());
        assert!(!outside.path().join("a").exists());
    }
}
