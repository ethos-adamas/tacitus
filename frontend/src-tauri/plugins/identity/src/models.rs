use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityResponse {
    pub public_key: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct IdentityRequest {
    pub nickname: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct BytesRequest {
    pub value: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct BytesResponse {
    pub value: String,
}
