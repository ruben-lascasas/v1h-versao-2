import React, { useEffect, useState } from 'react';
import { compose } from 'redux';
import { connect } from 'react-redux';

import { isScrollingDisabled } from '../../ducks/ui.duck';
import { useLocale } from '../../context/localeContext';

import { Page, LayoutSingleColumn, NamedLink } from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';

import css from './ResolutionPage.module.css';

/**
 * Centro de Resolução de uma reserva.
 *
 * A Política de Resolução de Conflitos descreve este mecanismo; até aqui não
 * existia. Aqui abre-se o caso, junta-se prova, e a outra parte responde.
 *
 * O QUE ESTA PÁGINA TEM DE DIZER, E DIZ
 *
 * Que nenhum valor se move sozinho. O processo de reserva em uso não tem
 * transições de disputa, e um reembolso automático obrigava a publicar um
 * processo novo na Sharetribe. Alguém que abra um caso a pensar que o dinheiro
 * volta sozinho fica pior do que se não houvesse Centro nenhum.
 */

const dataCurta = iso => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
};

const euros = cents => (typeof cents === 'number' ? `${(cents / 100).toFixed(2)} €` : null);

/**
 * O estado do caso, escrito para uma pessoa ler.
 *
 * A página mostrava a chave interna tal e qual — "em_analise", com o
 * sublinhado à vista. Quem abre um caso de danos no espaço não devia ter de
 * decifrar nomes de campos.
 */
const ROTULO_ESTADO = {
  aberto: ['Aberto, à espera de resposta', 'Open, awaiting reply'],
  respondido: ['Respondido', 'Replied'],
  em_analise: ['Em análise pela Venue1Hub', 'Under review by Venue1Hub'],
  decidido: ['Decidido', 'Decided'],
  fechado: ['Fechado', 'Closed'],
};

const rotuloEstado = (estado, isEN) => {
  const r = ROTULO_ESTADO[estado];
  return r ? r[isEN ? 1 : 0] : estado;
};

const prazoPassou = caso =>
  !!caso && !caso.resposta && Date.parse(caso.prazoResposta) < Date.now();

