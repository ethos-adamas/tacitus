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
            proxy_fidati: vec![],
        },
    );
    let (arresto, arresto_ricevuto) = oneshot::channel::<()>();
    let server = tokio::spawn(async move {
        axum::serve(
            listener,
            router.into_make_service_with_connect_info::<std::net::SocketAddr>(),
        )
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

#[tokio::test]
async fn un_burst_pre_autenticazione_viene_rifiutato_senza_bloccare_health() {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    // Given
    let (relay, actor) = avvia_relay_actor(32);
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let router = crea_router(
        relay.clone(),
        Configurazione {
            indirizzo: address,
            origini_pubbliche: vec!["http://localhost".into()],
            proxy_fidati: vec![],
        },
    );
    let server = tokio::spawn(async move {
        axum::serve(
            listener,
            router.into_make_service_with_connect_info::<std::net::SocketAddr>(),
        )
        .await
        .unwrap();
    });
    let mut sockets = Vec::new();
    for _ in 0..8 {
        let mut request = format!("ws://{address}/ws").into_client_request().unwrap();
        request
            .headers_mut()
            .insert("origin", HeaderValue::from_static("http://localhost"));
        sockets.push(connect_async(request).await.unwrap().0);
    }
    // When
    let mut request = format!("ws://{address}/ws").into_client_request().unwrap();
    request
        .headers_mut()
        .insert("origin", HeaderValue::from_static("http://localhost"));
    let ninth = connect_async(request).await;
    // Then
    assert!(
        matches!(ninth, Err(tokio_tungstenite::tungstenite::Error::Http(ref response)) if response.status() == 429)
    );
    let mut health = tokio::net::TcpStream::connect(address).await.unwrap();
    health
        .write_all(b"GET /health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
        .await
        .unwrap();
    let mut response = String::new();
    tokio::time::timeout(
        std::time::Duration::from_secs(1),
        health.read_to_string(&mut response),
    )
    .await
    .unwrap()
    .unwrap();
    assert!(response.starts_with("HTTP/1.1 200"));
    drop(sockets);
    server.abort();
    relay.arresta().await.unwrap();
    actor.await.unwrap();
}

#[tokio::test]
async fn chiudere_e_riaprire_non_aggira_il_limite_dei_tentativi_per_ip() {
    // Given
    let (relay, actor) = avvia_relay_actor(32);
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let router = crea_router(
        relay.clone(),
        Configurazione {
            indirizzo: address,
            origini_pubbliche: vec!["http://localhost".into()],
            proxy_fidati: vec![],
        },
    );
    let server = tokio::spawn(async move {
        axum::serve(
            listener,
            router.into_make_service_with_connect_info::<std::net::SocketAddr>(),
        )
        .await
        .unwrap();
    });
    for _ in 0..120 {
        let mut request = format!("ws://{address}/ws").into_client_request().unwrap();
        request
            .headers_mut()
            .insert("origin", HeaderValue::from_static("http://localhost"));
        let (mut socket, _) = connect_async(request).await.unwrap();
        socket.next().await.unwrap().unwrap();
        socket.close(None).await.unwrap();
        while socket.next().await.is_some() {}
    }
    // When
    let mut request = format!("ws://{address}/ws").into_client_request().unwrap();
    request
        .headers_mut()
        .insert("origin", HeaderValue::from_static("http://localhost"));
    let result = connect_async(request).await;
    // Then
    assert!(
        matches!(result, Err(tokio_tungstenite::tungstenite::Error::Http(ref response)) if response.status() == 429)
    );
    server.abort();
    relay.arresta().await.unwrap();
    actor.await.unwrap();
}

#[tokio::test]
async fn il_limite_globale_pre_autenticazione_resiste_a_origini_distinte() {
    // Given
    let (relay, actor) = avvia_relay_actor(32);
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let router = crea_router(
        relay.clone(),
        Configurazione {
            indirizzo: address,
            origini_pubbliche: vec!["http://localhost".into()],
            proxy_fidati: vec![],
        },
    );
    let server = tokio::spawn(async move {
        axum::serve(
            listener,
            router.into_make_service_with_connect_info::<std::net::SocketAddr>(),
        )
        .await
        .unwrap();
    });
    let mut sockets = Vec::new();
    for n in 0..=64 {
        let tcp = tokio::net::TcpSocket::new_v4().unwrap();
        tcp.bind(std::net::SocketAddr::from(([127, 0, 0, 2 + n / 8], 0)))
            .unwrap();
        let stream = tcp.connect(address).await.unwrap();
        let mut request = format!("ws://{address}/ws").into_client_request().unwrap();
        request
            .headers_mut()
            .insert("origin", HeaderValue::from_static("http://localhost"));
        // When
        let result = tokio_tungstenite::client_async(request, stream).await;
        // Then
        if n == 64 {
            assert!(
                matches!(result, Err(tokio_tungstenite::tungstenite::Error::Http(ref response)) if response.status() == 503)
            );
        } else {
            sockets.push(result.unwrap().0);
        }
    }
    drop(sockets);
    server.abort();
    relay.arresta().await.unwrap();
    actor.await.unwrap();
}

#[tokio::test]
async fn un_proxy_esplicitamente_fidato_separa_i_limiti_dei_client() {
    // Given
    let (relay, actor) = avvia_relay_actor(32);
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let router = crea_router(
        relay.clone(),
        Configurazione {
            indirizzo: address,
            origini_pubbliche: vec!["http://localhost".into()],
            proxy_fidati: vec!["127.0.0.1".parse().unwrap()],
        },
    );
    let server = tokio::spawn(async move {
        axum::serve(
            listener,
            router.into_make_service_with_connect_info::<std::net::SocketAddr>(),
        )
        .await
        .unwrap();
    });
    let mut sockets = Vec::new();
    // When / Then
    for n in 0..16 {
        let mut request = format!("ws://{address}/ws").into_client_request().unwrap();
        request
            .headers_mut()
            .insert("origin", HeaderValue::from_static("http://localhost"));
        request.headers_mut().insert(
            "x-forwarded-for",
            HeaderValue::from_str(if n < 8 { "192.0.2.1" } else { "192.0.2.2" }).unwrap(),
        );
        sockets.push(connect_async(request).await.unwrap().0);
    }
    drop(sockets);
    server.abort();
    relay.arresta().await.unwrap();
    actor.await.unwrap();
}
