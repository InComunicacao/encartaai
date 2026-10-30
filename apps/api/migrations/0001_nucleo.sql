-- EncartaAi 3.0 — núcleo multi-cliente.
--
-- REGRA QUE SEGURA O SISTEMA: toda tabela de conteúdo tem tenant_id, e
-- a API sempre filtra pelo tenant da SESSÃO, nunca por um id vindo do
-- navegador. Ver src/lib/contexto.ts.
--
-- Datas em milissegundos desde 1970 (INTEGER), como Date.now().
-- Ids são texto aleatório (crypto.randomUUID), não sequenciais: um id
-- sequencial na URL deixa adivinhar o próximo cliente.

-- O D1 já aplica chaves estrangeiras por padrão; não há PRAGMA aqui.

-- ── PLANOS E MÓDULOS ────────────────────────────────────────────────
-- O plano é o padrão; tenant_modulos sobrescreve por cliente (bônus,
-- teste, cliente especial). Quem decide é src/lib/modulos.ts.
CREATE TABLE planos (
    id              TEXT PRIMARY KEY,           -- 'basico' | 'profissional' | 'completo'
    nome            TEXT NOT NULL,
    preco_centavos  INTEGER NOT NULL,
    acessos_inclusos INTEGER NOT NULL DEFAULT 1,
    preco_acesso_extra_centavos INTEGER,        -- NULL = plano não vende acesso extra
    creditos_ia_mes INTEGER NOT NULL DEFAULT 0,
    ativo           INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE modulos (
    id    TEXT PRIMARY KEY,                     -- 'encarte', 'video', 'social', 'impressao', 'ia', 'integracao', 'bonus_qr', ...
    nome  TEXT NOT NULL,
    grupo TEXT NOT NULL DEFAULT 'principal'     -- 'principal' | 'bonus'
);

CREATE TABLE plano_modulos (
    plano_id  TEXT NOT NULL REFERENCES planos(id),
    modulo_id TEXT NOT NULL REFERENCES modulos(id),
    PRIMARY KEY (plano_id, modulo_id)
);

-- ── CLIENTES (TENANTS) ──────────────────────────────────────────────
CREATE TABLE tenants (
    id              TEXT PRIMARY KEY,
    slug            TEXT NOT NULL UNIQUE,       -- subdomínio: <slug>.encartaai.com.br
    nome            TEXT NOT NULL,
    plano_id        TEXT NOT NULL REFERENCES planos(id),
    acessos_extras  INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'ativo',  -- 'ativo' | 'suspenso' | 'cancelado'
    criado_em       INTEGER NOT NULL
);

CREATE TABLE tenant_modulos (
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    modulo_id TEXT NOT NULL REFERENCES modulos(id),
    ativo     INTEGER NOT NULL,                 -- 1 libera fora do plano, 0 bloqueia dentro dele
    motivo    TEXT,
    PRIMARY KEY (tenant_id, modulo_id)
);

-- ── USUÁRIOS E SESSÕES ──────────────────────────────────────────────
-- papel: 'super' (você), 'dono', 'editor', 'operador'.
-- super tem tenant_id NULL: não pertence a cliente nenhum.
CREATE TABLE usuarios (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT REFERENCES tenants(id) ON DELETE CASCADE,
    email       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    nome        TEXT NOT NULL,
    senha_hash  TEXT NOT NULL,
    papel       TEXT NOT NULL CHECK (papel IN ('super', 'dono', 'editor', 'operador')),
    ativo       INTEGER NOT NULL DEFAULT 1,
    criado_em   INTEGER NOT NULL,
    CHECK ((papel = 'super') = (tenant_id IS NULL))
);
CREATE INDEX usuarios_tenant ON usuarios(tenant_id);

-- Guarda o HASH do token, nunca o token: um vazamento do banco não vira
-- login. Acesso único: ao entrar, as outras sessões do usuário são
-- marcadas como substituídas (src/lib/sessao.ts).
CREATE TABLE sessoes (
    token_hash      TEXT PRIMARY KEY,
    usuario_id      TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    criada_em       INTEGER NOT NULL,
    expira_em       INTEGER NOT NULL,
    substituida_em  INTEGER,                    -- outro computador entrou
    encerrada_em    INTEGER,                    -- logout
    agente          TEXT
);
CREATE INDEX sessoes_usuario ON sessoes(usuario_id);

-- ── MARCA DO CLIENTE ────────────────────────────────────────────────
CREATE TABLE lojas (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nome        TEXT NOT NULL,
    logo_asset_id TEXT,
    rodape_texto TEXT,
    criado_em   INTEGER NOT NULL
);
CREATE INDEX lojas_tenant ON lojas(tenant_id);

-- Um kit por cliente. JSON porque os campos vão crescer (fontes por
-- papel, paleta, textos padrão) e cada mudança não deve exigir migração.
CREATE TABLE kits_marca (
    tenant_id   TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    dados       TEXT NOT NULL DEFAULT '{}',
    atualizado_em INTEGER NOT NULL
);

-- Arquivos no R2. A chave no R2 começa com tenants/<tenant_id>/ — o
-- banco global (tenant_id NULL) mora em global/.
CREATE TABLE assets (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT REFERENCES tenants(id) ON DELETE CASCADE,
    tipo        TEXT NOT NULL CHECK (tipo IN ('produto', 'logo', 'tema', 'fundo', 'selo', 'personagem', 'fonte', 'export')),
    r2_chave    TEXT NOT NULL UNIQUE,
    nome        TEXT NOT NULL,
    mime        TEXT NOT NULL,
    bytes       INTEGER NOT NULL,
    largura     INTEGER,
    altura      INTEGER,
    etiquetas   TEXT NOT NULL DEFAULT '[]',
    criado_em   INTEGER NOT NULL
);
CREATE INDEX assets_tenant_tipo ON assets(tenant_id, tipo);

-- ── PRODUTOS E BANCO DE IMAGENS ─────────────────────────────────────
CREATE TABLE produtos (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    ean         TEXT,
    nome        TEXT NOT NULL,
    descricao   TEXT,
    categoria   TEXT,
    criado_em   INTEGER NOT NULL
);
CREATE UNIQUE INDEX produtos_tenant_ean ON produtos(tenant_id, ean) WHERE ean IS NOT NULL;
CREATE INDEX produtos_tenant_nome ON produtos(tenant_id, nome);

CREATE TABLE produto_imagens (
    produto_id  TEXT NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
    asset_id    TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    principal   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (produto_id, asset_id)
);

-- O nome que alguém digitou e confirmou como sendo aquele produto.
-- Na próxima campanha, o mesmo texto acha a foto sem perguntar.
CREATE TABLE produto_apelidos (
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    apelido_normalizado TEXT NOT NULL,
    produto_id  TEXT NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
    PRIMARY KEY (tenant_id, apelido_normalizado)
);

-- ── CAMPANHAS ───────────────────────────────────────────────────────
CREATE TABLE campanhas (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    loja_id     TEXT REFERENCES lojas(id) ON DELETE SET NULL,
    nome        TEXT NOT NULL,
    validade_de TEXT,                           -- 'AAAA-MM-DD'
    validade_ate TEXT,
    tema        TEXT NOT NULL DEFAULT '{}',     -- fundo, estilo de caixa, rodapé, grade, política de texto
    criado_por  TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em   INTEGER NOT NULL,
    atualizado_em INTEGER NOT NULL
);
CREATE INDEX campanhas_tenant ON campanhas(tenant_id, atualizado_em);

CREATE TABLE campanha_itens (
    id          TEXT PRIMARY KEY,
    campanha_id TEXT NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    ordem       INTEGER NOT NULL,
    produto_id  TEXT REFERENCES produtos(id) ON DELETE SET NULL,
    dados       TEXT NOT NULL DEFAULT '{}'      -- nome, preço, fator, combinado, selo, ajustes pontuais
);
CREATE INDEX itens_campanha ON campanha_itens(campanha_id, ordem);

-- Cada saída da campanha guarda só o que difere do template.
CREATE TABLE saidas (
    id          TEXT PRIMARY KEY,
    campanha_id TEXT NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    modulo_id   TEXT NOT NULL REFERENCES modulos(id),
    template_id TEXT NOT NULL,
    ajustes     TEXT NOT NULL DEFAULT '{}',
    criado_em   INTEGER NOT NULL
);

-- ── CONSUMO ─────────────────────────────────────────────────────────
-- Uma linha por cliente, mês e métrica ('exportacoes', 'creditos_ia').
CREATE TABLE consumo (
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    mes         TEXT NOT NULL,                  -- 'AAAA-MM'
    metrica     TEXT NOT NULL,
    quantidade  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, mes, metrica)
);

