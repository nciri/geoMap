# Server Foundation Implementation Plan (plan 2a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `server/`, the Spring Boot service that stores draft missions and their map objects, protects them with Keycloak roles, records an audit trail, and exposes health, Prometheus metrics and an OpenAPI description.

**Architecture:** A standalone Gradle build in `server/` (Kotlin, Spring Boot 4.1, Spring MVC). Persistence uses `JdbcClient` with explicit SQL and Flyway migrations on PostgreSQL; JSON columns are `jsonb`. Security is an OAuth2 resource server validating Keycloak JWTs; realm roles become Spring authorities. An AI agent is an ordinary caller whose token carries an RFC 8693 `act` claim: it can only create suggestions, never accept them. Integration tests run against a real PostgreSQL through Testcontainers.

**Tech Stack:** Kotlin 2.2.20, Spring Boot 4.1.0 (starters `webmvc`, `jdbc`, `flyway`, `actuator`, `security-oauth2-resource-server`), Jackson 3 (`tools.jackson`), PostgreSQL 16, Flyway, Testcontainers, spring-security-test, Micrometer Prometheus, springdoc-openapi 3.x, ktlint Gradle plugin 12.1.2, Gradle 8.14.3 wrapper, JVM toolchain 17.

**Spec:** `docs/superpowers/specs/2026-09-25-geomap-v1-core-design.md` (sections 3, 4, 5, 7.3, 9, 11, 12)

**Plan series:** sub-project 1 server = 2a (this plan: foundation, missions, features, audit) → 2b (APP-6D rendering + validator) → 2c (publication, packages via `shared/`, distribution) → 2d (device enrollment, mTLS, PKI adapter — PKI interface still undetermined). Out of scope here: publication, versions, devices, basemaps, rendering.

## Global Constraints

- Spring Boot 4.1.0, Kotlin 2.2.20, JVM toolchain 17, Gradle 8.14.3 wrapper. Package root `geomap.server`.
- Air-gapped deployment: no runtime call to any external service except the ALIAS Keycloak JWKS endpoint.
- Keycloak realm roles (claim `realm_access.roles`): `planificateur` (missions and objects), `administrateur` (audit). Spring authorities are `ROLE_<role>`.
- An AI agent is identified by the RFC 8693 `act` claim (`act.sub`). Objects created by an agent are `origin = AI_SUGGESTED`, `suggestion_status = PENDING`. Only a human can accept or reject a suggestion. Agents cannot delete missions and can only change their own pending suggestions.
- Mission statuses `DRAFT`, `PUBLISHED`, `WITHDRAWN`. Any change to a mission or its objects sends it back to `DRAFT` (spec §5.3). A `WITHDRAWN` mission cannot be changed (409).
- Geometries are GeoJSON in WGS 84: `Point`, `LineString`, `Polygon`. A generic circle is a `Point` with `style.radiusMeters > 0`. APP-6D SIDC: exactly 20 digits.
- Dates are UTC instants (ISO 8601 in JSON, `timestamptz` in SQL).
- Logs and audit details never contain keys or mission content (names, descriptions, geometry).
- Secrets come from environment variables / Kubernetes Secrets; `.env.example` documents every variable; nothing hard-coded.
- Errors are RFC 9457 `ProblemDetail` responses: 400 invalid input, 403 forbidden action, 404 unknown id, 409 state conflict.
- Conventional Commits, no AI attribution in commit messages. Quality gate: `make check` (ktlint + tests of `shared/` and `server/`). Tests need Docker (Testcontainers).

## Review Focus

- An agent token trying to accept or reject a suggestion (even its own) must get 403 and change nothing. (Task 6.)
- Editing a `WITHDRAWN` mission or adding an object to it must get 409 and leave it withdrawn — never silently reactivate it. (Tasks 5 and 6.)
- Invalid GeoJSON (unclosed ring, latitude out of range, unsupported type, one-point line) must get 400 with a message and store nothing. (Tasks 2 and 6.)
- A request without a token gets 401; a valid token without the needed role gets 403. (Tasks 4, 5, 7.)
- An unknown mission or object id gets 404 on every route, never 500. (Tasks 5 and 6.)

## File Structure

| File | Responsibility |
|---|---|
| `Makefile` | quality gate now covers `shared/` and `server/` |
| `.env.example` | documents server environment variables |
| `server/settings.gradle.kts`, `server/build.gradle.kts` | standalone Gradle build |
| `server/src/main/kotlin/geomap/server/GeomapApplication.kt` | entry point, `Clock` bean |
| `server/src/main/kotlin/geomap/server/web/ApiExceptions.kt` | domain exceptions mapped to HTTP statuses |
| `server/src/main/kotlin/geomap/server/web/ApiErrorHandler.kt` | exceptions → `ProblemDetail` |
| `server/src/main/kotlin/geomap/server/db/JdbcSupport.kt` | `Instant` ↔ `timestamptz` helpers |
| `server/src/main/kotlin/geomap/server/security/SecurityConfig.kt` | filter chain, resource server, method security |
| `server/src/main/kotlin/geomap/server/security/KeycloakRoles.kt` | Keycloak JWT → authorities |
| `server/src/main/kotlin/geomap/server/security/Actor.kt` | who acts: user and optional agent |
| `server/src/main/kotlin/geomap/server/mission/GeoJsonGeometry.kt` | GeoJSON validation + bounding box |
| `server/src/main/kotlin/geomap/server/mission/Mission.kt` | mission and feature models |
| `server/src/main/kotlin/geomap/server/mission/MissionRepository.kt` | mission SQL |
| `server/src/main/kotlin/geomap/server/mission/FeatureRepository.kt` | feature SQL |
| `server/src/main/kotlin/geomap/server/mission/MissionService.kt` | mission rules + audit |
| `server/src/main/kotlin/geomap/server/mission/FeatureService.kt` | feature rules, suggestions + audit |
| `server/src/main/kotlin/geomap/server/mission/MissionController.kt` | `/api/missions` |
| `server/src/main/kotlin/geomap/server/mission/FeatureController.kt` | `/api/missions/{missionId}/features` |
| `server/src/main/kotlin/geomap/server/audit/AuditRepository.kt` | audit model + SQL |
| `server/src/main/kotlin/geomap/server/audit/AuditController.kt` | `/api/audit` |
| `server/src/main/resources/application.yml` | configuration |
| `server/src/main/resources/db/migration/V1__core.sql` | schema |
| `server/src/test/kotlin/geomap/server/...` | tests, plus `TestcontainersConfiguration`, `IntegrationTest` base |
| `server/src/test/resources/application-test.yml` | test-only configuration |

## Notes for implementers

- Spring Boot 4 uses Jackson 3: packages are `tools.jackson.*` (not `com.fasterxml.jackson.*`), the Kotlin module is `tools.jackson.module:jackson-module-kotlin`.
- Spring Boot 4.1 manages Testcontainers 2.x: artifacts are `org.testcontainers:testcontainers-postgresql` / `testcontainers-junit-jupiter` and the class is `org.testcontainers.postgresql.PostgreSQLContainer` (not generic). If the managed version turns out to be 1.x, use `org.testcontainers:postgresql`, `org.testcontainers.containers.PostgreSQLContainer<*>`, and report it.
- If an API named in this plan does not compile against Spring Boot 4.1, check the official docs (context7 library `/spring-projects/spring-boot/v4.1.0`), make the smallest equivalent change, and report the deviation as DONE_WITH_CONCERNS.
- Tests create MockMvc from the `WebApplicationContext` (core Spring API) instead of Boot test auto-configuration annotations, whose packages moved in Boot 4.
- Disk space on the dev machine is low (~10 GB free): do not pull Docker images other than `postgres:16-alpine`.

---

### Task 1: Server build, health endpoint, test harness

**Files:**
- Create: `server/settings.gradle.kts`, `server/build.gradle.kts`, `server/src/main/kotlin/geomap/server/GeomapApplication.kt`, `server/src/main/resources/application.yml`, `.env.example`
- Modify: `Makefile`
- Test: `server/src/test/kotlin/geomap/server/TestcontainersConfiguration.kt`, `server/src/test/kotlin/geomap/server/IntegrationTest.kt`, `server/src/test/kotlin/geomap/server/HealthTest.kt`

**Interfaces:**
- Produces: `GeomapApplication` with a `Clock` bean (`Clock.systemUTC()`); test base `abstract class IntegrationTest` exposing `protected lateinit var mvc: MockMvc`; `TestcontainersConfiguration` providing a `@ServiceConnection` PostgreSQL 16 container.

- [ ] **Step 1: Create the build files**

`server/settings.gradle.kts`:

```kotlin
pluginManagement {
    repositories {
        gradlePluginPortal()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositories {
        mavenCentral()
    }
}

rootProject.name = "geomap-server"
```

`server/build.gradle.kts`:

```kotlin
plugins {
    kotlin("jvm") version "2.2.20"
    kotlin("plugin.spring") version "2.2.20"
    id("org.springframework.boot") version "4.1.0"
    id("io.spring.dependency-management") version "1.1.7"
    id("org.jlleitschuh.gradle.ktlint") version "12.1.2"
}

group = "geomap"
version = "0.1.0"

kotlin {
    jvmToolchain(17)
    compilerOptions {
        freeCompilerArgs.add("-Xjsr305=strict")
    }
}

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-webmvc")
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.springframework.boot:spring-boot-starter-jdbc")
    implementation("org.springframework.boot:spring-boot-starter-flyway")
    implementation("org.flywaydb:flyway-database-postgresql")
    implementation("tools.jackson.module:jackson-module-kotlin")
    implementation("org.jetbrains.kotlin:kotlin-reflect")
    runtimeOnly("org.postgresql:postgresql")

    testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
    testImplementation("org.springframework.boot:spring-boot-testcontainers")
    testImplementation("org.testcontainers:testcontainers-postgresql")
    testImplementation("org.testcontainers:testcontainers-junit-jupiter")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit5")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.test {
    useJUnitPlatform()
}
```

`Makefile` (recipe lines start with a TAB):

```makefile
.PHONY: check
check:
	cd shared && ./gradlew check
	cd server && ./gradlew check
```

`.env.example`:

```bash
# geoMap server — Spring Boot reads these through relaxed binding.
# On ALIAS the real values come from Kubernetes Secrets; never commit them.
SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/geomap
SPRING_DATASOURCE_USERNAME=geomap
SPRING_DATASOURCE_PASSWORD=change-me
# ALIAS Keycloak realm issuer (its JWKS endpoint is the only outbound call).
SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUER_URI=https://keycloak.alias.example/realms/geomap
```

- [ ] **Step 2: Generate the Gradle wrapper from the cached distribution**

```bash
GRADLE_BIN=$(ls -d ~/.gradle/wrapper/dists/gradle-8.14.3-bin/*/gradle-8.14.3/bin/gradle | head -1)
cd server && "$GRADLE_BIN" wrapper --gradle-version 8.14.3
```

