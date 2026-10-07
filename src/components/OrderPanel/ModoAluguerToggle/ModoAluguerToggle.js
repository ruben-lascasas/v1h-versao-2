import React from 'react';
import classNames from 'classnames';

import { FormattedMessage, useIntl } from '../../../util/reactIntl';
import { formatMoney } from '../../../util/currency';
import { types as sdkTypes } from '../../../util/sdkLoader';

import css from './ModoAluguerToggle.module.css';

const { Money } = sdkTypes;

/**
 * "Por hora" ou "por dia", no mesmo anúncio.
 *
 * PORQUE É QUE O PREÇO ESTÁ DENTRO DO BOTÃO
 *
 * A escolha do modo é uma escolha de preço: quem reserva não quer saber de
 * unidades de faturação, quer saber quanto custa de cada maneira. Um par de
 * botões a dizer só "Por hora / Por dia" obrigava a carregar num para
 * descobrir o preço e no outro para comparar. Com os dois valores à vista,
 * decide-se de uma vez.
 *
 * Só aparece quando o anúncio vende mesmo os dois. Com um modo só, isto seria
 * um controlo com uma opção — ruído que não decide nada.
 */
const ModoAluguerToggle = props => {
  const { modos = [], modo, precos = {}, currency, onChange, className } = props;
  const intl = useIntl();

  if (modos.length < 2) {
    return null;
  }

  const preco = m => {
    const cents = precos[m];
    return Number.isInteger(cents) && currency
      ? formatMoney(intl, new Money(cents, currency))
      : null;
  };

  return (
    <div className={classNames(css.root, className)}>
      <p className={css.titulo}>
        <FormattedMessage id="ModoAluguerToggle.titulo" />
      </p>
      <div
        className={css.opcoes}
        role="radiogroup"
        aria-label={intl.formatMessage({ id: 'ModoAluguerToggle.aria' })}
      >
        {modos.map(m => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={m === modo}
            className={classNames(css.opcao, { [css.opcaoAtiva]: m === modo })}
            onClick={() => onChange(m)}
          >
            <span className={css.nome}>
              <FormattedMessage id={`ModoAluguerToggle.${m}`} />
            </span>
            {preco(m) ? <span className={css.preco}>{preco(m)}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
};

export default ModoAluguerToggle;
