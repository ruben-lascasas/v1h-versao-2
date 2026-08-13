import { useEffect, useState } from 'react';

/**
 * Diz se o utilizador autenticado é administrador.
 *
 * Quem decide é o servidor, comparando o email da sessão com ADMIN_EMAILS. O
 * cliente não pode fazer essa conta: a lista de administradores não está — nem
 * deve estar — no pacote que vai para o browser.
 *
 * Serve só para decidir o que mostrar no menu. Quem forjar um `true` daqui não
 * ganha nada: os endpoints do painel voltam a verificar por sua conta.
 *
 * A resposta é guardada em memória durante a sessão da página, para o menu não
 * disparar um pedido por cada vez que é montado.
 */

let emCache = null;
let pedidoEmCurso = null;

/** Esquece o resultado — usado ao terminar sessão e nos testes. */
export const resetIsAdminCache = () => {
  emCache = null;
  pedidoEmCurso = null;
};

export const useIsAdmin = isAuthenticated => {
  const [isAdmin, setIsAdmin] = useState(emCache ?? false);

  useEffect(() => {
    if (!isAuthenticated) {
      resetIsAdminCache();
      setIsAdmin(false);
      return;
    }
    if (emCache !== null) {
      setIsAdmin(emCache);
      return;
    }

    let vivo = true;
    if (!pedidoEmCurso) {
      pedidoEmCurso = fetch('/api/verification-admin/me', { credentials: 'include' })
        .then(r => (r.ok ? r.json() : { isAdmin: false }))
        .then(d => {
          emCache = Boolean(d?.isAdmin);
          return emCache;
        })
        .catch(() => {
          // Uma falha de rede não pode dar acesso nem partir o menu.
          emCache = false;
          return false;
        })
        .finally(() => {
          pedidoEmCurso = null;
        });
    }
    pedidoEmCurso.then(v => {
      if (vivo) setIsAdmin(v);
    });

    return () => {
      vivo = false;
    };
  }, [isAuthenticated]);

  return isAdmin;
};

export default useIsAdmin;
