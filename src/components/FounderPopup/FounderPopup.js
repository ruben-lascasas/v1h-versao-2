import React, { useEffect, useState } from 'react';
import { NamedLink } from '../../components';
import { readConsent } from '../CookieConsent/CookieConsent';
import {
  FOUNDER_RATE,
  STANDARD_RATE,
  FOUNDER_SLOTS,
  isFounderCampaignOpen,
  founderDeadlineLabel,
  taxaEscrita,
} from '../../config/founderCampaign';
import css from './FounderPopup.module.css';

/**
 * Anúncio da condição de fundador, só na página inicial.
 *
 * Decisões que valem a pena explicar:
 *
 * - **Não aparece a quem já tem sessão iniciada.** Quem já se registou ou já é
 *   fundador, ou já perdeu o prazo; nos dois casos a mensagem só estorva.
 *
 * - **Desaparece sozinho no fim da campanha.** A data é verificada a cada
 *   montagem, não fixada na compilação: sem isso, um site sem deploy durante
 *   umas semanas continuaria a anunciar uma campanha terminada.
 *
 * - **Espera dois segundos.** Aparecer em cima da primeira impressão da página
 *   é a forma mais rápida de ser fechado sem ser lido.
 *
 * - **Uma vez por pessoa.** A dispensa fica no localStorage. Se o browser o
 *   recusar (janela anónima, definições restritivas), o pior que acontece é
 *   voltar a aparecer — nunca rebentar. Daí os try/catch.
 */

const CHAVE = 'v1h_popup_fundador_v1';
const ATRASO_MS = 2000;

const jaDispensado = () => {
  try {
    return window.localStorage.getItem(CHAVE) === '1';
  } catch (_) {
    return false;
  }
};

const guardarDispensa = () => {
  try {
    window.localStorage.setItem(CHAVE, '1');
  } catch (_) {
    // Sem armazenamento o popup volta noutra visita. É preferível a rebentar.
  }
};

const FounderPopup = ({ isAuthenticated }) => {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (isAuthenticated) return undefined;
    if (!isFounderCampaignOpen()) return undefined;
    if (jaDispensado()) return undefined;

    let temporizador = null;
    const agendar = () => {
      temporizador = setTimeout(() => setAberto(true), ATRASO_MS);
    };

    // Espera pela decisão dos cookies. Numa primeira visita, os dois avisos
    // apareciam ao mesmo tempo — e o dos cookies tem de ser respondido
    // primeiro, tanto por lei como por bom senso. `readConsent` devolve null
    // enquanto ninguém decidiu.
    if (readConsent()) {
      agendar();
      return () => clearTimeout(temporizador);
    }

    const aoDecidir = () => agendar();
    window.addEventListener('v1h:consentChanged', aoDecidir);
    return () => {
      window.removeEventListener('v1h:consentChanged', aoDecidir);
      clearTimeout(temporizador);
    };
  }, [isAuthenticated]);

  // Fechar com Escape. Um popup que só se fecha com o rato é um popup que
  // prende quem navega pelo teclado.
  useEffect(() => {
    if (!aberto) return undefined;
    const aoTeclar = e => {
      if (e.key === 'Escape') fechar();
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aberto]);

  const fechar = () => {
    guardarDispensa();
    setAberto(false);
  };

  if (!aberto) return null;

  return (
    <div
      className={css.overlay}
      onClick={fechar}
      role="dialog"
      aria-modal="true"
      aria-labelledby="fundador-titulo"
    >
      <div className={css.cartao} onClick={e => e.stopPropagation()}>
        <button type="button" className={css.fechar} onClick={fechar} aria-label="Fechar">
          ✕
        </button>

        <p className={css.etiqueta}>Programa Fundador</p>

        {/* "Metade" deixou de ser verdade quando o standard passou a 12,5%:
            5% é menos de metade de 12,5%. A promessa até melhorou, mas o texto
            tem de acompanhar o número. */}
        <h2 id="fundador-titulo" className={css.titulo}>
          Menos de metade
          <br />
          da comissão
        </h2>

        <p className={css.texto}>
          Estamos a começar, e queremos começar bem acompanhados. Quem registar a sua conta de
          anunciante até <strong>{founderDeadlineLabel()}</strong> paga-nos{' '}
          <strong>apenas {taxaEscrita(FOUNDER_RATE)}%</strong> de comissão em cada reserva — para
          sempre, em vez dos {taxaEscrita(STANDARD_RATE)}% habituais.
        </p>

        <div className={css.comparacao} aria-hidden="true">
          <div className={css.coluna}>
            <span className={css.percentagemFundador}>{taxaEscrita(FOUNDER_RATE)}%</span>
            <span className={css.legenda}>Fundador</span>
          </div>
          <div className={css.separador} />
          <div className={css.coluna}>
            <span className={css.percentagemNormal}>{taxaEscrita(STANDARD_RATE)}%</span>
            <span className={css.legenda}>Depois</span>
          </div>
        </div>

        <p className={css.notaVagas}>
          Reservado aos primeiros {FOUNDER_SLOTS} anunciantes. A condição fica associada à sua
          conta e não expira.
        </p>

        <NamedLink name="SignupPage" className={css.botao} onClick={fechar}>
          Quero ser fundador
        </NamedLink>

        <button type="button" className={css.recusar} onClick={fechar}>
          Agora não
        </button>
      </div>
    </div>
  );
};

export default FounderPopup;