-- Registro de ações que apagam ou mudam plano/módulo.
CREATE TABLE auditoria (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT,
    usuario_id  TEXT,
    acao        TEXT NOT NULL,
    detalhe     TEXT NOT NULL DEFAULT '{}',
    criado_em   INTEGER NOT NULL
);

-- ── DADOS INICIAIS ──────────────────────────────────────────────────
INSERT INTO planos (id, nome, preco_centavos, acessos_inclusos, preco_acesso_extra_centavos, creditos_ia_mes) VALUES
    ('basico',       'Básico',       990,  1, NULL, 0),
    ('profissional', 'Profissional', 1890, 1, NULL, 0),
    ('completo',     'Completo',     3190, 1, 990,  300);

INSERT INTO modulos (id, nome, grupo) VALUES
    ('encarte',      'Encarte digital',       'principal'),
    ('video',        'Vídeo e LED',           'principal'),
    ('social',       'Redes sociais',         'principal'),
    ('impressao',    'Impressão',             'principal'),
    ('ia',           'Inteligência artificial','principal'),
    ('integracao',   'Uma campanha, todas as saídas', 'principal'),
    ('fonte_gotham', 'Fonte Gotham',          'principal'),
    ('bonus_qr',     'QR Code com relatório', 'bonus'),
    ('bonus_whats',  'Link de WhatsApp',      'bonus'),
    ('bonus_links',  'Redutor de links',      'bonus'),
    ('bonus_agenda', 'Calendário comercial',  'bonus');

INSERT INTO plano_modulos (plano_id, modulo_id) VALUES
    ('basico', 'encarte'),
    ('profissional', 'encarte'), ('profissional', 'video'), ('profissional', 'social'),
    ('completo', 'encarte'), ('completo', 'video'), ('completo', 'social'),
    ('completo', 'impressao'), ('completo', 'ia'), ('completo', 'integracao'),
    ('completo', 'fonte_gotham'),
    ('completo', 'bonus_qr'), ('completo', 'bonus_whats'),
    ('completo', 'bonus_links'), ('completo', 'bonus_agenda');
