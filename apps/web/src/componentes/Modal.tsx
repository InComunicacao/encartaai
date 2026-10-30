import { useEffect, type ReactNode } from 'react';

export function Modal({ titulo, children, aoFechar, acoes }: {
  titulo: string; children: ReactNode; aoFechar?: () => void; acoes?: ReactNode;
}) {
  useEffect(() => {
    if (!aoFechar) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [aoFechar]);
  return (
    <div className="fundo-modal" onMouseDown={(e) => { if (e.target === e.currentTarget && aoFechar) aoFechar(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo}>
        <h2>{titulo}</h2>
        {children}
        {acoes && <div className="acoes">{acoes}</div>}
      </div>
    </div>
  );
}

// Mensagem de erro/sucesso inline, que some sozinha quando é sucesso.
export function Aviso({ tipo = 'erro', children }: { tipo?: 'erro' | 'ok' | 'alerta'; children: ReactNode }) {
  if (!children) return null;
  return <div className={'aviso ' + (tipo === 'alerta' ? '' : tipo)} role={tipo === 'erro' ? 'alert' : 'status'}>{children}</div>;
}
