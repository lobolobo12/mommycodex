fn main() {
    println!("cargo:rerun-if-changed=native/Microphone.swift");
    println!("cargo:rerun-if-changed=native/Microphone.plist");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        std::fs::create_dir_all("resources/native").expect("native resource folder");
        let cache = std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("swift-cache");
        std::fs::create_dir_all(&cache).unwrap();
        let arch = if std::env::var("CARGO_CFG_TARGET_ARCH").as_deref() == Ok("aarch64") {
            "arm64"
        } else {
            "x86_64"
        };
        let target = format!("{arch}-apple-macosx12.0");
        let status = std::process::Command::new("xcrun")
            .args([
                "swiftc",
                "-module-cache-path",
                cache.to_str().unwrap(),
                "-target",
                &target,
                "native/Microphone.swift",
                "-O",
                "-o",
                "resources/native/microphone",
                "-Xlinker",
                "-sectcreate",
                "-Xlinker",
                "__TEXT",
                "-Xlinker",
                "__info_plist",
                "-Xlinker",
                "native/Microphone.plist",
            ])
            .status()
            .expect("Swift compiler is required for native microphone capture");
        assert!(
            status.success(),
            "Native microphone helper failed to compile"
        );
    }
    tauri_build::build()
}
