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
