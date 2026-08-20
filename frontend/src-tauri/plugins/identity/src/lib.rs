use tauri::{
    Manager, Runtime,
    plugin::{Builder, TauriPlugin},
};

mod commands;
#[cfg(desktop)]
mod desktop;
mod error;
#[cfg(mobile)]
mod mobile;
mod models;
pub use error::{Error, Result};

#[cfg(desktop)]
use desktop::Identity;
#[cfg(mobile)]
use mobile::Identity;

trait IdentityExt<R: Runtime> {
    fn identity(&self) -> &Identity<R>;
}
impl<R: Runtime, T: Manager<R>> IdentityExt<R> for T {
    fn identity(&self) -> &Identity<R> {
        self.state::<Identity<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("identity")
        .invoke_handler(tauri::generate_handler![
            commands::get_or_create,
            commands::sign,
            commands::seal,
            commands::open,
            commands::delete,
        ])
        .setup(|app, api| {
            #[cfg(mobile)]
            let identity = mobile::init(app, api)?;
            #[cfg(desktop)]
            let identity = desktop::init(app, api)?;
            app.manage(identity);
            Ok(())
        })
        .build()
}
