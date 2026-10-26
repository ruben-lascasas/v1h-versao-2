import React, { useCallback, useEffect, useState } from 'react';

import css from './VerificationAdminPage.module.css';

/**
 * A fila dos anúncios à espera de decisão.
 *
 * PORQUE É QUE ISTO EXISTE
 *
 * Um anúncio novo é fechado à nascença e marcado com `listingPending`. Até
 * aqui, a única forma de o aprovar eram os links no email que o servidor manda
 * ao administrador — o processo inteiro dependia de um email chegar.
 *
 * Em Outubro de 2026 descobriu-se que os emails deste marketplace não eram
 * entregues de todo: o domínio não estava verificado no Resend e as 26 chamadas
 * de envio davam o 403 por entrega. O resultado foi o anúncio de uma cliente
 * real invisível durante 13 dias, depois de lhe termos dito que a análise
 * demora menos de 48 horas, sem ninguém dar por nada.
 *
 * Com a fila visível aqui, um email perdido deixa de ser um anúncio perdido.
 *
 * Vive na página das verificações de propósito, e não numa página nova: quem
 * tem permissão para validar documentos tem a mesma permissão para decidir
 * sobre anúncios, por isso reaproveita-se o `ADMIN_EMAILS` que o servidor já
 * verifica em vez de inventar outro portão.
 */

const DIA = 24 * 60 * 60 * 1000;

/**
 * Há quantos dias está à espera.
 *
 * É o número que interessa nesta página: foi um anúncio esquecido 13 dias que
 * deu origem a tudo isto. Exportado para poder ser testado sem montar interface.
 *
 * @param {string} criadoEm ISO
 * @param {number} [agora]
 * @returns {number|null}
 */
export const diasAEspera = (criadoEm, agora = Date.now()) => {
  const t = Date.parse(criadoEm);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((agora - t) / DIA));
};

/** A frase da espera, com o aviso quando já passou do prometido. */
export const fraseDaEspera = dias => {
  if (dias == null) return '';
  if (dias === 0) return 'submetido hoje';
  if (dias === 1) return 'à espera há 1 dia';
  return `à espera há ${dias} dias`;
};

const Linha = ({ anuncio, onDecidido }) => {
  const [aEnviar, setAEnviar] = useState(null);
  const [erro, setErro] = useState(false);
  const [aRecusar, setARecusar] = useState(false);
  const [motivo, setMotivo] = useState('');

  const decidir = async action => {
    setAEnviar(action);
    setErro(false);
    try {
      const res = await fetch('/api/verification-admin/listing-decision', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: anuncio.id, action, reason: motivo || null }),
      });
      if (!res.ok) throw new Error('falhou');
      onDecidido(anuncio.id, action);
    } catch (_) {
      setErro(true);
      setAEnviar(null);
    }
  };

  const dias = diasAEspera(anuncio.createdAt);
  // 2 dias é o que prometemos ao anfitrião ("menos de 48 horas").
  const atrasado = anuncio.estado === 'a_espera' && dias != null && dias > 2;

  return (
    <li className={css.anuncioItem}>
      <div>
        <p className={css.anuncioTitulo}>
          {anuncio.title || '(sem título)'}
          {anuncio.estado === 'recusado' ? (
            <span className={css.anuncioRecusado}>recusado</span>
          ) : atrasado ? (
            <span className={css.anuncioAtrasado}>{fraseDaEspera(dias)}</span>
          ) : null}
        </p>
        <p className={css.anuncioMeta}>
          {anuncio.autor?.nome || '(sem nome)'}
          {anuncio.autor?.email ? ` · ${anuncio.autor.email}` : ''}
          {!atrasado && anuncio.estado === 'a_espera' ? ` · ${fraseDaEspera(dias)}` : ''}
        </p>
        <p className={css.anuncioMeta}>
          <a
            href={`/l/${anuncio.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className={css.anuncioLink}
          >
            Ver o anúncio ↗
          </a>
        </p>
      </div>

      <div className={css.anuncioAccoes}>
        {erro ? <span className={css.anuncioErro}>Não resultou. Tente outra vez.</span> : null}

        {aRecusar ? (
          <>
            <input
              type="text"
              className={css.anuncioMotivo}
              placeholder="Motivo (vai no email ao anfitrião)"
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              aria-label="Motivo da recusa"
            />
            <button
              type="button"
              className={css.botaoRecusar}
              disabled={!!aEnviar}
              onClick={() => decidir('reject')}
            >
              {aEnviar === 'reject' ? 'A recusar…' : 'Confirmar recusa'}
            </button>
            <button
              type="button"
              className={css.botaoNeutro}
              disabled={!!aEnviar}
              onClick={() => {
                setARecusar(false);
                setMotivo('');
              }}
            >
              Cancelar
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={css.botaoAprovar}
              disabled={!!aEnviar}
              onClick={() => decidir('approve')}
            >
              {aEnviar === 'approve' ? 'A aprovar…' : 'Aprovar'}
            </button>
            {/* Recusar pede confirmação: manda um email ao anfitrião a dizer
                que o anúncio dele precisa de alterações, e isso não se desfaz
                com um clique enganado. */}
            {anuncio.estado === 'a_espera' ? (
              <button
                type="button"
                className={css.botaoNeutro}
                disabled={!!aEnviar}
                onClick={() => setARecusar(true)}
              >
                Recusar
              </button>
            ) : null}
          </>
        )}
      </div>
    </li>
  );
};

const ListingsPorAprovar = () => {
  const [estado, setEstado] = useState({ loading: true, listings: [], error: null });

  const carregar = useCallback(async () => {
    setEstado(s => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch('/api/verification-admin/listings', { credentials: 'include' });
      if (res.status === 403) {
        setEstado({ loading: false, listings: [], error: 'forbidden' });
        return;
      }
      if (!res.ok) throw new Error('falhou');
      const { listings } = await res.json();
      setEstado({ loading: false, listings: listings || [], error: null });
    } catch (_) {
      setEstado({ loading: false, listings: [], error: 'failed' });
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Tira-se a linha decidida em vez de recarregar tudo: recarregar perdia a
  // posição na página, e quem está a decidir em série nota isso logo.
  const aoDecidir = (id, action) => {
    setEstado(s => ({
      ...s,
      listings:
        action === 'approve'
          ? s.listings.filter(l => l.id !== id)
          : s.listings.map(l => (l.id === id ? { ...l, estado: 'recusado' } : l)),
    }));
  };

  const { loading, listings, error } = estado;

  // Quem não é administrador já vê a mensagem na secção dos documentos; aqui
  // cala-se, em vez de repetir o mesmo aviso duas vezes na mesma página.
  if (error === 'forbidden') return null;

  const aEspera = listings.filter(l => l.estado === 'a_espera');

  return (
    <section className={css.seccaoAnuncios}>
      <h2 className={css.seccaoTitulo}>Anúncios à espera de aprovação</h2>

      {loading ? (
        <p className={css.notice}>A carregar…</p>
      ) : error ? (
        <p className={css.notice}>Não foi possível carregar os anúncios.</p>
      ) : listings.length === 0 ? (
        <p className={css.notice}>Nenhum anúncio à espera de decisão.</p>
      ) : (
        <>
          <p className={css.resumo}>
            {aEspera.length === 0
              ? 'Nada por decidir de momento.'
              : `${aEspera.length} anúncio${aEspera.length === 1 ? '' : 's'} à espera de decisão.`}
          </p>
          <ul className={css.anuncioLista}>
            {listings.map(l => (
              <Linha key={l.id} anuncio={l} onDecidido={aoDecidir} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
};

export default ListingsPorAprovar;
