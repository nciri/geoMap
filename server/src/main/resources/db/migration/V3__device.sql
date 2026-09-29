CREATE TABLE device (
    id             UUID PRIMARY KEY,
    name           TEXT        NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
    cert_sha256    TEXT        NOT NULL UNIQUE CHECK (cert_sha256 ~ '^[0-9a-f]{64}$'),
    encryption_key TEXT        NOT NULL,
    status         TEXT        NOT NULL CHECK (status IN ('ENROLLED', 'REVOKED')),
    last_contact   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL
);

CREATE TABLE assignment (
    mission_id UUID NOT NULL REFERENCES mission (id) ON DELETE CASCADE,
    device_id  UUID NOT NULL REFERENCES device (id),
    PRIMARY KEY (mission_id, device_id)
);
