# Core Tacitus V2

Crate Rust `rlib`/`cdylib` condiviso. Implementa documento d'Identità e Tacitus ID, autenticazione del relay, handshake autenticato, Double Ratchet, AES-256-GCM-SIV e padding. `wasm-pack` genera i binding consumati dal client Web/Tauri.

La specifica completa è nel [`README` principale](../README.md#protocollo-tacitus-v2).

```bash
cargo test -p tacitus-protocol
wasm-pack build protocol --target web --out-dir ../frontend/src/generated --release
```