Then add the same checksum line as `shared/gradle/wrapper/gradle-wrapper.properties` to `server/gradle/wrapper/gradle-wrapper.properties`:

```properties
distributionSha256Sum=bd71102213493060956ec229d946beee57158dbd89d0e62b91bca0fa2c5f3531
```

Expected: `server/gradlew` exists, `cd server && ./gradlew --version` prints Gradle 8.14.3.

- [ ] **Step 3: Write the test harness and the failing test**

`server/src/test/kotlin/geomap/server/TestcontainersConfiguration.kt`:

```kotlin
package geomap.server

import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.testcontainers.service.connection.ServiceConnection
import org.springframework.context.annotation.Bean
import org.testcontainers.postgresql.PostgreSQLContainer

@TestConfiguration(proxyBeanMethods = false)
class TestcontainersConfiguration {
    @Bean
    @ServiceConnection
    fun postgres(): PostgreSQLContainer = PostgreSQLContainer("postgres:16-alpine")
}
```

`server/src/test/kotlin/geomap/server/IntegrationTest.kt`:

```kotlin
package geomap.server

import org.junit.jupiter.api.BeforeEach
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.context.WebApplicationContext

@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration::class)
abstract class IntegrationTest {
    @Autowired
    private lateinit var context: WebApplicationContext

    protected lateinit var mvc: MockMvc

    @BeforeEach
    fun setUpMvc() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build()
    }
}
```

`server/src/test/kotlin/geomap/server/HealthTest.kt`:

```kotlin
package geomap.server

import org.junit.jupiter.api.Test
import org.springframework.test.web.servlet.get

class HealthTest : IntegrationTest() {
    @Test
    fun `health endpoint reports UP`() {
        mvc.get("/actuator/health").andExpect {
            status { isOk() }
            jsonPath("$.status") { value("UP") }
        }
    }
}
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd server && ./gradlew test --tests geomap.server.HealthTest`
Expected: FAIL — "Unable to find a @SpringBootConfiguration" (no application class yet).

- [ ] **Step 5: Write the application**

`server/src/main/kotlin/geomap/server/GeomapApplication.kt`:

```kotlin
package geomap.server

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.context.annotation.Bean
import java.time.Clock

@SpringBootApplication
class GeomapApplication {
    @Bean
    fun clock(): Clock = Clock.systemUTC()
}

fun main(args: Array<String>) {
    runApplication<GeomapApplication>(*args)
}
```

`server/src/main/resources/application.yml`:

```yaml
spring:
  application:
    name: geomap-server
management:
  endpoints:
    web:
      exposure:
        include: health
```

- [ ] **Step 6: Run the quality gate**

Run: `cd server && ./gradlew ktlintFormat && cd .. && make check`
Expected: `BUILD SUCCESSFUL` for both builds; `HealthTest` passes (first run pulls `postgres:16-alpine`).

- [ ] **Step 7: Commit**

```bash
git add Makefile .env.example server
git commit -m "feat(server): add Spring Boot build with health endpoint"
```

---

### Task 2: GeoJSON validation

**Files:**
- Create: `server/src/main/kotlin/geomap/server/web/ApiExceptions.kt`, `server/src/main/kotlin/geomap/server/mission/GeoJsonGeometry.kt`
- Test: `server/src/test/kotlin/geomap/server/mission/GeoJsonGeometryTest.kt`

**Interfaces:**
- Produces: `class InvalidInputException(message: String)`, `class NotFoundException(message: String)`, `class ConflictException(message: String)`, `class ForbiddenException(message: String)` (all `RuntimeException`, package `geomap.server.web`); `data class BBox(minLon: Double, minLat: Double, maxLon: Double, maxLat: Double)`; `GeoJsonGeometry.validate(geometry: Map<String, Any?>): BBox` (throws `InvalidInputException`). Messages used by later tests: `"at least <n> positions are required"`, `"a polygon ring must be closed"`.

- [ ] **Step 1: Write the failing test**

`server/src/test/kotlin/geomap/server/mission/GeoJsonGeometryTest.kt`:

```kotlin
package geomap.server.mission

import geomap.server.web.InvalidInputException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class GeoJsonGeometryTest {
    private fun geometry(
        type: String,
        coordinates: Any?,
    ) = mapOf("type" to type, "coordinates" to coordinates)

    private val square = listOf(listOf(2.0, 48.0), listOf(3.0, 48.0), listOf(3.0, 49.0), listOf(2.0, 49.0), listOf(2.0, 48.0))

    @Test
    fun `a point has a degenerate bounding box`() {
        assertEquals(BBox(2.35, 48.85, 2.35, 48.85), GeoJsonGeometry.validate(geometry("Point", listOf(2.35, 48.85))))
    }

    @Test
    fun `a point may carry an altitude`() {
        assertEquals(BBox(2.35, 48.85, 2.35, 48.85), GeoJsonGeometry.validate(geometry("Point", listOf(2.35, 48.85, 120.0))))
    }

    @Test
    fun `a line string spans its positions`() {
        val line = geometry("LineString", listOf(listOf(2.0, 48.5), listOf(3.5, 48.0)))
        assertEquals(BBox(2.0, 48.0, 3.5, 48.5), GeoJsonGeometry.validate(line))
    }

    @Test
    fun `a closed polygon is accepted`() {
        assertEquals(BBox(2.0, 48.0, 3.0, 49.0), GeoJsonGeometry.validate(geometry("Polygon", listOf(square))))
    }

    @Test
    fun `accepts integer coordinates`() {
        assertEquals(BBox(2.0, 48.0, 2.0, 48.0), GeoJsonGeometry.validate(geometry("Point", listOf(2, 48))))
    }

    @Test
    fun `rejects an unclosed polygon ring`() {
        val open = square.dropLast(1)
        val error = assertFailsWith<InvalidInputException> { GeoJsonGeometry.validate(geometry("Polygon", listOf(open))) }
        assertEquals("a polygon ring must be closed", error.message)
    }

    @Test
    fun `rejects a ring with fewer than four positions`() {
        val triangle = listOf(listOf(2.0, 48.0), listOf(3.0, 48.0), listOf(2.0, 48.0))
        assertFailsWith<InvalidInputException> { GeoJsonGeometry.validate(geometry("Polygon", listOf(triangle))) }
    }

    @Test
    fun `rejects a line with a single position`() {
        assertFailsWith<InvalidInputException> { GeoJsonGeometry.validate(geometry("LineString", listOf(listOf(2.0, 48.0)))) }
    }

    @Test
    fun `rejects a latitude out of range`() {
        assertFailsWith<InvalidInputException> { GeoJsonGeometry.validate(geometry("Point", listOf(2.0, 91.0))) }
    }

    @Test
    fun `rejects a longitude out of range`() {
        assertFailsWith<InvalidInputException> { GeoJsonGeometry.validate(geometry("Point", listOf(-181.0, 0.0))) }
    }

    @Test
    fun `rejects an unsupported type`() {
        assertFailsWith<InvalidInputException> { GeoJsonGeometry.validate(geometry("MultiPoint", listOf(listOf(2.0, 48.0)))) }
    }

    @Test
    fun `rejects non numeric coordinates`() {
        assertFailsWith<InvalidInputException> { GeoJsonGeometry.validate(geometry("Point", listOf("2.0", 48.0))) }
    }

    @Test
    fun `rejects missing coordinates`() {
        assertFailsWith<InvalidInputException> { GeoJsonGeometry.validate(mapOf("type" to "Point")) }
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd server && ./gradlew test --tests geomap.server.mission.GeoJsonGeometryTest`
Expected: FAIL, compilation error `Unresolved reference 'BBox'`.

- [ ] **Step 3: Write the implementation**

`server/src/main/kotlin/geomap/server/web/ApiExceptions.kt`:

```kotlin
package geomap.server.web

class InvalidInputException(
    message: String,
) : RuntimeException(message)

class NotFoundException(
    message: String,
) : RuntimeException(message)

class ConflictException(
    message: String,
) : RuntimeException(message)

class ForbiddenException(
    message: String,
) : RuntimeException(message)
```

`server/src/main/kotlin/geomap/server/mission/GeoJsonGeometry.kt`:

```kotlin
package geomap.server.mission

import geomap.server.web.InvalidInputException

data class BBox(
    val minLon: Double,
    val minLat: Double,
    val maxLon: Double,
    val maxLat: Double,
)

object GeoJsonGeometry {
    fun validate(geometry: Map<String, Any?>): BBox {
        val coordinates = geometry["coordinates"]
        val positions =
            when (val type = geometry["type"]) {
                "Point" -> listOf(position(coordinates))
                "LineString" -> positions(coordinates, minSize = 2)
                "Polygon" -> polygon(coordinates)
                else -> invalid("unsupported geometry type: $type")
            }
        return BBox(
            minLon = positions.minOf { it.first },
            minLat = positions.minOf { it.second },
            maxLon = positions.maxOf { it.first },
            maxLat = positions.maxOf { it.second },
        )
    }

    private fun position(value: Any?): Pair<Double, Double> {
        val list = value as? List<*> ?: invalid("a position must be an array")
        if (list.size !in 2..3) invalid("a position must have 2 or 3 numbers")
        val numbers = list.map { (it as? Number)?.toDouble() ?: invalid("a position must contain numbers") }
        val lon = numbers[0]
        val lat = numbers[1]
        if (lon !in -180.0..180.0 || lat !in -90.0..90.0) invalid("position out of range: $lon, $lat")
        return lon to lat
    }

    private fun positions(
        value: Any?,
        minSize: Int,
    ): List<Pair<Double, Double>> {
        val list = value as? List<*> ?: invalid("coordinates must be an array")
        if (list.size < minSize) invalid("at least $minSize positions are required")
        return list.map(::position)
    }

    private fun polygon(value: Any?): List<Pair<Double, Double>> {
        val rings = value as? List<*> ?: invalid("coordinates must be an array")
        if (rings.isEmpty()) invalid("a polygon needs an outer ring")
        return rings.flatMap { ring ->
            val ringPositions = positions(ring, minSize = 4)
            if (ringPositions.first() != ringPositions.last()) invalid("a polygon ring must be closed")
            ringPositions
        }
    }

    private fun invalid(message: String): Nothing = throw InvalidInputException(message)
}
```

- [ ] **Step 4: Run the quality gate**

