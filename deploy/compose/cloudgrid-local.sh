#!/usr/bin/env sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
compose_file="${script_dir}/cloudgrid.compose.yaml"
env_file="${script_dir}/.env"
env_example="${script_dir}/cloudgrid.env.example"

command="${1:-up}"

ensure_env() {
  if [ ! -f "${env_file}" ]; then
    cp "${env_example}" "${env_file}"
    printf 'Created %s from cloudgrid.env.example\n' "${env_file}"
  fi
}

compose() {
  docker compose --env-file "${env_file}" -f "${compose_file}" "$@"
}

case "${command}" in
  up)
    ensure_env
    compose up -d
    printf '\nCloudGrid is starting. Open http://localhost:3000\n'
    ;;
  pull)
    ensure_env
    compose pull
    ;;
  down)
    ensure_env
    compose down
    ;;
  reset)
    ensure_env
    compose down -v
    ;;
  status)
    ensure_env
    compose ps
    ;;
  logs)
    ensure_env
    shift || true
    compose logs -f "$@"
    ;;
  *)
    cat <<'EOF'
Usage: ./cloudgrid-local.sh <command>

Commands:
  up      Create .env when missing and start CloudGrid
  pull    Pull configured CloudGrid images
  down    Stop CloudGrid
  reset   Stop CloudGrid and remove local NATS/SurrealDB volumes
  status  Show service status
  logs    Follow service logs
EOF
    exit 2
    ;;
esac
