import React from 'react';
import '@testing-library/jest-dom';

import { renderWithProviders as render, testingLibrary } from '../../../util/testHelpers';

import ModoAluguerToggle from './ModoAluguerToggle';

const { screen, userEvent } = testingLibrary;

const montar = (props = {}) => {
  const onChange = jest.fn();
  render(
    <ModoAluguerToggle
      modos={['day', 'hour']}
      modo="day"
      precos={{ day: 450000, hour: 60000 }}
      currency="EUR"
      onChange={onChange}
      {...props}
    />
  );
  return onChange;
};

describe('ModoAluguerToggle', () => {
  // No ambiente de teste as traduções não carregam: o texto é o id da
  // mensagem. É a convenção das outras suites deste projeto.
  it('mostra um botão por modo', () => {
    montar();
    expect(screen.getByRole('radio', { name: /ModoAluguerToggle\.day/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /ModoAluguerToggle\.hour/ })).toBeInTheDocument();
  });

  /**
   * A escolha do modo é uma escolha de preço. Sem os valores à vista era
   * preciso carregar num botão para saber quanto custa e no outro para
   * comparar — duas viagens para uma decisão.
   */
  it('põe o preço de cada modo dentro do botão', () => {
    montar();
    expect(screen.getByRole('radio', { name: /ModoAluguerToggle\.day/ })).toHaveTextContent(
      '4,500.00'
    );
    expect(screen.getByRole('radio', { name: /ModoAluguerToggle\.hour/ })).toHaveTextContent(
      '600.00'
    );
  });

  it('diz qual está escolhido, e não só por cor', () => {
    montar({ modo: 'hour' });
    // `aria-checked` é o que um leitor de ecrã anuncia; a borda só serve a
    // quem vê.
    expect(screen.getByRole('radio', { name: /ModoAluguerToggle\.hour/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /ModoAluguerToggle\.day/ })).not.toBeChecked();
  });

  it('avisa quem escolhe', async () => {
    const onChange = montar();
    await userEvent.click(screen.getByRole('radio', { name: /ModoAluguerToggle\.hour/ }));
    expect(onChange).toHaveBeenCalledWith('hour');
  });

  /**
   * Com um modo só isto seria um controlo com uma opção: ocupa espaço no
   * painel de reserva e não decide nada.
   */
  it('não aparece quando o anúncio só vende de uma maneira', () => {
    montar({ modos: ['day'] });
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  // Um anúncio a meio de ser editado pode ter um modo sem preço gravado.
  it('aguenta um modo sem preço, sem escrever lixo no botão', () => {
    montar({ precos: { day: 450000 } });
    const porHora = screen.getByRole('radio', { name: /ModoAluguerToggle\.hour/ });
    expect(porHora).toBeInTheDocument();
    expect(porHora.textContent).not.toMatch(/NaN|undefined|null/);
  });
});
