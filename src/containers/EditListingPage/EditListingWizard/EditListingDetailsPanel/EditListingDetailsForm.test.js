import React from 'react';
import '@testing-library/jest-dom';

import { pickCategoryFields } from '../../../../util/fieldHelpers';
import { fakeIntl } from '../../../../util/testData';
import { renderWithProviders as render, testingLibrary } from '../../../../util/testHelpers';

import EditListingDetailsForm from './EditListingDetailsForm';

const { screen, userEvent } = testingLibrary;

const noop = () => null;

describe('EditListingDetailsForm', () => {
  it('Check that shipping fees can be given and submit button activates', async () => {
    const user = userEvent.setup();
    const saveActionMsg = 'Save details';

    const selectableListingTypes = [
      {
        listingType: 'sell-bicycles',
        transactionProcessAlias: 'default-purchase/release-1',
        unitType: 'item',
      },
    ];

    const listingFieldsConfig = [
      {
        key: 'clothing',
        scope: 'public',
        listingTypeConfig: {
          limitToListingTypeIds: true,
          listingTypeIds: ['sell-bicycles'],
        },
        schemaType: 'enum',
        enumOptions: [
          { option: 'men', label: 'Men' },
          { option: 'women', label: 'Women' },
          { option: 'kids', label: 'Kids' },
        ],
        filterConfig: {
          indexForSearch: true,
          label: 'Clothing',
        },
        showConfig: {
          label: 'Clothing',
          isDetail: true,
        },
        saveConfig: {
          label: 'Clothing',
        },
      },
      {
        key: 'amenities',
        scope: 'public',
        listingTypeConfig: {
          limitToListingTypeIds: true,
          listingTypeIds: ['rent-bicycles-daily', 'rent-bicycles-nightly', 'rent-bicycles-hourly'],
        },
        schemaType: 'multi-enum',
        enumOptions: [
          { option: 'towels', label: 'Towels' },
          { option: 'bathroom', label: 'Bathroom' },
          { option: 'swimming_pool', label: 'Swimming pool' },
          { option: 'barbeque', label: 'Barbeque' },
        ],
        filterConfig: {
          indexForSearch: true,
          label: 'Amenities',
        },
        showConfig: {
          label: 'Amenities',
        },
        saveConfig: {
          label: 'Amenities',
        },
      },
    ];

    render(
      <EditListingDetailsForm
        intl={fakeIntl}
        dispatch={noop}
        onListingTypeChange={noop}
        onSubmit={v => v}
        saveActionMsg={saveActionMsg}
        updated={false}
        updateInProgress={false}
        disabled={false}
        ready={false}
        listingFieldsConfig={listingFieldsConfig}
        categoryPrefix="categoryLevel"
        selectableCategories={[]}
        pickSelectedCategories={values => pickCategoryFields(values, 'categoryLevel', 1, [])}
        selectableListingTypes={selectableListingTypes}
        hasExistingListingType={true}
        initialValues={selectableListingTypes[0]}
        marketplaceCurrency="EUR"
      />
    );

    // Pickup fields
    const title = 'EditListingDetailsForm.title';
    expect(screen.getByText(title)).toBeInTheDocument();

    const description = 'EditListingDetailsForm.description';
    expect(screen.getByText(description)).toBeInTheDocument();

    // O botao e clicavel desde o inicio, de proposito: carregar nele e o que
    // revela os campos que faltam. Ver o teste do beco sem saida mais abaixo.
    expect(screen.getByRole('button', { name: saveActionMsg })).toBeEnabled();

    // Fill mandatory attributes
    await user.type(screen.getByRole('textbox', { name: title }), 'My Listing');
    await user.type(screen.getByRole('textbox', { name: description }), 'Lorem ipsum');

    // Fill custom listing field
    // A etiqueta leva agora o marcador de opcional.
    await user.selectOptions(screen.getByLabelText(/^Clothing/), 'kids');

    // Test that save button is enabled
    expect(screen.getByRole('button', { name: saveActionMsg })).toBeEnabled();
  });
  /**
   * A ORDEM IMPORTA, E NÃO É A DA CONSOLE
   *
   * Os "usos do espaço" são o seguimento da subcategoria: "está em Quintas para
   * Eventos — também serve para outra coisa?". Lá em baixo, depois do título, da
   * descrição e das comodidades, a pergunta perdia o antecedente e lia-se como
   * uma segunda árvore de categorias. Por isso o campo sobe, mesmo estando em
   * último na configuração — e é isso que este teste fixa.
   */
  it('mostra os usos do espaço logo a seguir à categoria, e uma só vez', () => {
    const selectableListingTypes = [
      {
        listingType: 'aluguer-diario',
        transactionProcessAlias: 'default-booking/release-1',
        unitType: 'day',
      },
    ];

    const campo = (key, label) => ({
      key,
      scope: 'public',
      listingTypeConfig: { limitToListingTypeIds: false },
      schemaType: 'multi-enum',
      enumOptions: [{ option: 'x', label: 'X' }],
      filterConfig: { indexForSearch: true, label },
      showConfig: { label },
      saveConfig: { label },
    });

    // Na configuração, `usos` vem DEPOIS das comodidades.
    const listingFieldsConfig = [campo('comodidades', 'Comodidades'), campo('usos', 'Usos')];

    render(
      <EditListingDetailsForm
        intl={fakeIntl}
        dispatch={noop}
        onListingTypeChange={noop}
        onSubmit={v => v}
        saveActionMsg="Save details"
        updated={false}
        updateInProgress={false}
        disabled={false}
        ready={false}
        listingFieldsConfig={listingFieldsConfig}
        categoryPrefix="categoryLevel"
        selectableCategories={[]}
        pickSelectedCategories={values => pickCategoryFields(values, 'categoryLevel', 1, [])}
        selectableListingTypes={selectableListingTypes}
        hasExistingListingType={true}
        initialValues={selectableListingTypes[0]}
        marketplaceCurrency="EUR"
      />
    );

    // Uma vez só: hoje é renderizado por dois <AddListingFields> diferentes, e
    // um filtro mal posto dava o campo a dobrar sem partir nada mais.
    expect(screen.getAllByText(/^Usos/)).toHaveLength(1);

    const usos = screen.getByText(/^Usos/);
    const titulo = screen.getByText('EditListingDetailsForm.title');
    const comodidades = screen.getByText(/^Comodidades/);

    const vemAntes = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

    expect(vemAntes(usos, titulo)).toBe(true);
    expect(vemAntes(usos, comodidades)).toBe(true);
  });
  /**
   * O BECO SEM SAÍDA DA ETAPA 1
   *
   * Dois campos estão marcados como obrigatórios na Console — "Número de
   * pessoas" e "Comodidades" — e nada no ecrã o diz. Com o botão desativado
   * enquanto o formulário fosse inválido, quem não adivinhasse qual era o campo
   * ficava preso: carregava, não acontecia nada, e nenhuma mensagem aparecia.
   * Aconteceu em produção, e custou uma tarde.
   *
   * O botão passa a poder ser carregado. O clique corre a validação, que marca
   * os campos como tocados e põe o erro onde ele é.
   */
  it('com um campo obrigatório por preencher, o botão deixa-se carregar e mostra o erro', async () => {
    const user = userEvent.setup();
    const saveActionMsg = 'Seguinte';

    const selectableListingTypes = [
      {
        listingType: 'aluguer-diario',
        transactionProcessAlias: 'default-booking/release-1',
        unitType: 'day',
      },
    ];

    const listingFieldsConfig = [
      {
        key: 'comodidades',
        scope: 'public',
        listingTypeConfig: { limitToListingTypeIds: false },
        schemaType: 'multi-enum',
        enumOptions: [{ option: 'wifi', label: 'Wi-Fi' }],
        filterConfig: { indexForSearch: true, label: 'Comodidades' },
        showConfig: { label: 'Comodidades' },
        // É assim que a Console o entrega depois de normalizado.
        saveConfig: { label: 'Comodidades', isRequired: true },
      },
    ];

    render(
      <EditListingDetailsForm
        intl={fakeIntl}
        dispatch={noop}
        onListingTypeChange={noop}
        onSubmit={v => v}
        saveActionMsg={saveActionMsg}
        updated={false}
        updateInProgress={false}
        disabled={false}
        ready={false}
        listingFieldsConfig={listingFieldsConfig}
        categoryPrefix="categoryLevel"
        selectableCategories={[]}
        pickSelectedCategories={values => pickCategoryFields(values, 'categoryLevel', 1, [])}
        selectableListingTypes={selectableListingTypes}
        hasExistingListingType={true}
        initialValues={selectableListingTypes[0]}
        marketplaceCurrency="EUR"
      />
    );

    const botao = screen.getByRole('button', { name: saveActionMsg });

    const title = 'EditListingDetailsForm.title';
    await user.type(screen.getByRole('textbox', { name: title }), 'Sala Teste');
    const description = 'EditListingDetailsForm.description';
    await user.type(screen.getByRole('textbox', { name: description }), 'Uma descrição.');

    // Falta a comodidade obrigatória — e mesmo assim dá para carregar.
    expect(botao).toBeEnabled();

    await user.click(botao);

    expect(await screen.findByText('CustomExtendedDataField.required')).toBeInTheDocument();
  });

  /**
   * O template marca os campos nativos opcionais com "• Opcional". Os campos
   * vindos da Console não levavam marca nenhuma, e por isso não havia maneira
   * de distinguir um opcional de um obrigatório.
   */
  it('um campo não obrigatório diz que é opcional; um obrigatório não diz nada', () => {
    const selectableListingTypes = [
      {
        listingType: 'aluguer-diario',
        transactionProcessAlias: 'default-booking/release-1',
        unitType: 'day',
      },
    ];

    const campo = (key, label, obrigatorio) => ({
      key,
      scope: 'public',
      listingTypeConfig: { limitToListingTypeIds: false },
      schemaType: 'multi-enum',
      enumOptions: [{ option: 'x', label: 'X' }],
      filterConfig: { indexForSearch: true, label },
      showConfig: { label },
      saveConfig: { label, ...(obrigatorio ? { isRequired: true } : {}) },
    });

    render(
      <EditListingDetailsForm
        intl={fakeIntl}
        dispatch={noop}
        onListingTypeChange={noop}
        onSubmit={v => v}
        saveActionMsg="Seguinte"
        updated={false}
        updateInProgress={false}
        disabled={false}
        ready={false}
        listingFieldsConfig={[campo('obrig', 'Comodidades', true), campo('opt', 'Extras', false)]}
        categoryPrefix="categoryLevel"
        selectableCategories={[]}
        pickSelectedCategories={values => pickCategoryFields(values, 'categoryLevel', 1, [])}
        selectableListingTypes={selectableListingTypes}
        hasExistingListingType={true}
        initialValues={selectableListingTypes[0]}
        marketplaceCurrency="EUR"
      />
    );

    expect(screen.getByText(/^Extras CustomExtendedDataField\.optionalText$/)).toBeInTheDocument();
    expect(screen.getByText('Comodidades')).toBeInTheDocument();
  });
});
