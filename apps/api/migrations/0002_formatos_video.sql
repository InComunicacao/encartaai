-- Formatos de vídeo do cliente: os painéis de LED e TVs de cada loja.
-- Os formatos de fábrica (Stories, TV, LED quadrado, faixa) vivem no
-- código do motor; aqui fica só o que o cliente cadastra.
CREATE TABLE formatos_video (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nome        TEXT NOT NULL,
    w           INTEGER NOT NULL,
    h           INTEGER NOT NULL,
    rotacao     INTEGER NOT NULL DEFAULT 0,          -- 0, 90, -90
    layout      TEXT,                                -- 'card' | 'faixa' | NULL (pela proporção)
    animacao    TEXT,                                -- 'deslizar' | 'passagem' | 'surgir' | NULL
    fundo       TEXT NOT NULL DEFAULT 'arte',        -- 'encarte' | 'arte' | 'cor'
    arte_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
    dur_produto REAL,
    max_produtos INTEGER,
    dur_max     INTEGER,
    criado_em   INTEGER NOT NULL
);
CREATE INDEX formatos_video_tenant ON formatos_video(tenant_id, nome);
