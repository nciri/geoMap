.PHONY: check
check: web/node_modules
	cd shared && ./gradlew check
	cd server && ./gradlew check
	cd web && npm run check

web/node_modules: web/package-lock.json
	cd web && npm ci
	touch web/node_modules
