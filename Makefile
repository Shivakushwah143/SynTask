COMPOSE_DEV := docker compose -f docker-compose.dev.yml
COMPOSE_PROD := docker compose -f docker-compose.prod.yml

.PHONY: up down logs build test lint clean restart validate

up:
	$(COMPOSE_DEV) up --build -d

down:
	$(COMPOSE_DEV) down

logs:
	$(COMPOSE_DEV) logs -f --tail=100

build:
	$(COMPOSE_DEV) build
	$(COMPOSE_PROD) build

test:
	$(COMPOSE_DEV) run --rm backend pytest
	$(COMPOSE_DEV) run --rm frontend npm test

lint:
	$(COMPOSE_DEV) run --rm backend python -m compileall app scripts
	$(COMPOSE_DEV) run --rm frontend npm run lint

clean:
	$(COMPOSE_DEV) down -v --remove-orphans

restart: down up

validate:
	$(COMPOSE_DEV) config >/dev/null
	GRAFANA_ADMIN_PASSWORD=validation-only $(COMPOSE_PROD) config >/dev/null
