//! Fixed Git/GitHub operations for the user-driven issue-to-draft-PR workflow.
use serde_json::{json, Value};
use base64::Engine;
use std::{path::{Path, Component}, io::Write, hash::{Hash, Hasher}};
use tokio::process::Command;
type Result<T> = std::result::Result<T,String>;
async fn run(cwd:&Path, program:&str, args:&[&str])->Result<String>{
    let mut command=Command::new(program);
    #[cfg(test)]
    if program=="gh" {
        if let Ok(script)=std::env::var("MOMMYCODEX_TEST_GH") {
            command=Command::new("node");command.arg(script);
        }
    }
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    let out=command.args(args).current_dir(cwd).env("GIT_TERMINAL_PROMPT","0").env("GH_PROMPT_DISABLED","1").output().await.map_err(|e|format!("Could not run {program}: {e}. Install GitHub CLI and run gh auth login."))?;
    if !out.status.success(){return Err(String::from_utf8_lossy(&out.stderr).chars().take(4000).collect());}
    String::from_utf8(out.stdout).map_err(|_|"Command returned non-UTF-8 paths".into())
}
fn safe_file(name:&str)->Result<()> {
    if name.is_empty()||Path::new(name).components().any(|p|!matches!(p,Component::Normal(_))){return Err("Invalid file path".into());}
    if name.split(['/', '\\']).any(|p|p==".git"||p==".env"||p.starts_with(".env.")||p.ends_with(".pem")||p.ends_with(".key")){return Err(format!("Exclude credential or Git metadata file: {name}"));}Ok(())
}
async fn repository(cwd:&Path)->Result<Value>{
    let root=run(cwd,"git",&["rev-parse","--show-toplevel"]).await?;
    if std::fs::canonicalize(root.trim()).map_err(|e|e.to_string())?!=cwd {return Err("Open the Git repository root for the GitHub workflow.".into());}
    serde_json::from_str(&run(cwd,"gh",&["repo","view","--json","nameWithOwner,url,defaultBranchRef"]).await?).map_err(|e|e.to_string())
}
async fn changed(cwd:&Path)->Result<Vec<String>>{
    let tracked=run(cwd,"git",&["diff","HEAD","--name-only","-z"]).await?;
    let other=run(cwd,"git",&["ls-files","--others","--exclude-standard","-z"]).await?;
    let mut files:Vec<String>=tracked.split('\0').chain(other.split('\0')).filter(|s|!s.is_empty()).map(str::to_owned).collect();files.sort();files.dedup();Ok(files)
}
async fn fingerprint(cwd:&Path)->Result<String>{
    let mut hash=std::collections::hash_map::DefaultHasher::new();
    run(cwd,"git",&["rev-parse","HEAD"]).await?.hash(&mut hash);
    run(cwd,"git",&["diff","HEAD","--binary"]).await?.hash(&mut hash);
    for file in changed(cwd).await? {file.hash(&mut hash);let p=cwd.join(&file);if let Ok(meta)=std::fs::symlink_metadata(&p){if meta.file_type().is_symlink(){std::fs::read_link(p).map_err(|e|e.to_string())?.hash(&mut hash);}else if meta.is_file(){std::fs::read(p).map_err(|e|e.to_string())?.hash(&mut hash);}}}
    Ok(format!("{:016x}",hash.finish()))
}
async fn handle(cwd:&Path, action:&str, params:Value)->Result<Value>{
    let repo=repository(cwd).await?;let name=repo["nameWithOwner"].as_str().ok_or("No GitHub repository found")?;
    match action {
        "status"=>Ok(json!({"repo":name,"url":repo["url"],"base":repo["defaultBranchRef"]["name"],"branch":run(cwd,"git",&["branch","--show-current"]).await?.trim(),"files":changed(cwd).await?,"fingerprint":fingerprint(cwd).await?})),
        "issues"=>serde_json::from_str(&run(cwd,"gh",&["issue","list","--repo",name,"--state","open","--limit","50","--json","number,title,body,url"]).await?).map_err(|e|e.to_string()),
        "start"=>{
            if !run(cwd,"git",&["status","--porcelain"]).await?.trim().is_empty(){return Err("Commit or stash existing changes before starting an issue branch.".into());}
            let number=params["number"].as_u64().filter(|n|*n>0).ok_or("Choose an issue")?.to_string();
            let issue:Value=serde_json::from_str(&run(cwd,"gh",&["issue","view",&number,"--repo",name,"--json","number,title,body,url"]).await?).map_err(|e|e.to_string())?;
            let base=repo["defaultBranchRef"]["name"].as_str().ok_or("Missing default branch")?;
            if run(cwd,"git",&["branch","--show-current"]).await?.trim()!=base{return Err(format!("Switch to {base} before starting a new issue."));}
            let branch=format!("mommycodex/issue-{}-{}",number,std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs());
            run(cwd,"git",&["checkout","-b",&branch]).await?;
            Ok(json!({"repo":name,"branch":branch,"base":base,"issue":issue}))
        },
        "return"=>{
            if !run(cwd,"git",&["status","--porcelain"]).await?.trim().is_empty(){return Err("Commit or stash remaining changes before returning to the default branch.".into());}
            let base=repo["defaultBranchRef"]["name"].as_str().ok_or("Missing default branch")?;
            run(cwd,"git",&["checkout",base]).await?;Ok(json!({"branch":base}))
        },
        "diff"=>{
            let file=params["file"].as_str().ok_or("Select a file")?;safe_file(file)?;
            if !changed(cwd).await?.iter().any(|f|f==file){return Err("File is not in the working changes".into());}
            let diff=run(cwd,"git",&["diff","HEAD","--",file]).await?;
            if !diff.is_empty(){return Ok(json!({"diff":diff.chars().take(64000).collect::<String>()}));}
            let path=cwd.join(file);let metadata=std::fs::symlink_metadata(&path).map_err(|e|e.to_string())?;
            if metadata.file_type().is_symlink()||metadata.len()>64000{return Ok(json!({"diff":"New binary, symlink, or large file; text preview unavailable."}));}
            Ok(json!({"diff":std::fs::read_to_string(path).unwrap_or_else(|_|"New binary file".into())}))
        },
        "publish"=>{
            if params["fingerprint"].as_str()!=Some(fingerprint(cwd).await?.as_str()){return Err("Files changed since the PR review. Refresh and review them again.".into());}
            let branch=params["branch"].as_str().ok_or("Missing issue branch")?;
            if !branch.starts_with("mommycodex/issue-")||run(cwd,"git",&["branch","--show-current"]).await?.trim()!=branch{return Err("Return to the issue branch before publishing.".into());}
            let base=params["base"].as_str().ok_or("Missing base branch")?;
            let title=params["title"].as_str().filter(|s|!s.trim().is_empty()).ok_or("Enter a PR title")?;
            let mut body=params["body"].as_str().ok_or("Review the PR description first")?.to_owned();
            if !run(cwd,"git",&["diff","--cached","--name-only"]).await?.trim().is_empty(){return Err("The Git index has staged changes. Commit or unstage them before publishing through the app.".into());}
            let mut files:Vec<String>=serde_json::from_value(params["files"].clone()).map_err(|_|"Choose the files to publish")?;
            let available=changed(cwd).await?;
            for file in &files {safe_file(file)?;if !available.contains(file){return Err(format!("{file} is no longer in the working changes. Refresh the review."));}}
            let mut screenshot_path=None;
            if let Some(image)=params["screenshot"].as_str().filter(|s|!s.is_empty()) {
                let encoded=image.strip_prefix("data:image/png;base64,").ok_or("Screenshot must be a PNG")?;
                if encoded.len()>12_000_000{return Err("Screenshot is too large".into());}
                let bytes=base64::engine::general_purpose::STANDARD.decode(encoded).map_err(|_|"Invalid screenshot")?;
                if !bytes.starts_with(b"\x89PNG\r\n\x1a\n"){return Err("Invalid PNG screenshot".into());}
                let mut parent=cwd.to_owned();
                for part in [".mommycodex","evidence"] {parent.push(part);if parent.exists() {if std::fs::symlink_metadata(&parent).map_err(|e|e.to_string())?.file_type().is_symlink(){return Err("Evidence folder cannot be a symlink".into());}}else{std::fs::create_dir(&parent).map_err(|e|e.to_string())?;}}
                let path=format!(".mommycodex/evidence/preview-{}.png",std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos());
                std::fs::write(cwd.join(&path),bytes).map_err(|e|e.to_string())?;files.push(path.clone());screenshot_path=Some(path);
            }
            if !files.is_empty(){
                let mut args=vec!["add","--"];args.extend(files.iter().map(String::as_str));run(cwd,"git",&args).await?;
                if let Err(error)=run(cwd,"git",&["commit","-m",title]).await {let mut reset=vec!["reset","HEAD","--"];reset.extend(files.iter().map(String::as_str));let _=run(cwd,"git",&reset).await;return Err(error); }
            }
            if run(cwd,"git",&["rev-list","--count",&format!("{base}..HEAD")]).await?.trim()=="0"{return Err("The branch has no committed changes to publish.".into());}
            run(cwd,"git",&["-c","url.https://github.com/.insteadOf=git@github.com:","-c","credential.helper=","-c","credential.helper=!gh auth git-credential","push","--set-upstream","origin",branch]).await?;
            if let Some(path)=screenshot_path {let sha=run(cwd,"git",&["rev-parse","HEAD"]).await?;body.push_str(&format!("\n\n### Preview\n![Project preview](https://raw.githubusercontent.com/{}/{}/{})\n",name,sha.trim(),path));}
            let existing=run(cwd,"gh",&["pr","list","--repo",name,"--head",branch,"--state","open","--json","url"]).await?;
            let prs:Value=serde_json::from_str(&existing).map_err(|e|e.to_string())?;
            let mut file=tempfile::NamedTempFile::new().map_err(|e|e.to_string())?;file.write_all(body.as_bytes()).map_err(|e|e.to_string())?;
            if let Some(url)=prs[0]["url"].as_str(){run(cwd,"gh",&["pr","edit",url,"--repo",name,"--title",title,"--body-file",file.path().to_str().ok_or("Invalid temporary path")?]).await?;return Ok(json!({"url":url,"existing":true}));}
            let url=run(cwd,"gh",&["pr","create","--repo",name,"--draft","--base",base,"--head",branch,"--title",title,"--body-file",file.path().to_str().ok_or("Invalid temporary path")?]).await?;
            Ok(json!({"url":url.trim()}))
        },
        _=>Err("Unsupported GitHub action".into()),
    }
}
#[tauri::command]
pub async fn github_action(cwd:String,action:String,params:Value)->Result<Value>{
    let cwd=std::fs::canonicalize(cwd).map_err(|e|e.to_string())?;
    handle(&cwd,&action,params).await
}
#[cfg(test)]mod tests {use super::*;#[test]fn rejects_git_paths_traversal_and_credentials(){for p in ["../a","/tmp/a",".git/config","src/../../a",".env","a/.env.production","secret.pem"]{assert!(safe_file(p).is_err(),"{p}");}assert!(safe_file("src/components/App.tsx").is_ok());}}

