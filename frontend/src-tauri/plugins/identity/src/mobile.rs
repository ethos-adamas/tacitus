use crate::{Result, models::*};
use serde::de::DeserializeOwned;
use tauri::{
    AppHandle, Runtime,
    plugin::{PluginApi, PluginHandle},
};

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_identity);

pub struct Identity<R: Runtime>(PluginHandle<R>);

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> Result<Identity<R>> {
    #[cfg(target_os = "android")]
    let handle =
        api.register_android_plugin("it.ethosadamas.tacitus.identity", "IdentityPlugin")?;
    #[cfg(target_os = "ios")]
    let handle = api.register_ios_plugin(init_plugin_identity)?;
    Ok(Identity(handle))
}

impl<R: Runtime> Identity<R> {
    pub fn get_or_create(&self, payload: IdentityRequest) -> Result<IdentityResponse> {
        Ok(self.0.run_mobile_plugin("getOrCreate", payload)?)
    }
    pub fn sign(&self, payload: BytesRequest) -> Result<BytesResponse> {
        Ok(self.0.run_mobile_plugin("sign", payload)?)
    }
    pub fn seal(&self, payload: BytesRequest) -> Result<BytesResponse> {
        Ok(self.0.run_mobile_plugin("seal", payload)?)
    }
    pub fn open(&self, payload: BytesRequest) -> Result<BytesResponse> {
        Ok(self.0.run_mobile_plugin("open", payload)?)
    }
    pub fn delete(&self) -> Result<()> {
        Ok(self.0.run_mobile_plugin::<()>("delete", ())?)
    }
}
