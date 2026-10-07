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

// A linha que abre a secção. Fechada, é tudo o que este campo mostra.
const convite = () =>
  screen.getByText(/serve para (outra coisa|mais do que uma coisa)/).closest('button');
const abrirSeccao = () => userEvent.click(convite());

describe('FieldUsos', () => {
  /**
   * A RAZÃO DE SER DESTE PRIMEIRO TESTE
   *
   * Uns campos acima o anfitrião escolheu a categoria numa árvore. Quando as
   * nove categorias apareciam outra vez logo a seguir, em lista aberta, isto
   * não se lia como uma pergunta nova — lia-se como repetição, e repetição num
   * formulário parece erro. Foi o que o primeiro anfitrião a ver isto disse.
   * Fechado, é uma linha só.
   */
  it('começa fechado, para não parecer que repete a categoria de cima', () => {
    montar({ categoryLevel2: 'restaurantes-privados' });

    expect(convite()).toBeVisible();
    expect(screen.getByText('Educação & Cultura')).not.toBeVisible();
    expect(screen.getByLabelText('Salas para Showcooking')).not.toBeVisible();
  });

  it('a linha fechada nomeia a categoria que o anúncio já tem', () => {
    montar({ categoryLevel2: 'restaurantes-privados' });
    expect(convite()).toHaveTextContent('Restaurantes Privados');
  });

  /**
   * A editar um anúncio que já tem usos, não é uma pergunta nova: é o que ele
   * escolheu da última vez. Escondê-lo obrigava a procurar.
   */
  it('a editar, abre sozinho quando já há usos marcados', () => {
    montar({ categoryLevel2: 'restaurantes-privados', usos: ['salas-showcooking'] });

    expect(screen.getByLabelText('Salas para Showcooking')).toBeVisible();
    expect(convite()).toHaveTextContent('1 marcado');
  });

  it('mostra um grupo por categoria principal, e não os vazios', async () => {
    montar({ categoryLevel2: 'restaurantes-privados' });
    await abrirSeccao();

    expect(screen.getByText('Gastronomia & Convívio')).toBeVisible();
    expect(screen.getByText('Educação & Cultura')).toBeVisible();
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
    await abrirSeccao();

    await userEvent.click(screen.getByText('Gastronomia & Convívio'));

    expect(screen.getByLabelText('Salas para Showcooking')).toBeInTheDocument();
    expect(screen.queryByLabelText('Restaurantes Privados')).not.toBeInTheDocument();
  });

  it('diz em palavras que a categoria principal já está tratada', async () => {
    montar({ categoryLevel2: 'restaurantes-privados' });
    await abrirSeccao();

    expect(screen.getByText(/isso está tratado/)).toBeVisible();
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
    await abrirSeccao();

    expect(screen.getByLabelText('Salas de Formação')).not.toBeVisible();

    await userEvent.click(screen.getByText('Educação & Cultura'));

    expect(screen.getByLabelText('Salas de Formação')).toBeVisible();
  });

  it('marcar uma opção guarda-a no formulário', async () => {
    montar({ categoryLevel2: 'restaurantes-privados' });
    await abrirSeccao();

    await userEvent.click(screen.getByText('Gastronomia & Convívio'));
    await userEvent.click(screen.getByLabelText('Salas para Showcooking'));

    expect(screen.getByTestId('valores')).toHaveTextContent('salas-showcooking');
  });

  it('conta os usos marcados, para não ser preciso abrir tudo à procura', () => {
    montar({ categoryLevel2: 'restaurantes-privados', usos: ['salas-showcooking'] });

    expect(screen.getByText('1 uso adicional marcado.')).toBeVisible();
    // O número aparece no cabeçalho do grupo onde a escolha está.
    expect(screen.getByText('1')).toBeVisible();
  });

  it('sem nada marcado, di-lo sem rodeios', async () => {
    montar({ categoryLevel2: 'restaurantes-privados' });
    await abrirSeccao();

    expect(screen.getByText('Nenhum uso adicional marcado.')).toBeVisible();
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

    await abrirSeccao();
    await userEvent.click(screen.getByText('Gastronomia & Convívio'));
    await userEvent.click(screen.getByLabelText('Salas para Showcooking'));

    expect(screen.getByTestId('invalido')).toHaveTextContent('nao');
  });

  // Um anúncio a meio do assistente pode ainda não ter categoria escolhida.
  it('aguenta não haver categoria principal ainda', async () => {
    montar({});

    expect(convite()).toBeVisible();
    await abrirSeccao();
    expect(screen.getByText(/Marque tudo aquilo para que o espaço serve/)).toBeVisible();
  });
});