Run: `cd server && ./gradlew ktlintFormat && cd .. && make check`
Expected: `BUILD SUCCESSFUL`, 13 new tests pass.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(server): validate GeoJSON geometries"
```

---

### Task 3: Schema and repositories

**Files:**
- Create: `server/src/main/resources/db/migration/V1__core.sql`, `server/src/main/kotlin/geomap/server/db/JdbcSupport.kt`, `server/src/main/kotlin/geomap/server/mission/Mission.kt`, `server/src/main/kotlin/geomap/server/mission/MissionRepository.kt`, `server/src/main/kotlin/geomap/server/mission/FeatureRepository.kt`, `server/src/main/kotlin/geomap/server/audit/AuditRepository.kt`
- Modify: `server/src/test/kotlin/geomap/server/IntegrationTest.kt` (truncate tables before each test)
- Test: `server/src/test/kotlin/geomap/server/mission/RepositoryTest.kt`

**Interfaces:**
- Consumes: `BBox` (Task 2).
- Produces:
  - `enum class MissionStatus { DRAFT, PUBLISHED, WITHDRAWN }`, `enum class FeatureKind { GENERIC, APP6 }`, `enum class FeatureOrigin { HUMAN, AI_SUGGESTED }`, `enum class SuggestionStatus { PENDING, ACCEPTED, REJECTED }`
  - `data class Mission(id: UUID, name: String, status: MissionStatus, basemapId: String?, validUntil: Instant?, createdBy: String, updatedBy: String, createdAt: Instant, updatedAt: Instant)`
  - `data class Feature(id: UUID, missionId: UUID, kind: FeatureKind, geometry: Map<String, Any?>, bbox: BBox, name: String, description: String, style: Map<String, Any?>?, sidc: String?, modifiers: Map<String, String>?, origin: FeatureOrigin, suggestionStatus: SuggestionStatus?, createdAt: Instant, updatedAt: Instant)`
  - `MissionRepository.insert(Mission)`, `.update(Mission)`, `.find(UUID): Mission?`, `.findAll(): List<Mission>` (newest `updated_at` first), `.delete(UUID)`
  - `FeatureRepository.insert(Feature)`, `.update(Feature)`, `.find(missionId: UUID, id: UUID): Feature?`, `.findByMission(missionId: UUID): List<Feature>` (oldest first), `.delete(UUID)`
  - `data class AuditEvent(at: Instant, actorUser: String, actorAgent: String?, action: String, target: String, details: Map<String, Any?>)`, `AuditRepository.record(AuditEvent)`, `.latest(limit: Int): List<AuditEvent>` (newest first)
  - `fun Instant.toUtc(): OffsetDateTime`, `fun ResultSet.instant(column: String): Instant?` (package `geomap.server.db`)
  - Test base `IntegrationTest` also exposes `protected lateinit var jdbc: JdbcClient`.

- [ ] **Step 1: Write the migration**

`server/src/main/resources/db/migration/V1__core.sql`:

```sql
CREATE TABLE mission (
    id          UUID PRIMARY KEY,
    name        TEXT        NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
    status      TEXT        NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED', 'WITHDRAWN')),
    basemap_id  TEXT,
    valid_until TIMESTAMPTZ,
    created_by  TEXT        NOT NULL,
    updated_by  TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL
);

CREATE TABLE feature (
    id                UUID PRIMARY KEY,
    mission_id        UUID             NOT NULL REFERENCES mission (id) ON DELETE CASCADE,
    kind              TEXT             NOT NULL CHECK (kind IN ('GENERIC', 'APP6')),
    geometry          JSONB            NOT NULL,
    min_lon           DOUBLE PRECISION NOT NULL,
    min_lat           DOUBLE PRECISION NOT NULL,
    max_lon           DOUBLE PRECISION NOT NULL,
    max_lat           DOUBLE PRECISION NOT NULL,
    name              TEXT             NOT NULL,
    description       TEXT             NOT NULL,
    style             JSONB,
    sidc              TEXT,
    modifiers         JSONB,
    origin            TEXT             NOT NULL CHECK (origin IN ('HUMAN', 'AI_SUGGESTED')),
    suggestion_status TEXT CHECK (suggestion_status IN ('PENDING', 'ACCEPTED', 'REJECTED')),
    created_at        TIMESTAMPTZ      NOT NULL,
    updated_at        TIMESTAMPTZ      NOT NULL,
    CHECK ((origin = 'HUMAN') = (suggestion_status IS NULL)),
    CHECK ((kind = 'APP6') = (sidc IS NOT NULL))
);

CREATE INDEX feature_mission_idx ON feature (mission_id);

CREATE TABLE audit_event (
    id          BIGSERIAL PRIMARY KEY,
    at          TIMESTAMPTZ NOT NULL,
    actor_user  TEXT        NOT NULL,
    actor_agent TEXT,
    action      TEXT        NOT NULL,
    target      TEXT        NOT NULL,
    details     JSONB       NOT NULL
);
```

- [ ] **Step 2: Update the test base and write the failing test**

Replace `server/src/test/kotlin/geomap/server/IntegrationTest.kt` with:

```kotlin
package geomap.server

import org.junit.jupiter.api.BeforeEach
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.context.WebApplicationContext

@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration::class)
abstract class IntegrationTest {
    @Autowired
    private lateinit var context: WebApplicationContext

    @Autowired
    protected lateinit var jdbc: JdbcClient

    protected lateinit var mvc: MockMvc

    @BeforeEach
    fun setUpMvc() {
        jdbc.sql("TRUNCATE audit_event, feature, mission").update()
        mvc = MockMvcBuilders.webAppContextSetup(context).build()
    }
}
```

`server/src/test/kotlin/geomap/server/mission/RepositoryTest.kt`:

```kotlin
package geomap.server.mission

import geomap.server.IntegrationTest
import geomap.server.audit.AuditEvent
import geomap.server.audit.AuditRepository
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.dao.DataIntegrityViolationException
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

class RepositoryTest : IntegrationTest() {
    @Autowired
    private lateinit var missions: MissionRepository

    @Autowired
    private lateinit var features: FeatureRepository

    @Autowired
    private lateinit var audit: AuditRepository

    // PostgreSQL stores microseconds; truncate so round trips compare equal.
    private val now = Instant.now().truncatedTo(ChronoUnit.MICROS)

    private fun mission(name: String = "Op Nord") =
        Mission(
            id = UUID.randomUUID(),
            name = name,
            status = MissionStatus.DRAFT,
            basemapId = null,
            validUntil = null,
            createdBy = "alice",
            updatedBy = "alice",
            createdAt = now,
            updatedAt = now,
        )

    private fun feature(missionId: UUID) =
        Feature(
            id = UUID.randomUUID(),
            missionId = missionId,
            kind = FeatureKind.APP6,
            geometry = mapOf("type" to "LineString", "coordinates" to listOf(listOf(2.5, 48.5), listOf(3.25, 49.75))),
            bbox = BBox(2.5, 48.5, 3.25, 49.75),
            name = "Axe principal",
            description = "",
            style = null,
            sidc = "10031000001211000000",
            modifiers = mapOf("T" to "1ER RI"),
            origin = FeatureOrigin.AI_SUGGESTED,
            suggestionStatus = SuggestionStatus.PENDING,
            createdAt = now,
            updatedAt = now,
        )

    @Test
    fun `round trips a mission with null fields`() {
        val mission = mission()
        missions.insert(mission)
        assertEquals(mission, missions.find(mission.id))
    }

    @Test
    fun `updates a mission`() {
        val mission = mission()
        missions.insert(mission)
        val updated = mission.copy(name = "Op Sud", basemapId = "zone-sud", validUntil = now.plusSeconds(3600), updatedBy = "bob")
        missions.update(updated)
        assertEquals(updated, missions.find(mission.id))
    }

    @Test
    fun `returns null for an unknown mission`() {
        assertNull(missions.find(UUID.randomUUID()))
    }

    @Test
    fun `lists missions most recently updated first`() {
        val older = mission("A")
        val newer = mission("B").copy(updatedAt = now.plusSeconds(10))
        missions.insert(older)
        missions.insert(newer)
        assertEquals(listOf(newer.id, older.id), missions.findAll().map { it.id })
    }

    @Test
    fun `round trips a feature with json columns`() {
        val mission = mission()
        missions.insert(mission)
        val feature = feature(mission.id)
        features.insert(feature)
        assertEquals(feature, features.find(mission.id, feature.id))
        assertEquals(listOf(feature), features.findByMission(mission.id))
    }

    @Test
    fun `does not find a feature through another mission`() {
        val mission = mission()
        missions.insert(mission)
        val feature = feature(mission.id)
        features.insert(feature)
        assertNull(features.find(UUID.randomUUID(), feature.id))
    }

    @Test
    fun `deleting a mission deletes its features`() {
        val mission = mission()
        missions.insert(mission)
        features.insert(feature(mission.id))
        missions.delete(mission.id)
        assertEquals(emptyList(), features.findByMission(mission.id))
    }

    @Test
    fun `the schema refuses a human feature with a suggestion status`() {
        val mission = mission()
        missions.insert(mission)
        assertFailsWith<DataIntegrityViolationException> {
            features.insert(feature(mission.id).copy(origin = FeatureOrigin.HUMAN))
        }
    }

