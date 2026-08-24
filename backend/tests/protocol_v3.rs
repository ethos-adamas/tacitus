use tacitus_backend::{
    domain::identita::TacitusId,
    infrastructure::protocol_v3::{ErroreFrame, FrameClient, parse_frame_client},
};

#[test]
fn rifiuta_frame_v2_senza_percorso_di_compatibilita() {
    // Given
    let frame = r#"{"v":2,"type":"contact.add","request_id":"r1","tacitus_id":"2g2dx6p1750pj6eq37t0q94yjc"}"#;

    // When
    let risultato = parse_frame_client(frame);

    // Then
    assert_eq!(risultato, Err(ErroreFrame::VersioneNonSupportata));
}

#[test]
fn canonicalizza_il_tacitus_id_al_confine_del_protocollo() {
    // Given
    let frame = r#"{"v":3,"type":"contact.add","request_id":"r1","tacitus_id":"2g2dx6p1750pj6eq37t0q94yjc"}"#;

    // When
    let risultato = parse_frame_client(frame).unwrap();

    // Then
    assert!(matches!(
        risultato,
        FrameClient::CreaIntento { destinatario, .. }
            if destinatario == "2G2DX-6P175-0PJ6E-Q37T0-Q94YJC".parse::<TacitusId>().unwrap()
    ));
}

#[test]
fn legge_la_sincronizzazione_iniziale_dei_blocchi() {
    // Given
    let frame =
        r#"{"v":3,"type":"contact.blocks.sync","tacitus_ids":["2G2DX-6P175-0PJ6E-Q37T0-Q94YJC"]}"#;

    // When
    let risultato = parse_frame_client(frame).unwrap();

    // Then
    assert!(matches!(
        risultato,
        FrameClient::SincronizzaBlocchi { blocchi } if blocchi.len() == 1
    ));
}
