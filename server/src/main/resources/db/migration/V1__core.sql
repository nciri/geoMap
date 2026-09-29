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
