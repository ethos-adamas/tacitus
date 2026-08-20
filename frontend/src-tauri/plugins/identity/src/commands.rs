use crate::{IdentityExt, Result, models::*};
use tauri::{AppHandle, Runtime, command};

#[command]
pub(crate) async fn get_or_create<R: Runtime>(
    app: AppHandle<R>,
    payload: IdentityRequest,
) -> Result<IdentityResponse> {
    app.identity().get_or_create(payload)
}

#[command]
pub(crate) async fn sign<R: Runtime>(
    app: AppHandle<R>,
    payload: BytesRequest,
) -> Result<BytesResponse> {
    app.identity().sign(payload)
}

#[command]
pub(crate) async fn seal<R: Runtime>(
    app: AppHandle<R>,
    payload: BytesRequest,
) -> Result<BytesResponse> {
    app.identity().seal(payload)
}

#[command]
pub(crate) async fn open<R: Runtime>(
    app: AppHandle<R>,
    payload: BytesRequest,
) -> Result<BytesResponse> {
    app.identity().open(payload)
}

#[command]
pub(crate) async fn delete<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.identity().delete()
}
