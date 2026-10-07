import React from 'react';
import '@testing-library/jest-dom';
import { Form as FinalForm } from 'react-final-form';
import arrayMutators from 'final-form-arrays';

import { renderWithProviders as render, testingLibrary } from '../../util/testHelpers';

import FieldUsos from './FieldUsos';

const { screen, userEvent } = testingLibrary;

const CATEGORIAS = [
  {
    id: 'gastronomia-convivio',
    name: 'Gastronomia & Convívio',
    subcategories: [
      { id: 'restaurantes-privados', name: 'Restaurantes Privados' },
      { id: 'salas-showcooking', name: 'Salas para Showcooking' },
      { id: 'bares-reservaveis', name: 'Bares Reserváveis' },
    ],
  },
  {
    id: 'educacao-cultura',
    name: 'Educação & Cultura',
    subcategories: [
      { id: 'sala-formacao', name: 'Salas de Formação' },
      { id: 'auditorios', name: 'Auditórios' },
    ],
  },
  {
    // Um ramo cujas opções não existem no campo: não deve aparecer vazio.
    id: 'ramo-sem-opcoes',
    name: 'Ramo sem opções',
    subcategories: [{ id: 'nao-esta-no-campo', name: 'Não está no campo' }],
  },
];

const OPCOES = [
  'restaurantes-privados',
  'salas-showcooking',
  'bares-reservaveis',
  'sala-formacao',
  'auditorios',
].map(option => ({ option, label: option }));

const montar = (initialValues = {}, extra = {}) => {
  const onSubmit = jest.fn();
  const utils = render(
    <FinalForm
      onSubmit={onSubmit}
      mutators={{ ...arrayMutators }}
      initialValues={initialValues}
      render={({ handleSubmit, values, invalid }) => (
        <form onSubmit={handleSubmit}>
          <FieldUsos
            name="usos"
            formId="teste"
            label="Usos do espaço"
            categories={CATEGORIAS}
            enumOptions={OPCOES}
            {...extra}
          />
          <output data-testid="valores">{JSON.stringify(values.usos || [])}</output>
          <output data-testid="invalido">{invalid ? 'sim' : 'nao'}</output>
        </form>
      )}
    />
  );
  return utils;
};

describe('FieldUsos', () => {
  it('mostra um grupo por categoria principal, e não os vazios', () => {
    montar({ categoryLevel2: 'restaurantes-privados' });

    expect(screen.getByText('Gastronomia & Convívio')).toBeInTheDocument();
    expect(screen.getByText('Educação & Cultura')).toBeInTheDocument();
    // O ramo cujas subcategorias não existem como opção do campo não aparece:
    // um grupo vazio só serve para dar trabalho a abrir.
    expect(screen.queryByText('Ramo sem opções')).not.toBeInTheDocument();
  });

  /**
   * A categoria principal é acrescentada aos usos ao gravar. Se ficasse aqui
   * como caixa, o anfitrião podia desmarcá-la e nada aconteceria — um controlo
   * que ignora quem lhe toca é pior do que não existir.
   */
  it('não oferece a categoria principal como caixa', async () => {
    montar({ categoryLevel2: 'restaurantes-privados' });

    await userEvent.click(screen.getByText('Gastronomia & Convívio'));

    expect(screen.getByLabelText('Salas para Showcooking')).toBeInTheDocument();
    expect(screen.queryByLabelText('Restaurantes Privados')).not.toBeInTheDocument();
  });

  it('diz em palavras que a categoria principal já conta', () => {
    montar({ categoryLevel2: 'restaurantes-privados' });
    expect(screen.getByText(/já conta/)).toBeInTheDocument();
  });

  /**
   * Nove grupos fechados em vez de sessenta caixas seguidas: é esse o ponto.
   *
   * O painel fechado usa `hidden`, por isso as caixas continuam no documento —
   * mas invisíveis, fora da ordem de tabulação e ignoradas por quem usa leitor
   * de ecrã. É a visibilidade que interessa afirmar, não a existência.
   */
  it('os grupos começam fechados e abrem ao toque', async () => {
    montar({ categoryLevel2: 'auditorios' });

    expect(screen.getByLabelText('Salas de Formação')).not.toBeVisible();

    await userEvent.click(screen.getByText('Educação & Cultura'));

    expect(screen.getByLabelText('Salas de Formação')).toBeVisible();
  });

  it('marcar uma opção guarda-a no formulário', async () => {
    montar({ categoryLevel2: 'restaurantes-privados' });

    await userEvent.click(screen.getByText('Gastronomia & Convívio'));
    await userEvent.click(screen.getByLabelText('Salas para Showcooking'));

    expect(screen.getByTestId('valores')).toHaveTextContent('salas-showcooking');
  });

  it('conta os usos marcados, para não ser preciso abrir tudo à procura', async () => {
    montar({ categoryLevel2: 'restaurantes-privados', usos: ['salas-showcooking'] });

    expect(screen.getByText('1 uso adicional marcado.')).toBeInTheDocument();
    // O número aparece no cabeçalho do grupo onde a escolha está.
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('sem nada marcado, di-lo sem rodeios', () => {
    montar({ categoryLevel2: 'restaurantes-privados' });
    expect(screen.getByText('Nenhum uso adicional marcado.')).toBeInTheDocument();
  });

  /**
   * O campo é opcional hoje, mas quem o tornar obrigatório na Console espera
   * que isso valha. Um desvio de desenho que deixasse a validação pelo caminho
   * dava um campo obrigatório que deixa gravar — pior do que não o ter.
   */
  it('respeita uma validação vinda da configuração', async () => {
    const exigeUm = v => (v && v.length > 0 ? undefined : 'Escolha pelo menos um uso.');

    montar({ categoryLevel2: 'restaurantes-privados' }, { validate: exigeUm });
    expect(screen.getByTestId('invalido')).toHaveTextContent('sim');

    await userEvent.click(screen.getByText('Gastronomia & Convívio'));
    await userEvent.click(screen.getByLabelText('Salas para Showcooking'));

    expect(screen.getByTestId('invalido')).toHaveTextContent('nao');
  });

  // Um anúncio a meio do assistente pode ainda não ter categoria escolhida.
  it('aguenta não haver categoria principal ainda', () => {
    montar({});
    expect(screen.getByText(/Marque tudo aquilo para que o espaço serve/)).toBeInTheDocument();
  });
});
