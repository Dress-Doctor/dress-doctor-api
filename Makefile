# ---------- ENVIRONMENT COMMANDS ----------
up-staging:
	docker compose -f docker-compose.stage.yml -p dress-doctor-stage up -d --build

down-staging:
	docker compose -f docker-compose.stage.yml -p dress-doctor-stage down

logs-staging:
	docker compose -f docker-compose.stage.yml -p dress-doctor-stage logs -f

ps-staging:
	docker compose -f docker-compose.stage.yml -p dress-doctor-stage ps

up-prod:
	docker compose -f docker-compose.yml -p dress-doctor-prod up -d --build

down-prod:
	docker compose -f docker-compose.yml -p dress-doctor-prod down

logs-prod:
	docker compose -f docker-compose.yml -p dress-doctor-prod logs -f

ps-prod:
	docker compose -f docker-compose.yml -p dress-doctor-prod ps
