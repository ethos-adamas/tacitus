const COMMANDS: &[&str] = &["get_or_create", "sign", "seal", "open", "delete"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .ios_path("ios")
        .build();
}
