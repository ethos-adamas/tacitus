use wasm_bindgen::prelude::*;

use crate::{ProtocolError, error, js_error};

pub fn encode_webp(rgba: &[u8], width: u32, height: u32) -> Result<Vec<u8>, ProtocolError> {
    if width == 0
        || height == 0
        || width > 2048
        || height > 2048
        || rgba.len() != width as usize * height as usize * 4
    {
        return Err(error("invalid image dimensions"));
    }
    let mut encoded = Vec::new();
    image_webp::WebPEncoder::new(&mut encoded)
        .encode(rgba, width, height, image_webp::ColorType::Rgba8)
        .map_err(|_| error("WebP encoding failed"))?;
    if encoded.len() > 5 * 1024 * 1024 {
        return Err(error("image exceeds 5 MiB"));
    }
    Ok(encoded)
}

#[wasm_bindgen(js_name = encodeWebP)]
pub fn encode_webp_js(rgba: &[u8], width: u32, height: u32) -> Result<Vec<u8>, JsValue> {
    encode_webp(rgba, width, height).map_err(js_error)
}
