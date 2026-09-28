.PHONY: check
check: web/node_modules
	cd shared && ./gradlew check
	cd server && ./gradlew check
	cd web && npm run check

web/node_modules: web/package-lock.json
	cd web && npm ci
	touch web/node_modules

.PHONY: e2e
e2e: web/node_modules
	cd web && node e2e/setup-env.mjs && npx playwright install chromium
	cd web && docker compose --env-file e2e/.env.e2e -f e2e/compose.yml up -d --wait
	cd web && npm run e2e; status=$$?; docker compose --env-file e2e/.env.e2e -f e2e/compose.yml down -v; exit $$status
