//! Spawns a real `codex app-server`, completes the `initialize` handshake and
//! lists models. Uses the machine's real Codex auth, so it is `#[ignore]`d by
//! default: `cargo test -- --ignored`.

use std::process::Stdio;
use std::time::Duration;

use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

async fn read_response(
    lines: &mut tokio::io::Lines<BufReader<tokio::process::ChildStdout>>,
    id: i64,
    budget: Duration,
) -> Value {
    tokio::time::timeout(budget, async {
        loop {
            let line = lines
                .next_line()
                .await
                .expect("read stdout")
                .expect("stdout closed before response");
            let v: Value = match serde_json::from_str(&line) {
                Ok(v) => v,
                Err(_) => continue,
            };
            if v.get("id").and_then(Value::as_i64) == Some(id) && v.get("method").is_none() {
                return v;
            }
        }
    })
    .await
    .expect("timed out waiting for response")
}

#[tokio::test]
#[ignore]
async fn initialize_and_list_models() {
    let bin = mommycodex_lib::binary::resolve_codex_binary(None).expect("codex binary");
    let mut child = Command::new(&bin)
        .args(["app-server", "--listen", "stdio://"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .kill_on_drop(true)
        .spawn()
        .expect("spawn app-server");
    let mut stdin = child.stdin.take().unwrap();
    let mut lines = BufReader::new(child.stdout.take().unwrap()).lines();

    let init = json!({
        "id": 1,
        "method": "initialize",
        "params": {
            "clientInfo": { "name": "mommycodex-smoke", "title": "MommyCodex smoke test", "version": "0.0.0" },
            "capabilities": { "experimentalApi": false, "requestAttestation": false }
        }
    });
    stdin.write_all(format!("{init}\n").as_bytes()).await.unwrap();
    let resp = read_response(&mut lines, 1, Duration::from_secs(20)).await;
    let result = resp.get("result").expect("initialize result");
    assert!(result["userAgent"].is_string(), "userAgent: {result}");
    assert!(result["codexHome"].is_string(), "codexHome: {result}");

    stdin
        .write_all(b"{\"method\":\"initialized\",\"params\":{}}\n")
        .await
        .unwrap();

    let list = json!({ "id": 2, "method": "model/list", "params": {} });
    stdin.write_all(format!("{list}\n").as_bytes()).await.unwrap();
    let resp = read_response(&mut lines, 2, Duration::from_secs(30)).await;
    let data = resp["result"]["data"].as_array().expect("model list data");
    assert!(!data.is_empty(), "expected at least one model");

    drop(stdin);
    let status = tokio::time::timeout(Duration::from_secs(5), child.wait())
        .await
        .expect("app-server should exit after stdin closes")
        .unwrap();
    assert!(status.success() || status.code().is_some());
}
