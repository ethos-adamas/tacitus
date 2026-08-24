use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use futures_util::{SinkExt, StreamExt};
use p256::ecdsa::{Signature, SigningKey, signature::Signer};
use serde_json::{Value, json};
use tacitus_backend::{
    application::ports::coordinatore_relay::CoordinatoreRelay,
    infrastructure::{
        actors::avvia_relay_actor, configurazione::Configurazione, websocket::crea_router,
    },
};
use tacitus_protocol::{IdentityDocument, authentication_payload};
use tokio::{net::TcpListener, sync::oneshot};
use tokio_tungstenite::{
    connect_async,
    tungstenite::{Message, client::IntoClientRequest, http::HeaderValue},
};

#[tokio::test]
async fn autentica_una_sessione_solo_dopo_la_sincronizzazione_dei_blocchi() {
    // Given
    let (relay, actor) = avvia_relay_actor(32);
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let router = crea_router(
        relay.clone(),
        Configurazione {
            indirizzo: address,
            origini_pubbliche: vec!["http://localhost".to_owned()],
        },
    );
    let (arresto, arresto_ricevuto) = oneshot::channel::<()>();
    let server = tokio::spawn(async move {
        axum::serve(listener, router)
            .with_graceful_shutdown(async move {
                let _ = arresto_ricevuto.await;
            })
            .await
            .unwrap();
    });
    let mut richiesta = format!("ws://{address}/ws").into_client_request().unwrap();
    richiesta
        .headers_mut()
        .insert("origin", HeaderValue::from_static("http://localhost"));
    let (mut socket, _) = connect_async(richiesta).await.unwrap();
    let signing_key = SigningKey::from_bytes((&[7_u8; 32]).into()).unwrap();
    let public_key = signing_key
        .verifying_key()
        .to_sec1_point(false)
        .as_bytes()
        .to_vec();
    let identity = IdentityDocument::new("Alice", public_key.clone()).unwrap();

    // When
    let challenge: Value = serde_json::from_str(
        socket
            .next()
            .await
            .unwrap()
            .unwrap()
            .into_text()
            .unwrap()
            .as_str(),
    )
    .unwrap();
    let nonce = URL_SAFE_NO_PAD
        .decode(challenge["nonce"].as_str().unwrap())
        .unwrap();
    let signature: Signature =
        signing_key.sign(&authentication_payload(&identity, &nonce).unwrap());
    socket
        .send(Message::Text(
            json!({
                "v": 3,
                "type": "auth.respond",
                "nickname": "Alice",
                "public_key": URL_SAFE_NO_PAD.encode(public_key),
                "signature": URL_SAFE_NO_PAD.encode(signature.to_bytes()),
            })
            .to_string()
            .into(),
        ))
        .await
        .unwrap();
    socket
        .send(Message::Text(
            json!({ "v": 3, "type": "contact.blocks.sync", "tacitus_ids": [] })
                .to_string()
                .into(),
        ))
        .await
        .unwrap();
    let ready: Value = serde_json::from_str(
        socket
            .next()
            .await
            .unwrap()
            .unwrap()
            .into_text()
            .unwrap()
            .as_str(),
    )
    .unwrap();

    // Then
    assert_eq!(challenge["type"], "auth.challenge");
    assert_eq!(challenge["v"], 3);
    assert_eq!(ready["type"], "auth.ready");
    assert_eq!(ready["nickname"], "alice");

    socket.close(None).await.unwrap();
    arresto.send(()).unwrap();
    server.await.unwrap();
    relay.arresta().await.unwrap();
    actor.await.unwrap();
}
