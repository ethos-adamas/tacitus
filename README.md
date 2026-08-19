# Tacitus

Chat effimera end-to-end encrypted. Il repository contiene due componenti indipendenti:

- `frontend/`: SPA React servita da Nginx;
- `backend/`: WebSocket Axum con stato esclusivamente in memoria;
- `deploy/`: manifest per una singola installazione K3s.

In produzione l'Ingress espone un solo origin: `/` va al frontend e `/ws` al backend.

## Sviluppo

```bash
npm --prefix frontend ci
npm --prefix frontend run dev
```

In un secondo terminale:

```bash
cd backend
cargo run
```

Vite inoltra `/ws` al backend su `localhost:3000`.

## Pipeline

Le modifiche in `frontend/**` e `backend/**` attivano workflow distinti. Le pull request eseguono controlli e verificano l'immagine; i push su `main` pubblicano immagini immutabili:

```text
ghcr.io/ethos-adamas/tacitus-fe:<commit-sha>
ghcr.io/ethos-adamas/tacitus-be:<commit-sha>
```

Il deploy SSH si abilita dopo il bootstrap del cluster impostando:

- variabili repository `DEPLOY_ENABLED=true` e `DEPLOY_HOST`;
- secret `DEPLOY_SSH_KEY` e `DEPLOY_KNOWN_HOSTS`.

Il workflow manuale `Deploy existing image` permette il rollback a uno SHA già pubblicato.

Dopo la prima pubblicazione, le due immagini vanno rese pubbliche una sola volta dalle impostazioni dei package GitHub.