    @Test
    fun `returns the latest audit events first`() {
        audit.record(AuditEvent(now, "alice", null, "mission.create", "mission:1", emptyMap()))
        audit.record(AuditEvent(now, "alice", "assistant", "feature.create", "feature:2", mapOf("origin" to "AI_SUGGESTED")))
        val latest = audit.latest(10)
        assertEquals(listOf("feature.create", "mission.create"), latest.map { it.action })
        assertEquals("assistant", latest.first().actorAgent)
        assertEquals(mapOf("origin" to "AI_SUGGESTED"), latest.first().details)
    }
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd server && ./gradlew test --tests geomap.server.mission.RepositoryTest`
Expected: FAIL, compilation error `Unresolved reference 'MissionRepository'`.

- [ ] **Step 4: Write the implementation**

`server/src/main/kotlin/geomap/server/db/JdbcSupport.kt`:

```kotlin
package geomap.server.db

import java.sql.ResultSet
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset

fun Instant.toUtc(): OffsetDateTime = atOffset(ZoneOffset.UTC)

fun ResultSet.instant(column: String): Instant? = getObject(column, OffsetDateTime::class.java)?.toInstant()
```

`server/src/main/kotlin/geomap/server/mission/Mission.kt`:

```kotlin
package geomap.server.mission

import java.time.Instant
import java.util.UUID

enum class MissionStatus { DRAFT, PUBLISHED, WITHDRAWN }

enum class FeatureKind { GENERIC, APP6 }

enum class FeatureOrigin { HUMAN, AI_SUGGESTED }

enum class SuggestionStatus { PENDING, ACCEPTED, REJECTED }

data class Mission(
    val id: UUID,
    val name: String,
    val status: MissionStatus,
    val basemapId: String?,
    val validUntil: Instant?,
    val createdBy: String,
    val updatedBy: String,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class Feature(
    val id: UUID,
    val missionId: UUID,
    val kind: FeatureKind,
    val geometry: Map<String, Any?>,
    val bbox: BBox,
    val name: String,
    val description: String,
    val style: Map<String, Any?>?,
    val sidc: String?,
    val modifiers: Map<String, String>?,
    val origin: FeatureOrigin,
    val suggestionStatus: SuggestionStatus?,
    val createdAt: Instant,
    val updatedAt: Instant,
)
```

`server/src/main/kotlin/geomap/server/mission/MissionRepository.kt`:

```kotlin
package geomap.server.mission

import geomap.server.db.instant
import geomap.server.db.toUtc
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.util.UUID

@Repository
class MissionRepository(
    private val jdbc: JdbcClient,
) {
    fun insert(mission: Mission) {
        jdbc
            .sql(
                """
                INSERT INTO mission (id, name, status, basemap_id, valid_until, created_by, updated_by, created_at, updated_at)
                VALUES (:id, :name, :status, :basemapId, :validUntil, :createdBy, :updatedBy, :createdAt, :updatedAt)
                """.trimIndent(),
            ).params(mission)
            .param("createdBy", mission.createdBy)
            .param("createdAt", mission.createdAt.toUtc())
            .update()
    }

    fun update(mission: Mission) {
        jdbc
            .sql(
                """
                UPDATE mission
                SET name = :name, status = :status, basemap_id = :basemapId, valid_until = :validUntil,
                    updated_by = :updatedBy, updated_at = :updatedAt
                WHERE id = :id
                """.trimIndent(),
            ).params(mission)
            .update()
    }

    fun find(id: UUID): Mission? =
        jdbc
            .sql("SELECT * FROM mission WHERE id = :id")
            .param("id", id)
            .query { rs, _ -> map(rs) }
            .optional()
            .orElse(null)

    fun findAll(): List<Mission> =
        jdbc
            .sql("SELECT * FROM mission ORDER BY updated_at DESC, id")
            .query { rs, _ -> map(rs) }
            .list()

    fun delete(id: UUID) {
        jdbc.sql("DELETE FROM mission WHERE id = :id").param("id", id).update()
    }

    private fun JdbcClient.StatementSpec.params(mission: Mission): JdbcClient.StatementSpec =
        param("id", mission.id)
            .param("name", mission.name)
            .param("status", mission.status.name)
            .param("basemapId", mission.basemapId)
            .param("validUntil", mission.validUntil?.toUtc())
            .param("updatedBy", mission.updatedBy)
            .param("updatedAt", mission.updatedAt.toUtc())

    private fun map(rs: ResultSet) =
        Mission(
            id = rs.getObject("id", UUID::class.java),
            name = rs.getString("name"),
            status = MissionStatus.valueOf(rs.getString("status")),
            basemapId = rs.getString("basemap_id"),
            validUntil = rs.instant("valid_until"),
            createdBy = rs.getString("created_by"),
            updatedBy = rs.getString("updated_by"),
            createdAt = rs.instant("created_at")!!,
            updatedAt = rs.instant("updated_at")!!,
        )
}
```

`server/src/main/kotlin/geomap/server/mission/FeatureRepository.kt`:

```kotlin
package geomap.server.mission

import geomap.server.db.instant
import geomap.server.db.toUtc
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import tools.jackson.databind.ObjectMapper
import java.sql.ResultSet
import java.util.UUID

@Repository
class FeatureRepository(
    private val jdbc: JdbcClient,
    private val json: ObjectMapper,
) {
    fun insert(feature: Feature) {
        jdbc
            .sql(
                """
                INSERT INTO feature (id, mission_id, kind, geometry, min_lon, min_lat, max_lon, max_lat, name, description,
                                     style, sidc, modifiers, origin, suggestion_status, created_at, updated_at)
                VALUES (:id, :missionId, :kind, CAST(:geometry AS jsonb), :minLon, :minLat, :maxLon, :maxLat, :name, :description,
                        CAST(:style AS jsonb), :sidc, CAST(:modifiers AS jsonb), :origin, :suggestionStatus, :createdAt, :updatedAt)
                """.trimIndent(),
            ).params(feature)
            .param("missionId", feature.missionId)
            .param("createdAt", feature.createdAt.toUtc())
            .update()
    }

    fun update(feature: Feature) {
        jdbc
            .sql(
                """
                UPDATE feature
                SET kind = :kind, geometry = CAST(:geometry AS jsonb), min_lon = :minLon, min_lat = :minLat,
                    max_lon = :maxLon, max_lat = :maxLat, name = :name, description = :description,
                    style = CAST(:style AS jsonb), sidc = :sidc, modifiers = CAST(:modifiers AS jsonb),
                    origin = :origin, suggestion_status = :suggestionStatus, updated_at = :updatedAt
                WHERE id = :id
                """.trimIndent(),
            ).params(feature)
            .update()
    }

    fun find(
        missionId: UUID,
        id: UUID,
    ): Feature? =
        jdbc
            .sql("SELECT * FROM feature WHERE mission_id = :missionId AND id = :id")
            .param("missionId", missionId)
            .param("id", id)
            .query { rs, _ -> map(rs) }
            .optional()
            .orElse(null)

    fun findByMission(missionId: UUID): List<Feature> =
        jdbc
            .sql("SELECT * FROM feature WHERE mission_id = :missionId ORDER BY created_at, id")
            .param("missionId", missionId)
            .query { rs, _ -> map(rs) }
            .list()

    fun delete(id: UUID) {
        jdbc.sql("DELETE FROM feature WHERE id = :id").param("id", id).update()
    }

    private fun JdbcClient.StatementSpec.params(feature: Feature): JdbcClient.StatementSpec =
        param("id", feature.id)
            .param("kind", feature.kind.name)
            .param("geometry", json.writeValueAsString(feature.geometry))
            .param("minLon", feature.bbox.minLon)
            .param("minLat", feature.bbox.minLat)
            .param("maxLon", feature.bbox.maxLon)
            .param("maxLat", feature.bbox.maxLat)
            .param("name", feature.name)
            .param("description", feature.description)
            .param("style", feature.style?.let(json::writeValueAsString))
            .param("sidc", feature.sidc)
            .param("modifiers", feature.modifiers?.let(json::writeValueAsString))
            .param("origin", feature.origin.name)
            .param("suggestionStatus", feature.suggestionStatus?.name)
            .param("updatedAt", feature.updatedAt.toUtc())

    private fun map(rs: ResultSet) =
        Feature(
            id = rs.getObject("id", UUID::class.java),
            missionId = rs.getObject("mission_id", UUID::class.java),
            kind = FeatureKind.valueOf(rs.getString("kind")),
            geometry = readMap(rs.getString("geometry"))!!,
            bbox = BBox(rs.getDouble("min_lon"), rs.getDouble("min_lat"), rs.getDouble("max_lon"), rs.getDouble("max_lat")),
            name = rs.getString("name"),
            description = rs.getString("description"),
            style = readMap(rs.getString("style")),
            sidc = rs.getString("sidc"),
            modifiers = readMap(rs.getString("modifiers"))?.mapValues { it.value.toString() },
            origin = FeatureOrigin.valueOf(rs.getString("origin")),
            suggestionStatus = rs.getString("suggestion_status")?.let(SuggestionStatus::valueOf),
            createdAt = rs.instant("created_at")!!,
            updatedAt = rs.instant("updated_at")!!,
        )

    @Suppress("UNCHECKED_CAST")
    private fun readMap(text: String?): Map<String, Any?>? = text?.let { json.readValue(it, Map::class.java) as Map<String, Any?> }
}
```

`server/src/main/kotlin/geomap/server/audit/AuditRepository.kt`:

```kotlin
package geomap.server.audit

import geomap.server.db.instant
import geomap.server.db.toUtc
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import tools.jackson.databind.ObjectMapper
import java.time.Instant

data class AuditEvent(
    val at: Instant,
    val actorUser: String,
    val actorAgent: String?,
    val action: String,
    val target: String,
    val details: Map<String, Any?>,
)

@Repository
class AuditRepository(
    private val jdbc: JdbcClient,
    private val json: ObjectMapper,
) {
    fun record(event: AuditEvent) {
        jdbc
            .sql(
                """
                INSERT INTO audit_event (at, actor_user, actor_agent, action, target, details)
                VALUES (:at, :actorUser, :actorAgent, :action, :target, CAST(:details AS jsonb))
                """.trimIndent(),
            ).param("at", event.at.toUtc())
            .param("actorUser", event.actorUser)
            .param("actorAgent", event.actorAgent)
            .param("action", event.action)
            .param("target", event.target)
            .param("details", json.writeValueAsString(event.details))
            .update()
    }

    @Suppress("UNCHECKED_CAST")
    fun latest(limit: Int): List<AuditEvent> =
        jdbc
            .sql("SELECT * FROM audit_event ORDER BY id DESC LIMIT :limit")
            .param("limit", limit)
            .query { rs, _ ->
                AuditEvent(
                    at = rs.instant("at")!!,
                    actorUser = rs.getString("actor_user"),
                    actorAgent = rs.getString("actor_agent"),
                    action = rs.getString("action"),
                    target = rs.getString("target"),
                    details = json.readValue(rs.getString("details"), Map::class.java) as Map<String, Any?>,
                )
            }.list()
}
```

- [ ] **Step 5: Run the quality gate**

Run: `cd server && ./gradlew ktlintFormat && cd .. && make check`
Expected: `BUILD SUCCESSFUL`, `RepositoryTest` (9 tests) passes.

- [ ] **Step 6: Commit**

```bash
git add server
git commit -m "feat(server): add mission, feature and audit schema with repositories"
```

---

### Task 4: Keycloak security and actors

**Files:**
- Modify: `server/build.gradle.kts` (security dependencies), `server/src/test/kotlin/geomap/server/IntegrationTest.kt` (apply Spring Security, token helpers)
- Create: `server/src/main/kotlin/geomap/server/security/KeycloakRoles.kt`, `server/src/main/kotlin/geomap/server/security/Actor.kt`, `server/src/main/kotlin/geomap/server/security/SecurityConfig.kt`, `server/src/test/resources/application-test.yml`
- Test: `server/src/test/kotlin/geomap/server/security/KeycloakRolesTest.kt`, `server/src/test/kotlin/geomap/server/security/ActorTest.kt`, `server/src/test/kotlin/geomap/server/security/SecurityTest.kt`

**Interfaces:**
- Produces:
  - `KeycloakRoles.authorities(jwt: Jwt): Collection<GrantedAuthority>` (`realm_access.roles` → `ROLE_<role>`), `KeycloakRoles.converter(): Converter<Jwt, AbstractAuthenticationToken>` (token name = `preferred_username`, else `sub`)
  - `data class Actor(user: String, agent: String?)` with `val isAgent: Boolean`, `Actor.of(authentication: Authentication): Actor` (`agent` = `act.sub` claim)
  - `SecurityConfig`: `/actuator/health` public, everything else authenticated, method security enabled (`@PreAuthorize`)
  - Test helpers on `IntegrationTest`: `planner(user: String = "alice")`, `agent(user: String = "alice")`, `admin()` — each a `RequestPostProcessor`

- [ ] **Step 1: Add the dependencies**

In `server/build.gradle.kts`, add to `dependencies`:

```kotlin
    implementation("org.springframework.boot:spring-boot-starter-security-oauth2-resource-server")
    testImplementation("org.springframework.security:spring-security-test")
```

- [ ] **Step 2: Write the failing tests**

`server/src/test/resources/application-test.yml`:

```yaml
# Tests authenticate with spring-security-test's jwt() post-processor, which bypasses the decoder;
# this URI only satisfies the resource server auto-configuration and is never called.
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          jwk-set-uri: http://localhost:9/unused-jwks
```

Replace `server/src/test/kotlin/geomap/server/IntegrationTest.kt` with:

```kotlin
package geomap.server

import org.junit.jupiter.api.BeforeEach
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.RequestPostProcessor
import org.springframework.test.web.servlet.setup.DefaultMockMvcBuilder
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.context.WebApplicationContext

@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration::class)
abstract class IntegrationTest {
    @Autowired
    private lateinit var context: WebApplicationContext

