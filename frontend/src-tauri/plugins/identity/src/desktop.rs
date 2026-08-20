use crate::{Error, Result, models::*};
use serde::de::DeserializeOwned;
use tauri::{AppHandle, Runtime, plugin::PluginApi};

pub struct Identity<R: Runtime>(AppHandle<R>);

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> Result<Identity<R>> {
    Ok(Identity(app.clone()))
}

impl<R: Runtime> Identity<R> {
    pub fn get_or_create(&self, _: IdentityRequest) -> Result<IdentityResponse> {
        Err(Error::Unsupported)
    }
    pub fn sign(&self, _: BytesRequest) -> Result<BytesResponse> {
        Err(Error::Unsupported)
    }
    pub fn seal(&self, _: BytesRequest) -> Result<BytesResponse> {
        Err(Error::Unsupported)
    }
    pub fn open(&self, _: BytesRequest) -> Result<BytesResponse> {
        Err(Error::Unsupported)
    }
    pub fn delete(&self) -> Result<()> {
        Err(Error::Unsupported)
    }
}
