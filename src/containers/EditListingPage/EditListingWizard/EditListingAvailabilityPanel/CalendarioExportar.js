import React, { useCallback, useEffect, useState } from 'react';

import css from './EditListingAvailabilityPanel.module.css';

/**
 * As reservas da Venue1Hub no calendário do anfitrião.
 *
 * O sentido contrário de CalendariosIcal: em vez de lermos a agenda dele,
 * damos-lhe um endereço que o Google, o Outlook ou o PMS do hotel subscrevem.
 * As reservas aceites aparecem lá sozinhas.
 *
 * O QUE ESTE ECRÃ TEM DE DIZER COM HONESTIDADE
 *
 * Quem decide quando o calendário volta a ler o endereço é o calendário, não
 * nós. O Outlook costuma demorar horas e o Google até um dia. Prometer "na
 * hora" seria descoberto da pior maneira.
 *
 * E o endereço é a chave: quem o tiver vê as reservas do espaço. Por isso há
 * um botão para o trocar, que mata o antigo.
 */
const CalendarioExportar = ({ listingId }) => {
  const [estado, setEstado] = useState({ loading: true, url: null, erro: null });
  const [copiado, setCopiado] = useState(false);
  const [aTrocar, setATrocar] = useState(false);

  const carregar = useCallback(async () => {
    if (!listingId) return;
    try {
      const res = await fetch(`/api/ical-export?listingId=${encodeURIComponent(listingId)}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('falhou');
      const dados = await res.json();
      setEstado({ loading: false, url: dados.url, erro: null });
    } catch (_) {
      setEstado({ loading: false, url: null, erro: 'Não foi possível obter o endereço. Recarregue a página.' });
    }
  }, [listingId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(estado.url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch (_) {
      // Sem acesso à área de transferência (alguns browsers, iframes): a
      // pessoa ainda pode selecionar o texto do campo e copiar à mão.
      setCopiado(false);
    }
  };

  const trocar = async () => {
    // eslint-disable-next-line no-alert
    const ok = window.confirm(
      'O endereço atual deixa de funcionar. Os calendários que o usam deixam de receber as reservas até lá colar o novo. Continuar?'
    );
    if (!ok) return;
    setATrocar(true);
    try {
      const res = await fetch('/api/ical-export/novo', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId }),
      });
      if (!res.ok) throw new Error('falhou');
      const dados = await res.json();
      setEstado({ loading: false, url: dados.url, erro: null });
    } catch (_) {
      setEstado(s => ({ ...s, erro: 'Não foi possível gerar um endereço novo. Tente outra vez.' }));
    } finally {
      setATrocar(false);
    }
  };

  if (!listingId) return null;

  return (
    <section className={css.section}>
      <h3 className={css.icalTitulo}>Enviar as reservas para o seu calendário</h3>
      <p className={css.icalIntro}>
        As reservas aceites deste espaço podem aparecer no seu Google Calendar, no Outlook ou no
        sistema de gestão do seu espaço. Adicione lá este endereço como calendário por URL (iCal).
      </p>

      {estado.loading ? (
        <p className={css.icalNota}>A carregar…</p>
      ) : estado.url ? (
        <>
          <div className={css.icalFormulario}>
            <input
              type="text"
              readOnly
              className={css.icalCampo}
              value={estado.url}
              onFocus={e => e.target.select()}
              aria-label="Endereço do calendário de reservas"
            />
            <button type="button" className={css.icalBotao} onClick={copiar}>
              {copiado ? 'Copiado' : 'Copiar'}
            </button>
          </div>

          <ul className={css.icalPassos}>
            <li>
              <strong>Google Calendar:</strong> em “Outros calendários”, carregue em + e escolha
              “A partir do URL”.
            </li>
            <li>
              <strong>Outlook:</strong> “Adicionar calendário” e depois “Subscrever a partir da
              Web”.
            </li>
            <li>
              <strong>Calendário da Apple:</strong> menu Ficheiro, “Nova subscrição de
              calendário”.
            </li>
            <li>
              <strong>Outros sistemas:</strong> procure “subscrever calendário” ou “importar iCal
              por URL”.
            </li>
          </ul>

          <p className={css.icalNota}>
            Só aparecem as reservas aceites; as canceladas desaparecem sozinhas. Quem decide
            quando o seu calendário volta a ler este endereço é ele: no Outlook costuma demorar
            algumas horas e no Google pode chegar a um dia.
          </p>

          <p className={css.icalRegra}>
            <strong>Guarde este endereço só para si.</strong> Quem o tiver consegue ver as reservas
            deste espaço. Se o partilhou por engano,{' '}
            <button type="button" className={css.icalLinkBotao} onClick={trocar} disabled={aTrocar}>
              {aTrocar ? 'a gerar…' : 'gere um endereço novo'}
            </button>
            .
          </p>
        </>
      ) : null}

      {estado.erro ? <p className={css.icalErro}>{estado.erro}</p> : null}
    </section>
  );
};

export default CalendarioExportar;