    @Autowired
    protected lateinit var jdbc: JdbcClient

    protected lateinit var mvc: MockMvc

    @BeforeEach
    fun setUpMvc() {
        jdbc.sql("TRUNCATE audit_event, feature, mission").update()
        mvc =
            MockMvcBuilders
                .webAppContextSetup(context)
                .apply<DefaultMockMvcBuilder>(springSecurity())
                .build()
    }

    protected fun planner(user: String = "alice"): RequestPostProcessor =
        jwt().jwt { it.subject(user) }.authorities(SimpleGrantedAuthority("ROLE_planificateur"))

    protected fun agent(user: String = "alice"): RequestPostProcessor =
        jwt()
            .jwt { it.subject(user).claim("act", mapOf("sub" to "assistant")) }
            .authorities(SimpleGrantedAuthority("ROLE_planificateur"))

    protected fun admin(): RequestPostProcessor = jwt().jwt { it.subject("root") }.authorities(SimpleGrantedAuthority("ROLE_administrateur"))
}
```

`server/src/test/kotlin/geomap/server/security/KeycloakRolesTest.kt`:

```kotlin
package geomap.server.security

import org.springframework.security.oauth2.jwt.Jwt
import kotlin.test.Test
import kotlin.test.assertEquals

class KeycloakRolesTest {
    private fun token(claims: Map<String, Any>): Jwt =
        Jwt
            .withTokenValue("t")
            .header("alg", "RS256")
            .subject("3f2a")
            .claims { it.putAll(claims) }
            .build()

    @Test
    fun `maps realm roles to prefixed authorities`() {
        val jwt = token(mapOf("realm_access" to mapOf("roles" to listOf("planificateur", "administrateur"))))
        assertEquals(setOf("ROLE_planificateur", "ROLE_administrateur"), KeycloakRoles.authorities(jwt).map { it.authority }.toSet())
    }

    @Test
    fun `a token without realm roles has no authorities`() {
        assertEquals(emptyList(), KeycloakRoles.authorities(token(mapOf("scope" to "openid"))).toList())
    }

    @Test
    fun `names the principal after preferred_username`() {
        val jwt = token(mapOf("preferred_username" to "alice"))
        assertEquals("alice", KeycloakRoles.converter().convert(jwt)!!.name)
    }

    @Test
    fun `falls back to the subject when preferred_username is missing`() {
        assertEquals("3f2a", KeycloakRoles.converter().convert(token(mapOf("scope" to "openid")))!!.name)
    }
}
```

`server/src/test/kotlin/geomap/server/security/ActorTest.kt`:

```kotlin
package geomap.server.security

import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ActorTest {
    private fun authentication(claims: Map<String, Any>): JwtAuthenticationToken {
        val jwt =
            Jwt
                .withTokenValue("t")
                .header("alg", "RS256")
                .subject("alice")
                .claims { it.putAll(claims) }
                .build()
        return JwtAuthenticationToken(jwt, emptyList(), "alice")
    }

    @Test
    fun `a plain token is a human actor`() {
        val actor = Actor.of(authentication(mapOf("scope" to "openid")))
        assertEquals(Actor("alice", null), actor)
        assertFalse(actor.isAgent)
    }

    @Test
    fun `an act claim marks an agent acting for the user`() {
        val actor = Actor.of(authentication(mapOf("act" to mapOf("sub" to "assistant"))))
        assertEquals(Actor("alice", "assistant"), actor)
        assertTrue(actor.isAgent)
    }
}
```

`server/src/test/kotlin/geomap/server/security/SecurityTest.kt`:

```kotlin
package geomap.server.security

import geomap.server.IntegrationTest
import org.junit.jupiter.api.Test
import org.springframework.test.web.servlet.get

class SecurityTest : IntegrationTest() {
    @Test
    fun `health stays public`() {
        mvc.get("/actuator/health").andExpect { status { isOk() } }
    }

    @Test
    fun `any other route needs a token`() {
        mvc.get("/api/missions").andExpect { status { isUnauthorized() } }
    }
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd server && ./gradlew test --tests 'geomap.server.security.*'`
Expected: FAIL, compilation error `Unresolved reference 'KeycloakRoles'`.

- [ ] **Step 4: Write the implementation**

`server/src/main/kotlin/geomap/server/security/KeycloakRoles.kt`:

```kotlin
package geomap.server.security

import org.springframework.core.convert.converter.Converter
import org.springframework.security.authentication.AbstractAuthenticationToken
import org.springframework.security.core.GrantedAuthority
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken

object KeycloakRoles {
    fun authorities(jwt: Jwt): Collection<GrantedAuthority> {
        val roles = jwt.getClaimAsMap("realm_access")?.get("roles") as? Collection<*> ?: return emptyList()
        return roles.filterIsInstance<String>().map { SimpleGrantedAuthority("ROLE_$it") }
    }

    fun converter(): Converter<Jwt, AbstractAuthenticationToken> =
        Converter<Jwt, AbstractAuthenticationToken> { jwt ->
            JwtAuthenticationToken(jwt, authorities(jwt), jwt.getClaimAsString("preferred_username") ?: jwt.subject)
        }
}
```

`server/src/main/kotlin/geomap/server/security/Actor.kt`:

```kotlin
package geomap.server.security

import org.springframework.security.core.Authentication
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken

data class Actor(
    val user: String,
    val agent: String?,
) {
    val isAgent: Boolean get() = agent != null

    companion object {
        // RFC 8693: an agent acting on behalf of the user carries its own identity in the `act` claim.
        fun of(authentication: Authentication): Actor {
            val jwt = (authentication as JwtAuthenticationToken).token
            return Actor(authentication.name, jwt.getClaimAsMap("act")?.get("sub") as? String)
        }
    }
}
```

`server/src/main/kotlin/geomap/server/security/SecurityConfig.kt`:

```kotlin
package geomap.server.security

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.invoke
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.web.SecurityFilterChain

@Configuration
@EnableMethodSecurity
class SecurityConfig {
    @Bean
    fun securityFilterChain(http: HttpSecurity): SecurityFilterChain {
        http {
            authorizeHttpRequests {
                authorize("/actuator/health", permitAll)
                authorize(anyRequest, authenticated)
            }
            oauth2ResourceServer {
                jwt { jwtAuthenticationConverter = KeycloakRoles.converter() }
            }
            sessionManagement { sessionCreationPolicy = SessionCreationPolicy.STATELESS }
            // Stateless bearer-token API without cookies: CSRF protection has nothing to protect.
            csrf { disable() }
        }
        return http.build()
    }
}
```

- [ ] **Step 5: Run the quality gate**

Run: `cd server && ./gradlew ktlintFormat && cd .. && make check`
Expected: `BUILD SUCCESSFUL`; security tests (8) and all earlier tests pass.

- [ ] **Step 6: Commit**

```bash
git add server
git commit -m "feat(server): secure the API with Keycloak roles and agent actors"
```

---

### Task 5: Missions API

**Files:**
- Create: `server/src/main/kotlin/geomap/server/web/ApiErrorHandler.kt`, `server/src/main/kotlin/geomap/server/mission/MissionService.kt`, `server/src/main/kotlin/geomap/server/mission/MissionController.kt`
- Test: `server/src/test/kotlin/geomap/server/mission/MissionApiTest.kt`

**Interfaces:**
- Consumes: exceptions (Task 2), `Mission`, `MissionStatus`, `MissionRepository`, `AuditRepository`, `AuditEvent` (Task 3), `Actor` (Task 4), `Clock` bean (Task 1).
- Produces:
  - `data class MissionInput(name: String, basemapId: String? = null, validUntil: Instant? = null)`, `data class MissionPatch(name: String? = null, basemapId: String? = null, validUntil: Instant? = null)`
  - `MissionService.create(actor, MissionInput): Mission`, `.list(): List<Mission>`, `.get(id): Mission` (404), `.update(actor, id, MissionPatch): Mission`, `.delete(actor, id)`, `.editable(id): Mission` (404, or 409 if withdrawn), `.touch(actor, mission, now: Instant)` (saves it as `DRAFT` with `updatedBy`/`updatedAt`), `.record(actor, action, target, details = emptyMap())` (audit)
  - HTTP: `POST /api/missions` → 201, `GET /api/missions`, `GET /api/missions/{id}`, `PATCH /api/missions/{id}`, `DELETE /api/missions/{id}` → 204; role `planificateur`
  - `ApiErrorHandler`: `InvalidInputException` → 400, `ForbiddenException` → 403, `NotFoundException` → 404, `ConflictException` → 409 (`ProblemDetail`, `detail` = message)

Audit actions: `mission.create`, `mission.update`, `mission.delete`; target `mission:<id>`; details hold field names only, never values.

- [ ] **Step 1: Write the failing test**

`server/src/test/kotlin/geomap/server/mission/MissionApiTest.kt`:

```kotlin
package geomap.server.mission

import com.jayway.jsonpath.JsonPath
import geomap.server.IntegrationTest
import geomap.server.audit.AuditRepository
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.request.RequestPostProcessor
import kotlin.test.assertEquals

class MissionApiTest : IntegrationTest() {
    @Autowired
    private lateinit var audit: AuditRepository

    private fun create(
        body: String = """{"name":"Op Nord"}""",
        who: RequestPostProcessor = planner(),
    ): String {
        val result =
            mvc
                .post("/api/missions") {
                    with(who)
                    contentType = MediaType.APPLICATION_JSON
                    content = body
                }.andExpect { status { isCreated() } }
                .andReturn()
        return JsonPath.read(result.response.contentAsString, "$.id")
    }

    private fun setStatus(
        id: String,
        status: String,
    ) {
        jdbc.sql("UPDATE mission SET status = :s WHERE id = CAST(:id AS uuid)").param("s", status).param("id", id).update()
    }