export const ResolutionPageComponent = props => {
  const { scrollingDisabled, params } = props;
  const { locale } = useLocale();
  const isEN = locale === 'en';
  const id = params?.id;

  const [estado, setEstado] = useState({ fase: 'a-carregar' });
  const [form, setForm] = useState({ tipo: '', descricao: '', valor: '' });
  const [resposta, setResposta] = useState('');
  const [decisao, setDecisao] = useState({ sentido: '', fundamentacao: '', valor: '' });
  const [notaExecucao, setNotaExecucao] = useState('');
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState(null);

  const carregar = () => {
    fetch(`/api/resolution/${id}`, { credentials: 'include' })
      .then(async r => {
        const corpo = await r.json().catch(() => ({}));
        if (r.ok) setEstado({ fase: 'pronto', ...corpo });
        else setEstado({ fase: 'erro', codigo: r.status });
      })
      .catch(() => setEstado({ fase: 'erro', codigo: 0 }));
  };

  useEffect(carregar, [id]);

  const abrir = async e => {
    e.preventDefault();
    setAGravar(true);
    setErro(null);
    try {
      const r = await fetch(`/api/resolution/${id}/abrir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          tipo: form.tipo,
          descricao: form.descricao,
          valorCents: form.valor ? Math.round(parseFloat(form.valor) * 100) : null,
        }),
      });
      const corpo = await r.json().catch(() => ({}));
      if (r.ok) carregar();
      else setErro(corpo.error || 'nao-foi-possivel');
    } finally {
      setAGravar(false);
    }
  };

  const responder = async e => {
    e.preventDefault();
    setAGravar(true);
    setErro(null);
    try {
      const r = await fetch(`/api/resolution/${id}/responder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ texto: resposta, aceita: false }),
      });
      const corpo = await r.json().catch(() => ({}));
      if (r.ok) carregar();
      else setErro(corpo.error || 'nao-foi-possivel');
    } finally {
      setAGravar(false);
    }
  };

  /** Decisão da Venue1Hub. Só aparece a administradores. */
  const decidir = async e => {
    e.preventDefault();
    setAGravar(true);
    setErro(null);
    try {
      const r = await fetch(`/api/resolution/${id}/decidir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sentido: decisao.sentido,
          fundamentacao: decisao.fundamentacao,
          valorCents: decisao.valor ? Math.round(parseFloat(decisao.valor) * 100) : null,
        }),
      });
      const corpo = await r.json().catch(() => ({}));
      if (r.ok) carregar();
      else setErro(corpo.error || 'nao-foi-possivel');
    } finally {
      setAGravar(false);
    }
  };

  /** "Decidido" e "pago" são estados diferentes. Isto marca o segundo. */
  const marcarExecutada = async e => {
    e.preventDefault();
    setAGravar(true);
    setErro(null);
    try {
      const r = await fetch(`/api/resolution/${id}/executar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ nota: notaExecucao }),
      });
      const corpo = await r.json().catch(() => ({}));
      if (r.ok) carregar();
      else setErro(corpo.error || 'nao-foi-possivel');
    } finally {
      setAGravar(false);
    }
  };

  const caso = estado.caso;
  const souAdmin = estado.papel === 'venue1hub';
  const podeResponder = caso && !caso.resposta && caso.respondePor === estado.papel;

  return (
    <Page
      title={isEN ? 'Resolution Centre | Venue1Hub' : 'Centro de Resolução | Venue1Hub'}
      scrollingDisabled={scrollingDisabled}
    >
      <LayoutSingleColumn hideRecentlyViewed topbar={<TopbarContainer />} footer={<FooterContainer />}>
        <div className={css.content}>
          <NamedLink name="LegalPage" params={{ slug: 'resolucao-de-conflitos' }} className={css.voltar}>
            ‹ {isEN ? 'Dispute Resolution Policy' : 'Política de Resolução de Conflitos'}
          </NamedLink>

          <h1 className={css.titulo}>{isEN ? 'Resolution Centre' : 'Centro de Resolução'}</h1>

          {estado.fase === 'a-carregar' ? <p className={css.aviso}>…</p> : null}

          {estado.fase === 'erro' ? (
            <p className={css.aviso}>
              {estado.codigo === 403
                ? isEN
                  ? 'This belongs to a booking you are not part of.'
                  : 'Isto pertence a uma reserva de que não faz parte.'
                : isEN
                ? 'Could not load this case.'
                : 'Não foi possível carregar este caso.'}
            </p>
          ) : null}

          {estado.fase === 'pronto' && !caso ? (
            <>
              <p className={css.intro}>
                {isEN
                  ? 'Describe what happened. The other party is notified by email and has seven days to respond. Venue1Hub steps in when the Terms give it that role.'
                  : 'Descreva o que aconteceu. A outra parte é notificada por email e tem sete dias para responder. A Venue1Hub intervém quando os Termos lhe derem essa competência.'}
              </p>

              {/* Dito antes de se abrir o caso, e não depois. */}
              <p className={css.avisoDinheiro}>
                {isEN
                  ? 'Opening a case does not move any money. If a refund is due, it is processed separately once the case is decided.'
                  : 'Abrir um caso não movimenta dinheiro nenhum. Se houver lugar a reembolso, é processado à parte depois de o caso ser decidido.'}
              </p>

              <form onSubmit={abrir} className={css.form}>
                <label className={css.label}>
                  {isEN ? 'What happened' : 'O que aconteceu'}
                  <select
                    className={css.campo}
                    value={form.tipo}
                    onChange={e => setForm({ ...form, tipo: e.target.value })}
                    required
                  >
                    <option value="">{isEN ? 'Choose…' : 'Escolher…'}</option>
                    {(estado.tipos || []).map(t => (
                      <option key={t.chave} value={t.chave}>
                        {isEN ? t.labelEN : t.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={css.label}>
                  {isEN ? 'Description' : 'Descrição'}
                  <textarea
                    className={css.campo}
                    rows={6}
                    minLength={20}
                    required
                    value={form.descricao}
                    onChange={e => setForm({ ...form, descricao: e.target.value })}
                    placeholder={
                      isEN
                        ? 'What happened, when, and what you are asking for.'
                        : 'O que aconteceu, quando, e o que pretende.'
                    }
                  />
                </label>

                <label className={css.label}>
                  {isEN ? 'Amount claimed (optional)' : 'Valor reclamado (opcional)'}
                  <input
                    className={css.campo}
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={form.valor}
                    onChange={e => setForm({ ...form, valor: e.target.value })}
                  />
                </label>

                {erro ? <p className={css.erro}>{erro}</p> : null}

                <button type="submit" className={css.botao} disabled={aGravar}>
                  {isEN ? 'Open case' : 'Abrir caso'}
                </button>
              </form>
            </>
          ) : null}

          {caso ? (
            <div className={css.dossier}>
              <p className={css.estado}>
                {isEN ? 'Case opened on' : 'Caso aberto em'} {dataCurta(caso.abertoEm)} ·{' '}
                {isEN ? 'status' : 'estado'}: {rotuloEstado(caso.estado, isEN)}
              </p>

              <h2 className={css.seccao}>{isEN ? 'The claim' : 'A reclamação'}</h2>
              <p className={css.texto}>{caso.descricao}</p>
              {caso.valorCents ? (
                <p className={css.texto}>
                  <strong>{isEN ? 'Amount claimed' : 'Valor reclamado'}:</strong>{' '}
                  {euros(caso.valorCents)}
                </p>
              ) : null}

              {caso.provas?.length ? (
                <>
                  <h2 className={css.seccao}>{isEN ? 'Evidence' : 'Provas'}</h2>
                  <ul className={css.provas}>
                    {caso.provas.map((p, i) => (
                      <li key={i}>
                        <a href={p.url} target="_blank" rel="noopener noreferrer" className={css.link}>
                          {p.nome}
                        </a>{' '}
                        <span className={css.provaMeta}>({p.porPapel}, {dataCurta(p.em)})</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              <h2 className={css.seccao}>{isEN ? 'Right of reply' : 'Direito de resposta'}</h2>
              {!caso.resposta && caso.prazoResposta ? (
                <p className={css.prazo}>
                  {prazoPassou(caso)
                    ? isEN
                      ? `The deadline (${dataCurta(caso.prazoResposta)}) has passed with no reply. The case is with Venue1Hub; evidence can still be added until a decision is made.`
                      : `O prazo (${dataCurta(caso.prazoResposta)}) terminou sem resposta. O caso está com a Venue1Hub; até haver decisão ainda se pode juntar prova.`
                    : isEN
                    ? `Deadline to reply: ${dataCurta(caso.prazoResposta)}.`
                    : `Prazo para responder: ${dataCurta(caso.prazoResposta)}.`}
                </p>
              ) : null}
              {caso.resposta ? (
                <p className={css.texto}>{caso.resposta.texto}</p>
              ) : podeResponder ? (
                <form onSubmit={responder} className={css.form}>
                  <textarea
                    className={css.campo}
                    rows={5}
                    minLength={10}
                    required
                    value={resposta}
                    onChange={e => setResposta(e.target.value)}
                    placeholder={isEN ? 'Your side of it.' : 'A sua versão dos factos.'}
                  />
                  {erro ? <p className={css.erro}>{erro}</p> : null}
                  <button type="submit" className={css.botao} disabled={aGravar}>
                    {isEN ? 'Send reply' : 'Enviar resposta'}
                  </button>
                </form>
              ) : (
                <p className={css.texto}>
                  {isEN
                    ? `Waiting for the other party until ${dataCurta(caso.prazoResposta)}.`
                    : `A aguardar a outra parte até ${dataCurta(caso.prazoResposta)}.`}
                </p>
              )}

              {/* Só para a Venue1Hub. Sem esta secção, os endpoints de decisão
                  existiam e não havia forma de lá chegar sem linha de
                  comandos — um dossier que só acumula reclamações não é um
                  centro de resolução. */}
              {souAdmin && !caso.decisao ? (
                <>
                  <h2 className={css.seccao}>{isEN ? 'Decide' : 'Decidir'}</h2>
                  <p className={css.avisoDinheiro}>
                    {isEN
                      ? 'Recording a decision does not move money. Use the field below to note the Stripe reference once you have actually refunded.'
                      : 'Registar a decisão não movimenta dinheiro. Depois de devolver mesmo o valor na Stripe, registe aqui a referência.'}
                  </p>
                  <form onSubmit={decidir} className={css.form}>
                    <label className={css.label}>
                      {isEN ? 'Outcome' : 'Sentido da decisão'}
                      <select
                        className={css.campo}
                        value={decisao.sentido}
                        onChange={e => setDecisao({ ...decisao, sentido: e.target.value })}
                        required
                      >
                        <option value="">{isEN ? 'Choose…' : 'Escolher…'}</option>
                        <option value="a-favor-de-quem-abriu">
                          {isEN ? 'In favour of the claimant' : 'A favor de quem abriu'}
                        </option>
                        <option value="a-favor-da-outra-parte">
                          {isEN ? 'In favour of the other party' : 'A favor da outra parte'}
                        </option>
                        <option value="solucao-intermedia">
                          {isEN ? 'Middle ground' : 'Solução intermédia'}
                        </option>
                        <option value="sem-decisao">
                          {isEN ? 'No decision' : 'Sem decisão'}
                        </option>
                      </select>
                    </label>
                    <label className={css.label}>
                      {isEN ? 'Reasons' : 'Fundamentação'}
                      <textarea
                        className={css.campo}
                        rows={5}
                        minLength={20}
                        required
                        value={decisao.fundamentacao}
                        onChange={e => setDecisao({ ...decisao, fundamentacao: e.target.value })}
                        placeholder={
                          isEN
                            ? 'Both parties receive this text. Explain what decided it.'
                            : 'As duas partes recebem este texto. Explique o que decidiu o caso.'
                        }
                      />
                    </label>
                    <label className={css.label}>
                      {isEN ? 'Amount, if any' : 'Valor, se houver'}
                      <input
                        className={css.campo}
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={decisao.valor}
                        onChange={e => setDecisao({ ...decisao, valor: e.target.value })}
                      />
                    </label>
                    {erro ? <p className={css.erro}>{erro}</p> : null}
                    <button type="submit" className={css.botao} disabled={aGravar}>
                      {isEN ? 'Record decision' : 'Registar decisão'}
                    </button>
                  </form>
                </>
              ) : null}

              {caso.decisao ? (
                <>
                  <h2 className={css.seccao}>{isEN ? 'Decision' : 'Decisão'}</h2>
                  <p className={css.texto}>{caso.decisao.fundamentacao}</p>
                  {caso.decisao.valorCents ? (
                    <p className={css.texto}>
                      <strong>{isEN ? 'Amount' : 'Valor'}:</strong> {euros(caso.decisao.valorCents)}
                    </p>
                  ) : null}
                  <p className={css.avisoDinheiro}>
                    {caso.decisao.executada
                      ? isEN
                        ? 'This decision has been carried out.'
                        : 'Esta decisão já foi executada.'
                      : isEN
                      ? 'Decided, but not yet carried out. Any amount is processed separately.'
                      : 'Decidido, mas ainda não executado. Qualquer valor é processado à parte.'}
                  </p>

                  {souAdmin && !caso.decisao.executada ? (
                    <form onSubmit={marcarExecutada} className={css.form}>
                      <label className={css.label}>
                        {isEN ? 'Stripe reference' : 'Referência na Stripe'}
                        <input
                          className={css.campo}
                          type="text"
                          value={notaExecucao}
                          onChange={e => setNotaExecucao(e.target.value)}
                          placeholder="re_..."
                        />
                      </label>
                      <button type="submit" className={css.botao} disabled={aGravar}>
                        {isEN ? 'Mark as carried out' : 'Marcar como executada'}
                      </button>
                    </form>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

const mapStateToProps = state => ({ scrollingDisabled: isScrollingDisabled(state) });

const ResolutionPage = compose(connect(mapStateToProps))(ResolutionPageComponent);

export default ResolutionPage;
