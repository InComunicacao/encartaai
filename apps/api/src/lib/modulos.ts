// Quais módulos um cliente pode usar.
//
// Regra: o plano define o padrão; tenant_modulos sobrescreve, para mais
// (bônus, período de teste) ou para menos (bloqueio). Esconder um botão
// no front é só conforto — TODA rota que entrega um módulo chama
// exigirModulo(), e é isso que protege.

export async function modulosDoTenant(db: D1Database, tenantId: string): Promise<Set<string>> {
  const { results } = await db.prepare(
    `SELECT pm.modulo_id AS id
       FROM tenants t JOIN plano_modulos pm ON pm.plano_id = t.plano_id
      WHERE t.id = ?1
        AND NOT EXISTS (SELECT 1 FROM tenant_modulos tm
                         WHERE tm.tenant_id = ?1 AND tm.modulo_id = pm.modulo_id AND tm.ativo = 0)
     UNION
     SELECT modulo_id AS id FROM tenant_modulos WHERE tenant_id = ?1 AND ativo = 1`)
    .bind(tenantId).all<{ id: string }>();
  return new Set(results.map((r) => r.id));
}

// Acessos: os inclusos no plano + os extras contratados.
export async function limiteDeAcessos(db: D1Database, tenantId: string): Promise<number> {
  const r = await db.prepare(
    `SELECT p.acessos_inclusos + t.acessos_extras AS limite
       FROM tenants t JOIN planos p ON p.id = t.plano_id WHERE t.id = ?`)
    .bind(tenantId).first<{ limite: number }>();
  return r ? r.limite : 0;
}

export async function acessosEmUso(db: D1Database, tenantId: string): Promise<number> {
  const r = await db.prepare('SELECT COUNT(*) AS n FROM usuarios WHERE tenant_id = ? AND ativo = 1')
    .bind(tenantId).first<{ n: number }>();
  return r ? r.n : 0;
}
