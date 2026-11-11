import React, { useCallback, useEffect, useState } from 'react';

import css from './EditListingAvailabilityPanel.module.css';

/**
 * Ligar um calendário externo (iCal) ao anúncio.
 *
 * PARA QUE SERVE
 *
 * Quem já gere a agenda do espaço noutro sítio — Google, Outlook, o PMS do
 * hotel, outra plataforma de aluguer — não a vai manter em dois sítios. Vai
 * esquecer-se de um, e o esquecido é sempre este. O resultado é uma reserva
 * aqui em cima de uma sala já ocupada, com alguém a chegar e não ter onde
 * entrar.
 *
 * Com o endereço iCal, as horas ocupadas lá fora passam a ficar bloqueadas cá
 * dentro sozinhas.
 *
 * O QUE ESTE ECRÃ TEM DE DIZER COM HONESTIDADE
 *
 * Duas coisas, porque escondê-las seria prometer mais do que se entrega:
 *
 *   1. A leitura é periódica, não instantânea. Há sempre uma janela entre
 *      ocupar a sala lá fora e ela ficar bloqueada aqui.
 *   2. Só se lê. Uma reserva feita na Venue1Hub não aparece no calendário do
 *      anfitrião — isso exigiria integração à medida com cada sistema.
 */

const mascarar = url => {
  try {
    const u = new URL(url);
    const fim = u.pathname.split('/').filter(Boolean).pop() || '';
    return `${u.hostname}/…${fim.slice(-12)}`;
  } catch (_) {
    return url.slice(0, 40);
  }
};

const dataCurta = iso => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString('pt-PT', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (_) {
    return null;
  }
};

const CalendariosIcal = ({ listingId }) => {
  const [estado, setEstado] = useState({ loading: true, feeds: [], sincronizacao: null });
  const [url, setUrl] = useState('');
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState(null);
  const [aGravar, setAGravar] = useState(false);

  const carregar = useCallback(async () => {
    if (!listingId) return;
    try {
      const res = await fetch(`/api/ical-feeds?listingId=${encodeURIComponent(listingId)}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('falhou');
      const dados = await res.json();
      setEstado({
        loading: false,
        feeds: dados.feeds || [],
        sincronizacao: dados.sincronizacao || null,
      });
    } catch (_) {
      setEstado(s => ({ ...s, loading: false }));
    }
  }, [listingId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const acrescentar = async e => {
    e.preventDefault();
    if (!url.trim()) return;
    setAGravar(true);
    setErro(null);
    try {
      const res = await fetch('/api/ical-feeds', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId, url: url.trim(), nome: nome.trim() }),
      });
      const dados = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(
          dados.motivo ||
            (dados.error === 'ja-existe'
              ? 'Esse calendário já está ligado.'
              : dados.error === 'demasiados-calendarios'
                ? 'Já tem o máximo de calendários ligados.'
                : 'Não foi possível ligar esse calendário.')
        );
        return;
      }
      setEstado(s => ({ ...s, feeds: dados.feeds || [] }));
      setUrl('');
      setNome('');
    } catch (_) {
      setErro('Não foi possível ligar esse calendário.');
    } finally {
      setAGravar(false);
    }
  };

  const remover = async feedUrl => {
    setErro(null);
    try {
      const res = await fetch('/api/ical-feeds', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId, url: feedUrl }),
      });
      const dados = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error('falhou');
      setEstado(s => ({ ...s, feeds: dados.feeds || [] }));
    } catch (_) {
      setErro('Não foi possível remover esse calendário.');
    }
  };

  if (!listingId) return null;

  const { loading, feeds, sincronizacao } = estado;

  return (
    <section className={css.section}>
      <h3 className={css.icalTitulo}>Ligar um calendário externo</h3>
      <p className={css.icalIntro}>
        Se já gere a agenda deste espaço no Google, no Outlook ou noutro sistema, cole aqui o
        endereço iCal. As horas ocupadas lá passam a ficar bloqueadas aqui, sem ter de as repetir.
      </p>

      {/* A regra que decide se isto funciona ou estraga tudo.
          Quem tem três salas e uma agenda só vai colá-la nos três anúncios —
          nada lhe diz que não deve — e fica com as três bloqueadas sempre que
          uma delas é usada. Só dá por isso ao perder reservas de salas que
          estavam livres, e aí já não liga a causa ao efeito. */}
      <p className={css.icalRegra}>
        <strong>Um calendário por espaço.</strong> O endereço tem de ser o da agenda{' '}
        <em>deste</em> espaço. Se colar aqui uma agenda que junta várias salas, qualquer reserva
        dela bloqueia este anúncio.
      </p>

      <p className={css.icalNota}>
        Onde o encontrar: nas definições de partilha do calendário dessa sala, procure a secção de
        integração e o endereço em <strong>formato iCal</strong> (no Google pode ser preciso tornar
        o calendário público; no Outlook, publicar o calendário).
      </p>

      {loading ? (
        <p className={css.icalNota}>A carregar…</p>
      ) : (
        <>
          {feeds.length > 0 ? (
            <ul className={css.icalLista}>
              {feeds.map(f => (
                <li key={f.url} className={css.icalItem}>
                  <span>
                    <strong>{f.nome || 'Calendário'}</strong>
                    <span className={css.icalUrl}> {mascarar(f.url)}</span>
                  </span>
                  <button
                    type="button"
                    className={css.icalRemover}
                    onClick={() => remover(f.url)}
                  >
                    Remover
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <form onSubmit={acrescentar} className={css.icalFormulario}>
            <input
              type="url"
              className={css.icalCampo}
              placeholder="https://… ou webcal://…"
              value={url}
              onChange={e => setUrl(e.target.value)}
              aria-label="Endereço do calendário"
            />
            <input
              type="text"
              className={css.icalCampoNome}
              placeholder="Nome (opcional)"
              value={nome}
              onChange={e => setNome(e.target.value)}
              aria-label="Nome do calendário"
            />
            <button type="submit" className={css.icalBotao} disabled={aGravar || !url.trim()}>
              {aGravar ? 'A ligar…' : 'Ligar'}
            </button>
          </form>

          {erro ? <p className={css.icalErro}>{erro}</p> : null}

          {sincronizacao?.ultima ? (
            <p className={css.icalNota}>
              Última leitura: {dataCurta(sincronizacao.ultima)} · {sincronizacao.bloqueios}{' '}
              {sincronizacao.bloqueios === 1 ? 'período bloqueado' : 'períodos bloqueados'}
              {sincronizacao.ultimoErro ? (
                <span className={css.icalErro}> · {sincronizacao.ultimoErro}</span>
              ) : null}
            </p>
          ) : null}

          {/* Dito à frente, e não em letra pequena: prometer tempo real seria
              mentir, e descobre-se da pior maneira — com uma reserva dupla.

              O número vem do ICAL_SYNC_CRON do servidor, hoje a cada 5
              minutos — quem mudar essa variável tem de mudar esta frase. */}
          {feeds.length > 0 ? (
            <p className={css.icalNota}>
              O calendário é lido a cada 5 minutos, por isso uma reserva feita agora no seu
              sistema pode demorar esse tempo a bloquear aqui. E a leitura é só num sentido: as
              reservas feitas na Venue1Hub não aparecem no seu calendário.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
};

export default CalendariosIcal;
