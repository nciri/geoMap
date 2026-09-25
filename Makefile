.PHONY: check
check:
	cd shared && ./gradlew check
	cd server && ./gradlew check