    @Test
    fun `creates a draft mission owned by the caller`() {
        mvc
            .post("/api/missions") {
                with(planner("bob"))
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"Op Nord","basemapId":"zone-nord","validUntil":"2099-01-01T00:00:00Z"}"""
            }.andExpect {
                status { isCreated() }
                jsonPath("$.status") { value("DRAFT") }
                jsonPath("$.name") { value("Op Nord") }
                jsonPath("$.basemapId") { value("zone-nord") }
                jsonPath("$.createdBy") { value("bob") }
            }
    }

    @Test
    fun `rejects a blank name`() {
        mvc
            .post("/api/missions") {
                with(planner())
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"   "}"""
            }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `rejects an expiry in the past`() {
        mvc
            .post("/api/missions") {
                with(planner())
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"Op","validUntil":"2000-01-01T00:00:00Z"}"""
            }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `rejects an invalid basemap id`() {
        mvc
            .post("/api/missions") {
                with(planner())
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"Op","basemapId":"../etc"}"""
            }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `rejects malformed json`() {
        mvc
            .post("/api/missions") {
                with(planner())
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"""
            }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `lists and reads missions`() {
        val id = create()
        mvc.get("/api/missions") { with(planner()) }.andExpect { jsonPath("$[0].id") { value(id) } }
        mvc.get("/api/missions/$id") { with(planner()) }.andExpect { jsonPath("$.name") { value("Op Nord") } }
    }

    @Test
    fun `an unknown mission is not found`() {
        mvc.get("/api/missions/00000000-0000-0000-0000-000000000000") { with(planner()) }.andExpect {
            status { isNotFound() }
            jsonPath("$.detail") { value("mission not found") }
        }
    }

    @Test
    fun `updates a mission and records the changed fields`() {
        val id = create()
        mvc
            .patch("/api/missions/$id") {
                with(planner("bob"))
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"Op Sud"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.name") { value("Op Sud") }
                jsonPath("$.updatedBy") { value("bob") }
            }
        val event = audit.latest(1).single()
        assertEquals("mission.update", event.action)
        assertEquals("mission:$id", event.target)
        assertEquals(mapOf("fields" to listOf("name")), event.details)
    }

    @Test
    fun `editing a published mission sends it back to draft`() {
        val id = create()
        setStatus(id, "PUBLISHED")
        mvc
            .patch("/api/missions/$id") {
                with(planner())
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"Op Nord 2"}"""
            }.andExpect { jsonPath("$.status") { value("DRAFT") } }
    }

    @Test
    fun `a withdrawn mission cannot be edited`() {
        val id = create()
        setStatus(id, "WITHDRAWN")
        mvc
            .patch("/api/missions/$id") {
                with(planner())
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"Op"}"""
            }.andExpect { status { isConflict() } }
        mvc.get("/api/missions/$id") { with(planner()) }.andExpect { jsonPath("$.status") { value("WITHDRAWN") } }
    }

    @Test
    fun `deletes a draft mission`() {
        val id = create()
        mvc.delete("/api/missions/$id") { with(planner()) }.andExpect { status { isNoContent() } }
        mvc.get("/api/missions/$id") { with(planner()) }.andExpect { status { isNotFound() } }
    }

    @Test
    fun `a published mission cannot be deleted`() {
        val id = create()
        setStatus(id, "PUBLISHED")
        mvc.delete("/api/missions/$id") { with(planner()) }.andExpect { status { isConflict() } }
    }

    @Test
    fun `an agent cannot delete a mission`() {
        val id = create()
        mvc.delete("/api/missions/$id") { with(agent()) }.andExpect { status { isForbidden() } }
    }

    @Test
    fun `an agent-created mission is audited with the agent`() {
        create(who = agent())
        val event = audit.latest(1).single()
        assertEquals("alice", event.actorUser)
        assertEquals("assistant", event.actorAgent)
    }

    @Test
    fun `an administrator without the planner role is forbidden`() {
        mvc.get("/api/missions") { with(admin()) }.andExpect { status { isForbidden() } }
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd server && ./gradlew test --tests geomap.server.mission.MissionApiTest`
Expected: FAIL — the routes do not exist yet (404 instead of 201/200).

- [ ] **Step 3: Write the implementation**

`server/src/main/kotlin/geomap/server/web/ApiErrorHandler.kt`:

```kotlin
package geomap.server.web

import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class ApiErrorHandler {
    @ExceptionHandler(InvalidInputException::class)
    fun invalid(e: InvalidInputException): ProblemDetail = problem(HttpStatus.BAD_REQUEST, e)

    @ExceptionHandler(ForbiddenException::class)
    fun forbidden(e: ForbiddenException): ProblemDetail = problem(HttpStatus.FORBIDDEN, e)

    @ExceptionHandler(NotFoundException::class)
    fun notFound(e: NotFoundException): ProblemDetail = problem(HttpStatus.NOT_FOUND, e)

    @ExceptionHandler(ConflictException::class)
    fun conflict(e: ConflictException): ProblemDetail = problem(HttpStatus.CONFLICT, e)

    private fun problem(
        status: HttpStatus,
        e: RuntimeException,
    ): ProblemDetail = ProblemDetail.forStatusAndDetail(status, e.message ?: status.reasonPhrase)
}
```

`server/src/main/kotlin/geomap/server/mission/MissionService.kt`:

```kotlin
package geomap.server.mission

import geomap.server.audit.AuditEvent
import geomap.server.audit.AuditRepository
import geomap.server.security.Actor
import geomap.server.web.ConflictException
import geomap.server.web.ForbiddenException
import geomap.server.web.InvalidInputException
import geomap.server.web.NotFoundException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.Instant
import java.util.UUID

data class MissionInput(
    val name: String,
    val basemapId: String? = null,
    val validUntil: Instant? = null,
)

data class MissionPatch(
    val name: String? = null,
    val basemapId: String? = null,
    val validUntil: Instant? = null,
)

@Service
class MissionService(
    private val missions: MissionRepository,
    private val audit: AuditRepository,
    private val clock: Clock,
) {
    @Transactional
    fun create(
        actor: Actor,
        input: MissionInput,
    ): Mission {
        val now = clock.instant()
        val mission =
            Mission(
                id = UUID.randomUUID(),
                name = validName(input.name),
                status = MissionStatus.DRAFT,
                basemapId = input.basemapId?.let(::validBasemapId),
                validUntil = input.validUntil?.let { validExpiry(it, now) },
                createdBy = actor.user,
                updatedBy = actor.user,
                createdAt = now,
                updatedAt = now,
            )
        missions.insert(mission)
        record(actor, "mission.create", "mission:${mission.id}")
        return mission
    }

    fun list(): List<Mission> = missions.findAll()

    fun get(id: UUID): Mission = missions.find(id) ?: throw NotFoundException("mission not found")

    @Transactional
    fun update(
        actor: Actor,
        id: UUID,
        patch: MissionPatch,
    ): Mission {
        val current = editable(id)
        val now = clock.instant()
        val updated =
            current.copy(
                name = patch.name?.let(::validName) ?: current.name,
                basemapId = patch.basemapId?.let(::validBasemapId) ?: current.basemapId,
                validUntil = patch.validUntil?.let { validExpiry(it, now) } ?: current.validUntil,
            )
        touch(actor, updated, now)
        val fields = listOfNotNull(patch.name?.let { "name" }, patch.basemapId?.let { "basemapId" }, patch.validUntil?.let { "validUntil" })
        record(actor, "mission.update", "mission:$id", mapOf("fields" to fields))
        return get(id)
    }

    @Transactional
    fun delete(
        actor: Actor,
        id: UUID,
    ) {
        if (actor.isAgent) throw ForbiddenException("agents cannot delete missions")
        if (get(id).status != MissionStatus.DRAFT) throw ConflictException("only draft missions can be deleted")
        missions.delete(id)
        record(actor, "mission.delete", "mission:$id")
    }

    fun editable(id: UUID): Mission {
        val mission = get(id)
        if (mission.status == MissionStatus.WITHDRAWN) throw ConflictException("mission is withdrawn")
        return mission
    }

    // Any change sends the mission back to draft until it is published again (spec §5.3).
    fun touch(
        actor: Actor,
        mission: Mission,
        now: Instant,
    ) {
        missions.update(mission.copy(status = MissionStatus.DRAFT, updatedBy = actor.user, updatedAt = now))
    }

    fun record(
        actor: Actor,
        action: String,
        target: String,
        details: Map<String, Any?> = emptyMap(),
    ) {
        audit.record(AuditEvent(clock.instant(), actor.user, actor.agent, action, target, details))
    }

    private fun validName(name: String): String {
        val trimmed = name.trim()
        if (trimmed.length !in 1..200) throw InvalidInputException("name must be 1 to 200 characters")
        return trimmed
    }

    private fun validBasemapId(id: String): String {
        if (!BASEMAP_ID.matches(id)) throw InvalidInputException("basemapId must match ${BASEMAP_ID.pattern}")
        return id
    }

    private fun validExpiry(
        validUntil: Instant,
        now: Instant,
    ): Instant {
        if (!validUntil.isAfter(now)) throw InvalidInputException("validUntil must be in the future")
        return validUntil
    }

    private companion object {
        val BASEMAP_ID = Regex("^[a-z0-9-]{1,64}$")
    }
}
```

`server/src/main/kotlin/geomap/server/mission/MissionController.kt`:

```kotlin
package geomap.server.mission

import geomap.server.security.Actor
import org.springframework.http.HttpStatus
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api/missions")
@PreAuthorize("hasRole('planificateur')")
class MissionController(
    private val service: MissionService,
) {
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(
        @RequestBody input: MissionInput,
        authentication: Authentication,
    ): Mission = service.create(Actor.of(authentication), input)

    @GetMapping
    fun list(): List<Mission> = service.list()

    @GetMapping("/{id}")
    fun get(
        @PathVariable id: UUID,
    ): Mission = service.get(id)

    @PatchMapping("/{id}")
    fun update(
        @PathVariable id: UUID,
        @RequestBody patch: MissionPatch,
        authentication: Authentication,
    ): Mission = service.update(Actor.of(authentication), id, patch)

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(
        @PathVariable id: UUID,
        authentication: Authentication,
    ) = service.delete(Actor.of(authentication), id)
}
```

- [ ] **Step 4: Run the quality gate**

Run: `cd server && ./gradlew ktlintFormat && cd .. && make check`
Expected: `BUILD SUCCESSFUL`; `MissionApiTest` (15 tests) and all earlier tests pass.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(server): add missions API with audit trail"
```

---

### Task 6: Features API and AI suggestions

**Files:**
- Create: `server/src/main/kotlin/geomap/server/mission/FeatureService.kt`, `server/src/main/kotlin/geomap/server/mission/FeatureController.kt`
- Test: `server/src/test/kotlin/geomap/server/mission/FeatureApiTest.kt`

**Interfaces:**
- Consumes: `GeoJsonGeometry`, `BBox` (Task 2); `Feature`, enums, `FeatureRepository` (Task 3); `Actor` (Task 4); `MissionService.get/editable/touch/record` (Task 5).
- Produces:
  - `data class FeatureInput(kind: FeatureKind, geometry: Map<String, Any?>, name: String = "", description: String = "", style: Map<String, Any?>? = null, sidc: String? = null, modifiers: Map<String, String>? = null)`
  - `FeatureService.list(missionId)`, `.create(actor, missionId, FeatureInput): Feature`, `.update(actor, missionId, featureId, FeatureInput): Feature`, `.delete(actor, missionId, featureId)`, `.accept(actor, missionId, featureId): Feature`, `.reject(actor, missionId, featureId): Feature`
  - HTTP under `/api/missions/{missionId}/features`: `GET`, `POST` → 201, `PUT /{featureId}`, `DELETE /{featureId}` → 204, `POST /{featureId}/accept`, `POST /{featureId}/reject`; role `planificateur`

Rules: `GeoJsonGeometry.validate`; `name` ≤ 200 chars; `description` ≤ 4000 chars; `APP6` needs `sidc` of exactly 20 digits; `GENERIC` must have no `sidc` and no `modifiers`; `style.radiusMeters`, when present, must be a positive number on a `Point`. Agent callers create `AI_SUGGESTED`/`PENDING`; humans create `HUMAN`/`null`. Agents may only change or delete `AI_SUGGESTED` + `PENDING` features (else 403). Only humans accept/reject (agent → 403); the feature must be `AI_SUGGESTED` + `PENDING` (else 409). Every change touches the mission (back to `DRAFT`). Audit actions `feature.create|update|delete|accept|reject`, target `feature:<id>`, details `{"missionId": ..., "origin": ...}` for create, `{"missionId": ...}` otherwise.

- [ ] **Step 1: Write the failing test**

`server/src/test/kotlin/geomap/server/mission/FeatureApiTest.kt`:

```kotlin
package geomap.server.mission

import com.jayway.jsonpath.JsonPath
import geomap.server.IntegrationTest
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import org.springframework.test.web.servlet.request.RequestPostProcessor

class FeatureApiTest : IntegrationTest() {
    private lateinit var missionId: String

    private val polygon =
        """{"type":"Polygon","coordinates":[[[2.0,48.0],[3.0,48.0],[3.0,49.0],[2.0,49.0],[2.0,48.0]]]}"""
    private val point = """{"type":"Point","coordinates":[2.35,48.85]}"""
    private val zone = """{"kind":"GENERIC","geometry":$polygon,"name":"Zone rouge","style":{"color":"#ff0000"}}"""

    @BeforeEach
    fun createMission() {
        val result =
            mvc
                .post("/api/missions") {
                    with(planner())
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"name":"Op Nord"}"""
                }.andReturn()
        missionId = JsonPath.read(result.response.contentAsString, "$.id")
    }

