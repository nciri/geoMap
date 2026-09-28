package geomap.server.device

import com.jayway.jsonpath.JsonPath
import geomap.server.IntegrationTest
import geomap.server.security.Pem
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.request.RequestPostProcessor
import java.security.KeyPairGenerator
import java.security.PublicKey
import java.security.spec.ECGenParameterSpec

class DeviceApiTest : IntegrationTest() {
    companion object {
        val rsa3072: String by lazy {
            pem(
                KeyPairGenerator
                    .getInstance("RSA")
                    .apply { initialize(3072) }
                    .generateKeyPair()
                    .public,
            )
        }
        val rsa2048: String by lazy {
            pem(
                KeyPairGenerator
                    .getInstance("RSA")
                    .apply { initialize(2048) }
                    .generateKeyPair()
                    .public,
            )
        }
        val ec: String by lazy {
            pem(
                KeyPairGenerator
                    .getInstance("EC")
                    .apply { initialize(ECGenParameterSpec("secp256r1")) }
                    .generateKeyPair()
                    .public,
            )
        }

        // JSON-escaped PEM: newlines become the two characters \n.
        private fun pem(key: PublicKey) = Pem.encode(key, "PUBLIC KEY").replace("\n", "\\n")

        fun registration(
            name: String = "Tablette 01",
            cert: String = "a".repeat(64),
            key: String = rsa3072,
        ) = """{"name":"$name","certSha256":"$cert","encryptionPublicKeyPem":"$key"}"""
    }

    private fun register(
        body: String = registration(),
        who: RequestPostProcessor = admin(),
    ) = mvc.post("/api/devices") {
        with(who)
        contentType = MediaType.APPLICATION_JSON
        content = body
    }

    @Test
    fun `an administrator registers a device`() {
        register().andExpect {
            status { isCreated() }
            jsonPath("$.status") { value("ENROLLED") }
            jsonPath("$.certSha256") { value("a".repeat(64)) }
            jsonPath("$.encryptionKey") { doesNotExist() }
        }
    }

    @Test
    fun `rejects weak or non RSA keys and malformed fingerprints`() {
        register(registration(key = rsa2048)).andExpect { status { isBadRequest() } }
        register(registration(key = ec)).andExpect { status { isBadRequest() } }
        register(registration(cert = "A".repeat(64))).andExpect { status { isBadRequest() } }
        register(registration(cert = "ab:cd")).andExpect { status { isBadRequest() } }
        mvc.get("/api/devices") { with(admin()) }.andExpect { jsonPath("$.length()") { value(0) } }
    }

    @Test
    fun `a fingerprint is registered once`() {
        register()
        register(registration(name = "Tablette 02")).andExpect { status { isConflict() } }
    }

    @Test
    fun `revoking is idempotent`() {
        val id = JsonPath.read<String>(register().andReturn().response.contentAsString, "$.id")
        repeat(2) {
            mvc.post("/api/devices/$id/revoke") { with(admin()) }.andExpect {
                status { isOk() }
                jsonPath("$.status") { value("REVOKED") }
            }
        }
    }

    @Test
    fun `only an administrator registers or revokes, planners may list`() {
        register(who = planner()).andExpect { status { isForbidden() } }
        mvc.get("/api/devices") { with(planner()) }.andExpect { status { isOk() } }
        mvc.post("/api/devices/${java.util.UUID.randomUUID()}/revoke") { with(planner()) }.andExpect {
            status { isForbidden() }
        }
    }
}
