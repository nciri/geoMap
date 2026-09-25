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