    private fun features() = "/api/missions/$missionId/features"

    private fun post(
        body: String,
        who: RequestPostProcessor = planner(),
    ) = mvc.post(features()) {
        with(who)
        contentType = MediaType.APPLICATION_JSON
        content = body
    }

    private fun create(
        body: String = zone,
        who: RequestPostProcessor = planner(),
    ): String {
        val result = post(body, who).andExpect { status { isCreated() } }.andReturn()
        return JsonPath.read(result.response.contentAsString, "$.id")
    }

    private fun setMissionStatus(status: String) {
        jdbc.sql("UPDATE mission SET status = :s WHERE id = CAST(:id AS uuid)").param("s", status).param("id", missionId).update()
    }

    @Test
    fun `a human creates a generic zone`() {
        post(zone).andExpect {
            status { isCreated() }
            jsonPath("$.origin") { value("HUMAN") }
            jsonPath("$.bbox.maxLat") { value(49.0) }
        }
    }

    @Test
    fun `an agent creates a pending suggestion`() {
        post(zone, agent()).andExpect {
            status { isCreated() }
            jsonPath("$.origin") { value("AI_SUGGESTED") }
            jsonPath("$.suggestionStatus") { value("PENDING") }
        }
    }

    @Test
    fun `an APP-6 symbol needs a 20 digit SIDC`() {
        post("""{"kind":"APP6","geometry":$point}""").andExpect { status { isBadRequest() } }
        post("""{"kind":"APP6","geometry":$point,"sidc":"1003"}""").andExpect { status { isBadRequest() } }
        post("""{"kind":"APP6","geometry":$point,"sidc":"10031000001211000000","modifiers":{"T":"1ER RI"}}""")
            .andExpect { status { isCreated() } }
    }

    @Test
    fun `a generic object cannot carry a SIDC`() {
        post("""{"kind":"GENERIC","geometry":$point,"sidc":"10031000001211000000"}""").andExpect { status { isBadRequest() } }
    }

    @Test
    fun `invalid geometry is rejected and nothing is stored`() {
        val open = """{"kind":"GENERIC","geometry":{"type":"Polygon","coordinates":[[[2.0,48.0],[3.0,48.0],[3.0,49.0],[2.0,49.0]]]}}"""
        post(open).andExpect {
            status { isBadRequest() }
            jsonPath("$.detail") { value("a polygon ring must be closed") }
        }
        mvc.get(features()) { with(planner()) }.andExpect { jsonPath("$.length()") { value(0) } }
    }

    @Test
    fun `a circle radius only applies to a point`() {
        post("""{"kind":"GENERIC","geometry":$polygon,"style":{"radiusMeters":500}}""").andExpect { status { isBadRequest() } }
        post("""{"kind":"GENERIC","geometry":$point,"style":{"radiusMeters":0}}""").andExpect { status { isBadRequest() } }
        post("""{"kind":"GENERIC","geometry":$point,"style":{"radiusMeters":500}}""").andExpect { status { isCreated() } }
    }

    @Test
    fun `a human accepts a suggestion`() {
        val id = create(who = agent())
        mvc.post("${features()}/$id/accept") { with(planner()) }.andExpect {
            status { isOk() }
            jsonPath("$.suggestionStatus") { value("ACCEPTED") }
        }
    }

    @Test
    fun `a human rejects a suggestion`() {
        val id = create(who = agent())
        mvc.post("${features()}/$id/reject") { with(planner()) }.andExpect { jsonPath("$.suggestionStatus") { value("REJECTED") } }
    }

    @Test
    fun `an agent cannot accept a suggestion`() {
        val id = create(who = agent())
        mvc.post("${features()}/$id/accept") { with(agent()) }.andExpect { status { isForbidden() } }
        mvc.post("${features()}/$id/reject") { with(agent()) }.andExpect { status { isForbidden() } }
        mvc.get(features()) { with(planner()) }.andExpect { jsonPath("$[0].suggestionStatus") { value("PENDING") } }
    }

    @Test
    fun `a human feature cannot be accepted`() {
        val id = create()
        mvc.post("${features()}/$id/accept") { with(planner()) }.andExpect { status { isConflict() } }
    }

    @Test
    fun `an agent cannot modify a human feature`() {
        val id = create()
        mvc
            .put("${features()}/$id") {
                with(agent())
                contentType = MediaType.APPLICATION_JSON
                content = zone
            }.andExpect { status { isForbidden() } }
        mvc.delete("${features()}/$id") { with(agent()) }.andExpect { status { isForbidden() } }
    }

