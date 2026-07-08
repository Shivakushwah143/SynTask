#!/usr/bin/env sh
set -eu

repo_root="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$repo_root"

ensure_env_file() {
    example_path="$1"
    target_path="$2"

    if [ ! -f "$target_path" ]; then
        cp "$example_path" "$target_path"
        printf 'Created %s from %s\n' "$target_path" "$example_path"
    fi
}

ensure_env_file "backend/.env.example" "backend/.env"
ensure_env_file "frontend/.env.example" "frontend/.env"

if [ "${1:-}" = "--prod" ]; then
    docker compose -f docker-compose.prod.yml config >/dev/null
    docker compose -f docker-compose.prod.yml up --build -d
    printf 'Production stack started.\n'
    printf 'Public URL: http://localhost\n'
    printf 'Backend health: http://localhost/health (proxied through Nginx)\n'
else
    docker compose -f docker-compose.dev.yml config >/dev/null
    docker compose -f docker-compose.dev.yml up --build -d
    printf 'Development stack started.\n'
    printf 'Frontend: http://localhost:3000\n'
    printf 'Backend: http://localhost:8000\n'
fi

printf "Use 'make logs' or 'docker compose -f docker-compose.dev.yml logs -f' to follow logs.\n"
