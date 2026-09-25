package geomap.server.security

import org.springframework.core.convert.converter.Converter
import org.springframework.security.authentication.AbstractAuthenticationToken
import org.springframework.security.core.GrantedAuthority
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken

object KeycloakRoles {
    fun authorities(jwt: Jwt): Collection<GrantedAuthority> {
        val roles = jwt.getClaimAsMap("realm_access")?.get("roles") as? Collection<*> ?: return emptyList()
        return roles.filterIsInstance<String>().map { SimpleGrantedAuthority("ROLE_$it") }
    }

    fun converter(): Converter<Jwt, AbstractAuthenticationToken> =
        Converter<Jwt, AbstractAuthenticationToken> { jwt ->
            JwtAuthenticationToken(
                jwt,
                authorities(jwt),
                jwt.getClaimAsString("preferred_username") ?: jwt.subject ?: throw InvalidBearerTokenException("token has no subject"),
            )
        }
}