#[cfg(test)]
mod workflow_tests {
    use super::*;
    #[tokio::test]
    async fn issue_branch_review_commit_push_and_draft_with_screenshot() {
        let project=tempfile::tempdir().unwrap();let remote=tempfile::tempdir().unwrap();let mock=tempfile::tempdir().unwrap();
        let cwd=std::fs::canonicalize(project.path()).unwrap();
        run(&cwd,"git",&["init","--initial-branch=main"]).await.unwrap();
        run(&cwd,"git",&["config","user.name","Workflow fixture"]).await.unwrap();
        run(&cwd,"git",&["config","user.email","fixture@example.invalid"]).await.unwrap();
        std::fs::write(cwd.join("a.txt"),"baseline").unwrap();run(&cwd,"git",&["add","a.txt"]).await.unwrap();run(&cwd,"git",&["commit","-m","baseline"]).await.unwrap();
        run(remote.path(),"git",&["init","--bare"]).await.unwrap();run(&cwd,"git",&["remote","add","origin",remote.path().to_str().unwrap()]).await.unwrap();
        let gh=mock.path().join("gh.cjs");
        std::fs::write(&gh,r##"
const fs=require('node:fs'), path=require('node:path');
const args=process.argv.slice(2);
fs.appendFileSync(path.join(__dirname,'calls'),args.join(' ')+'\n');
const issue={number:7,title:'Improve controls',body:'Make controls work',url:'https://github.com/fixture/project/issues/7'};
switch(args.slice(0,2).join(' ')) {
case 'repo view': console.log(JSON.stringify({nameWithOwner:'fixture/project',url:'https://github.com/fixture/project',defaultBranchRef:{name:'main'}}));break;
case 'issue list': console.log(JSON.stringify([issue]));break;
case 'issue view': console.log(JSON.stringify(issue));break;
case 'pr list': console.log('[]');break;
case 'pr create': fs.copyFileSync(args[args.indexOf('--body-file')+1],path.join(__dirname,'body.md'));console.log('https://github.com/fixture/project/pull/8');break;
default: process.exit(1);
}
"##).unwrap();
        std::env::set_var("MOMMYCODEX_TEST_GH",&gh);
        let issues=handle(&cwd,"issues",json!({})).await.unwrap();assert_eq!(issues[0]["number"],7);
        std::fs::write(cwd.join("dirty"),"existing user changes").unwrap();assert!(handle(&cwd,"start",json!({"number":7})).await.unwrap_err().contains("Commit or stash"));std::fs::remove_file(cwd.join("dirty")).unwrap();
        let started=handle(&cwd,"start",json!({"number":7})).await.unwrap();let branch=started["branch"].as_str().unwrap();assert!(branch.starts_with("mommycodex/issue-7-"));
        std::fs::write(cwd.join("a.txt"),"fixed controls").unwrap();std::fs::write(cwd.join("unrelated.txt"),"do not commit").unwrap();
        let status=handle(&cwd,"status",json!({})).await.unwrap();let diff=handle(&cwd,"diff",json!({"file":"a.txt"})).await.unwrap();assert!(diff["diff"].as_str().unwrap().contains("+fixed controls"));
        let mut params=json!({"branch":branch,"base":"main","files":["a.txt"],"title":"Improve controls","body":"Closes #7\n\nTests passed in fixture","fingerprint":status["fingerprint"],"screenshot":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=="});
        std::fs::write(cwd.join("a.txt"),"newer edit").unwrap();assert!(handle(&cwd,"publish",params.clone()).await.unwrap_err().contains("Files changed"));std::fs::write(cwd.join("a.txt"),"fixed controls").unwrap();
        params["fingerprint"]=handle(&cwd,"status",json!({})).await.unwrap()["fingerprint"].clone();
        let published=handle(&cwd,"publish",params).await.unwrap();assert_eq!(published["url"],"https://github.com/fixture/project/pull/8");
        assert_eq!(run(&cwd,"git",&["show","HEAD:a.txt"]).await.unwrap(),"fixed controls");assert!(run(&cwd,"git",&["show","HEAD:unrelated.txt"]).await.is_err());
        assert!(!run(remote.path(),"git",&["rev-parse",branch]).await.unwrap().trim().is_empty());
        let body=std::fs::read_to_string(mock.path().join("body.md")).unwrap();assert!(body.contains("Tests passed in fixture"));assert!(body.contains("raw.githubusercontent.com/fixture/project/"));
        let calls=std::fs::read_to_string(mock.path().join("calls")).unwrap();assert!(calls.contains("--draft"));assert!(calls.contains("--body-file"));std::env::remove_var("MOMMYCODEX_TEST_GH");
    }
}
