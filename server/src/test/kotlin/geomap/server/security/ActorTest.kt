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
