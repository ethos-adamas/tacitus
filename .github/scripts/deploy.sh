#!/usr/bin/env bash
set -euo pipefail

component=${1:?component required}
image_tag=${2:?image tag required}

[[ $image_tag =~ ^[0-9a-f]{40}$ ]] || { echo "image tag must be a full commit SHA" >&2; exit 2; }
[[ ${DEPLOY_HOST:-} =~ ^[a-zA-Z0-9.-]+$ ]] || { echo "invalid DEPLOY_HOST" >&2; exit 2; }
: "${DEPLOY_SSH_KEY:?DEPLOY_SSH_KEY is required}"
: "${DEPLOY_KNOWN_HOSTS:?DEPLOY_KNOWN_HOSTS is required}"
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"

case "$component" in
  frontend)
    deployment=tacitus-frontend
    container=frontend
    image=ghcr.io/ethos-adamas/tacitus-fe:$image_tag
    ;;
  backend)
    deployment=tacitus-backend
    container=backend
    image=ghcr.io/ethos-adamas/tacitus-be:$image_tag
    ;;
  *)
    echo "component must be frontend or backend" >&2
    exit 2
    ;;
esac

install -m 700 -d "$RUNNER_TEMP/tacitus-ssh"
key_file=$RUNNER_TEMP/tacitus-ssh/key
known_hosts_file=$RUNNER_TEMP/tacitus-ssh/known_hosts
printf '%s\n' "$DEPLOY_SSH_KEY" > "$key_file"
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > "$known_hosts_file"
chmod 600 "$key_file" "$known_hosts_file"

ssh -i "$key_file" \
  -o BatchMode=yes \
  -o IdentitiesOnly=yes \
  -o UserKnownHostsFile="$known_hosts_file" \
  "root@$DEPLOY_HOST" \
  "kubectl -n tacitus set image deployment/$deployment $container=$image && kubectl -n tacitus rollout status deployment/$deployment --timeout=180s"