    @Test
    fun `a human updates a feature`() {
        val id = create()
        mvc
            .put("${features()}/$id") {
                with(planner())
                contentType = MediaType.APPLICATION_JSON
                content = """{"kind":"GENERIC","geometry":$point,"name":"PC"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.name") { value("PC") }
                jsonPath("$.bbox.minLon") { value(2.35) }
            }
    }

    @Test
    fun `deletes a feature`() {
        val id = create()
        mvc.delete("${features()}/$id") { with(planner()) }.andExpect { status { isNoContent() } }
        mvc.get(features()) { with(planner()) }.andExpect { jsonPath("$.length()") { value(0) } }
    }

    @Test
    fun `an unknown mission or feature is not found`() {
        mvc
            .get("/api/missions/00000000-0000-0000-0000-000000000000/features") { with(planner()) }
            .andExpect { status { isNotFound() } }
        mvc
            .post("${features()}/00000000-0000-0000-0000-000000000000/accept") { with(planner()) }
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun `a withdrawn mission accepts no new object`() {
        setMissionStatus("WITHDRAWN")
        post(zone).andExpect { status { isConflict() } }
        mvc.get("/api/missions/$missionId") { with(planner()) }.andExpect { jsonPath("$.status") { value("WITHDRAWN") } }
    }

    @Test
    fun `adding an object sends a published mission back to draft`() {
        setMissionStatus("PUBLISHED")
        create()
        mvc.get("/api/missions/$missionId") { with(planner()) }.andExpect { jsonPath("$.status") { value("DRAFT") } }
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd server && ./gradlew test --tests geomap.server.mission.FeatureApiTest`
Expected: FAIL — the features routes do not exist yet (404).

- [ ] **Step 3: Write the implementation**

`server/src/main/kotlin/geomap/server/mission/FeatureService.kt`:

```kotlin
package geomap.server.mission

import geomap.server.security.Actor
import geomap.server.web.ConflictException
import geomap.server.web.ForbiddenException
import geomap.server.web.InvalidInputException
import geomap.server.web.NotFoundException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.util.UUID

data class FeatureInput(
    val kind: FeatureKind,
    val geometry: Map<String, Any?>,
    val name: String = "",
    val description: String = "",
    val style: Map<String, Any?>? = null,
    val sidc: String? = null,
    val modifiers: Map<String, String>? = null,
)

@Service
class FeatureService(
    private val features: FeatureRepository,
    private val missions: MissionService,
    private val clock: Clock,
) {
    fun list(missionId: UUID): List<Feature> {
        missions.get(missionId)
        return features.findByMission(missionId)
    }

    @Transactional
    fun create(
        actor: Actor,
        missionId: UUID,
        input: FeatureInput,
    ): Feature {
        val mission = missions.editable(missionId)
        val bbox = validate(input)
        val now = clock.instant()
        val origin = if (actor.isAgent) FeatureOrigin.AI_SUGGESTED else FeatureOrigin.HUMAN
        val feature =
            Feature(
                id = UUID.randomUUID(),
                missionId = missionId,
                kind = input.kind,
                geometry = input.geometry,
                bbox = bbox,
                name = input.name,
                description = input.description,
                style = input.style,
                sidc = input.sidc,
                modifiers = input.modifiers,
                origin = origin,
                suggestionStatus = if (actor.isAgent) SuggestionStatus.PENDING else null,
                createdAt = now,
                updatedAt = now,
            )
        features.insert(feature)
        missions.touch(actor, mission, now)
        missions.record(actor, "feature.create", "feature:${feature.id}", mapOf("missionId" to "$missionId", "origin" to origin.name))
        return feature
    }

    @Transactional
    fun update(
        actor: Actor,
        missionId: UUID,
        featureId: UUID,
        input: FeatureInput,
    ): Feature {
        val mission = missions.editable(missionId)
        val current = find(missionId, featureId)
        checkAgentMayChange(actor, current)
        val now = clock.instant()
        val updated =
            current.copy(
                kind = input.kind,
                geometry = input.geometry,
                bbox = validate(input),
                name = input.name,
                description = input.description,
                style = input.style,
                sidc = input.sidc,
                modifiers = input.modifiers,
                updatedAt = now,
            )
        features.update(updated)
        missions.touch(actor, mission, now)
        missions.record(actor, "feature.update", "feature:$featureId", mapOf("missionId" to "$missionId"))
        return updated
    }

    @Transactional
    fun delete(
        actor: Actor,
        missionId: UUID,
        featureId: UUID,
    ) {
        val mission = missions.editable(missionId)
        checkAgentMayChange(actor, find(missionId, featureId))
        features.delete(featureId)
        missions.touch(actor, mission, clock.instant())
        missions.record(actor, "feature.delete", "feature:$featureId", mapOf("missionId" to "$missionId"))
    }

    @Transactional
    fun accept(
        actor: Actor,
        missionId: UUID,
        featureId: UUID,
    ): Feature = decide(actor, missionId, featureId, SuggestionStatus.ACCEPTED, "feature.accept")

    @Transactional
    fun reject(
        actor: Actor,
        missionId: UUID,
        featureId: UUID,
    ): Feature = decide(actor, missionId, featureId, SuggestionStatus.REJECTED, "feature.reject")

    // A human always takes the decision: an AI suggestion never reaches a mission on its own.
    private fun decide(
        actor: Actor,
        missionId: UUID,
        featureId: UUID,
        status: SuggestionStatus,
        action: String,
    ): Feature {
        if (actor.isAgent) throw ForbiddenException("only a human can accept or reject a suggestion")
        val mission = missions.editable(missionId)
        val current = find(missionId, featureId)
        if (!current.isPendingSuggestion()) throw ConflictException("feature is not a pending suggestion")
        val now = clock.instant()
        val decided = current.copy(suggestionStatus = status, updatedAt = now)
        features.update(decided)
        missions.touch(actor, mission, now)
        missions.record(actor, action, "feature:$featureId", mapOf("missionId" to "$missionId"))
        return decided
    }

    private fun find(
        missionId: UUID,
        featureId: UUID,
    ): Feature = features.find(missionId, featureId) ?: throw NotFoundException("feature not found")

    private fun checkAgentMayChange(
        actor: Actor,
        feature: Feature,
    ) {
        if (actor.isAgent && !feature.isPendingSuggestion()) throw ForbiddenException("agents can only change their pending suggestions")
    }

    private fun Feature.isPendingSuggestion() = origin == FeatureOrigin.AI_SUGGESTED && suggestionStatus == SuggestionStatus.PENDING

    private fun validate(input: FeatureInput): BBox {
        val bbox = GeoJsonGeometry.validate(input.geometry)
        if (input.name.length > 200) invalid("name must be at most 200 characters")
        if (input.description.length > 4000) invalid("description must be at most 4000 characters")
        when (input.kind) {
            FeatureKind.APP6 -> if (input.sidc == null || !SIDC.matches(input.sidc)) invalid("an APP-6 symbol needs a 20 digit SIDC")
            FeatureKind.GENERIC -> if (input.sidc != null || input.modifiers != null) invalid("a generic object has no SIDC or modifiers")
        }
        input.style?.get("radiusMeters")?.let { radius ->
            if ((radius as? Number)?.toDouble()?.let { it > 0 } != true) invalid("radiusMeters must be a positive number")
            if (input.geometry["type"] != "Point") invalid("radiusMeters only applies to a Point")
        }
        return bbox
    }

    private fun invalid(message: String): Nothing = throw InvalidInputException(message)

    private companion object {
        val SIDC = Regex("^\\d{20}$")
    }
}
```

`server/src/main/kotlin/geomap/server/mission/FeatureController.kt`:

```kotlin
package geomap.server.mission

import geomap.server.security.Actor
import org.springframework.http.HttpStatus
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api/missions/{missionId}/features")
@PreAuthorize("hasRole('planificateur')")
class FeatureController(
    private val service: FeatureService,
) {
    @GetMapping
    fun list(
        @PathVariable missionId: UUID,
    ): List<Feature> = service.list(missionId)

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(
        @PathVariable missionId: UUID,
        @RequestBody input: FeatureInput,
        authentication: Authentication,
    ): Feature = service.create(Actor.of(authentication), missionId, input)

    @PutMapping("/{featureId}")
    fun update(
        @PathVariable missionId: UUID,
        @PathVariable featureId: UUID,
        @RequestBody input: FeatureInput,
        authentication: Authentication,
    ): Feature = service.update(Actor.of(authentication), missionId, featureId, input)

    @DeleteMapping("/{featureId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(
        @PathVariable missionId: UUID,
        @PathVariable featureId: UUID,
        authentication: Authentication,
    ) = service.delete(Actor.of(authentication), missionId, featureId)

    @PostMapping("/{featureId}/accept")
    fun accept(
        @PathVariable missionId: UUID,
        @PathVariable featureId: UUID,
        authentication: Authentication,
    ): Feature = service.accept(Actor.of(authentication), missionId, featureId)

    @PostMapping("/{featureId}/reject")
    fun reject(
        @PathVariable missionId: UUID,
        @PathVariable featureId: UUID,
        authentication: Authentication,
    ): Feature = service.reject(Actor.of(authentication), missionId, featureId)
}
```

- [ ] **Step 4: Run the quality gate**

Run: `cd server && ./gradlew ktlintFormat && cd .. && make check`
Expected: `BUILD SUCCESSFUL`; `FeatureApiTest` (16 tests) and all earlier tests pass.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(server): add features API with human-validated AI suggestions"
```

---

### Task 7: Audit API, Prometheus metrics, OpenAPI

**Files:**
- Modify: `server/build.gradle.kts`, `server/src/main/resources/application.yml`, `server/src/main/kotlin/geomap/server/security/SecurityConfig.kt`
- Create: `server/src/main/kotlin/geomap/server/audit/AuditController.kt`
- Test: `server/src/test/kotlin/geomap/server/audit/AuditApiTest.kt`, `server/src/test/kotlin/geomap/server/OperationsTest.kt`

**Interfaces:**
- Consumes: `AuditRepository.latest`, `AuditEvent` (Task 3); `InvalidInputException` (Task 2).
- Produces: `GET /api/audit?limit=<1..1000, default 100>` (role `administrateur`, newest first); `GET /actuator/prometheus` (no token; cluster-internal); `GET /v3/api-docs` (authenticated) — the contract AI agents will read in sub-project 2.

- [ ] **Step 1: Write the failing tests**

`server/src/test/kotlin/geomap/server/audit/AuditApiTest.kt`:

```kotlin
package geomap.server.audit

import geomap.server.IntegrationTest
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.get
import java.time.Instant

class AuditApiTest : IntegrationTest() {
    @Autowired
    private lateinit var audit: AuditRepository

    @Test
    fun `an administrator reads the latest events first`() {
        audit.record(AuditEvent(Instant.now(), "alice", null, "mission.create", "mission:1", emptyMap()))
        audit.record(AuditEvent(Instant.now(), "alice", "assistant", "feature.create", "feature:2", emptyMap()))
        mvc.get("/api/audit?limit=1") { with(admin()) }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].action") { value("feature.create") }
            jsonPath("$[0].actorAgent") { value("assistant") }
        }
    }

    @Test
    fun `a planner cannot read the audit trail`() {
        mvc.get("/api/audit") { with(planner()) }.andExpect { status { isForbidden() } }
    }

    @Test
    fun `rejects a limit out of range`() {
        mvc.get("/api/audit?limit=0") { with(admin()) }.andExpect { status { isBadRequest() } }
        mvc.get("/api/audit?limit=1001") { with(admin()) }.andExpect { status { isBadRequest() } }
    }
}
```

`server/src/test/kotlin/geomap/server/OperationsTest.kt`:

```kotlin
package geomap.server

import org.junit.jupiter.api.Test
import org.springframework.test.web.servlet.get
import kotlin.test.assertTrue

class OperationsTest : IntegrationTest() {
    @Test
    fun `exposes Prometheus metrics without a token`() {
        val body =
            mvc
                .get("/actuator/prometheus")
                .andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString
        assertTrue(body.contains("jvm_memory_used_bytes"))
    }

    @Test
    fun `describes the API in OpenAPI for authenticated callers`() {
        mvc.get("/v3/api-docs").andExpect { status { isUnauthorized() } }
        val body =
            mvc
                .get("/v3/api-docs") { with(planner()) }
                .andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString
        assertTrue(body.contains("/api/missions/{missionId}/features/{featureId}/accept"))
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd server && ./gradlew test --tests geomap.server.audit.AuditApiTest --tests geomap.server.OperationsTest`
Expected: FAIL — `/api/audit` returns 404, `/actuator/prometheus` returns 401, `/v3/api-docs` returns 404 with a token.

- [ ] **Step 3: Write the implementation**

In `server/build.gradle.kts`, add to `dependencies`:

```kotlin
    runtimeOnly("io.micrometer:micrometer-registry-prometheus")
    // springdoc 3.x is the line for Spring Boot 4; if 3.0.0 does not resolve or fails at startup, use the latest 3.x and report it.
    implementation("org.springdoc:springdoc-openapi-starter-webmvc-api:3.0.0")
```

In `server/src/main/resources/application.yml`, change `include: health` to:

```yaml
        include: health,prometheus
```

In `SecurityConfig.securityFilterChain`, add after the health rule:

```kotlin
                // Scraped by Prometheus inside the cluster; exposure outside is blocked by the ALIAS network policy.
                authorize("/actuator/prometheus", permitAll)
```

`server/src/main/kotlin/geomap/server/audit/AuditController.kt`:

```kotlin
package geomap.server.audit

import geomap.server.web.InvalidInputException
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/audit")
@PreAuthorize("hasRole('administrateur')")
class AuditController(
    private val audit: AuditRepository,
) {
    @GetMapping
    fun latest(
        @RequestParam(defaultValue = "100") limit: Int,
    ): List<AuditEvent> {
        if (limit !in 1..1000) throw InvalidInputException("limit must be between 1 and 1000")
        return audit.latest(limit)
    }
}
```

- [ ] **Step 4: Run the quality gate**

Run: `cd server && ./gradlew ktlintFormat && cd .. && make check`
Expected: `BUILD SUCCESSFUL`; all server and shared tests pass.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(server): add audit API, Prometheus metrics and OpenAPI description"
```
