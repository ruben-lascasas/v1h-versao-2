import React from 'react';
import '@testing-library/jest-dom';
import { Form as FinalForm, Field } from 'react-final-form';
import arrayMutators from 'final-form-arrays';

import { fakeIntl } from '../../../../util/testData';
import { renderWithProviders as render, testingLibrary } from '../../../../util/testHelpers';

import EditListingPhotosForm, { FieldAddImage } from './EditListingPhotosForm';

const { screen, userEvent, waitFor, act } = testingLibrary;

const noop = () => null;

describe('EditListingDeliveryForm', () => {
  it('matches snapshot', () => {
    const saveActionMsg = 'Save photos';
    const tree = render(
      <EditListingPhotosForm
        initialValues={{ country: 'US', images: [] }}
        intl={fakeIntl}
        dispatch={noop}
        onImageUpload={v => Promise.reject(v)}
        onSubmit={v => v}
        saveActionMsg={saveActionMsg}
        stripeConnected={false}
        updated={false}
        ready={false}
        updateInProgress={false}
        disabled={false}
        onRemoveImage={noop}
        listingImageConfig={{ aspectWidth: 1, aspectHeight: 1, variantPrefix: 'listing-card' }}
      />
    );
    expect(tree.asFragment()).toMatchSnapshot();
  });

  // TODO to test this fully, we would need to check that store's state changes correctly.

  // O que interessa verificar é o que chega ao handler, e não o que fica no
  // <input>: o campo limpa-se a seguir a cada escolha, de propósito. Sem essa
  // limpeza, escolher outra vez o mesmo ficheiro não dispara `change` e a
  // pessoa fica a pensar que a aplicação a ignorou.
  it('Check that FieldAddImage works', async () => {
    const user = userEvent.setup();
    const ACCEPT_IMAGES = 'image/*';
    const recebidos = [];
    const capturarUpload = files => recebidos.push(files);
    const tree = render(
      <FinalForm
        onSubmit={noop}
        mutators={{ ...arrayMutators }}
        render={formRenderProps => {
          return (
            <form onSubmit={noop}>
              <FieldAddImage
                id="addImage"
                name="addImage"
                accept={ACCEPT_IMAGES}
                label={<div>label</div>}
                type="file"
                disabled={false}
                formApi={{
                  change: noop,
                  blur: noop,
                }}
                onImageUploadHandler={capturarUpload}
                remainingSlots={25}
                aspectWidth={1}
                aspectHeight={1}
              />
            </form>
          );
        }}
      />
    );

    const file = new File(['hello'], 'foto-1.png', { type: 'image/png' });
    const input = screen.getByLabelText(/label/i);

    await user.upload(input, file);

    expect(recebidos).toHaveLength(1);
    expect(recebidos[0]).toEqual([file]);
    // O campo esvazia-se para a mesma fotografia poder ser escolhida de novo.
    expect(input.files).toHaveLength(0);
  });

  it('aceita várias fotografias de uma vez', async () => {
    // A queixa concreta: escolher dez fotografias carregava uma só, porque o
    // campo lia `files[0]`.
    const user = userEvent.setup();
    const recebidos = [];
    render(
      <FinalForm
        onSubmit={noop}
        mutators={{ ...arrayMutators }}
        render={() => (
          <form onSubmit={noop}>
            <FieldAddImage
              id="addImage"
              name="addImage"
              accept="image/*"
              label={<div>label</div>}
              type="file"
              disabled={false}
              formApi={{ change: noop, blur: noop }}
              onImageUploadHandler={files => recebidos.push(files)}
              remainingSlots={25}
              aspectWidth={1}
              aspectHeight={1}
            />
          </form>
        )}
      />
    );

    const ficheiros = [
      new File(['a'], 'foto-1.png', { type: 'image/png' }),
      new File(['b'], 'foto-2.png', { type: 'image/png' }),
      new File(['c'], 'foto-3.png', { type: 'image/png' }),
    ];
    await user.upload(screen.getByLabelText(/label/i), ficheiros);

    expect(recebidos).toHaveLength(1);
    expect(recebidos[0]).toHaveLength(3);
    expect(recebidos[0].map(f => f.name)).toEqual(['foto-1.png', 'foto-2.png', 'foto-3.png']);
  });

  it('não deixa passar mais fotografias do que as que ainda cabem', async () => {
    // Com 25 no máximo e 23 já carregadas, escolher cinco tem de aceitar duas.
    // Aceitar as cinco seria deixar o servidor recusar as últimas, e a pessoa
    // via-as desaparecer sem saber porquê.
    const user = userEvent.setup();
    const recebidos = [];
    render(
      <FinalForm
        onSubmit={noop}
        mutators={{ ...arrayMutators }}
        render={() => (
          <form onSubmit={noop}>
            <FieldAddImage
              id="addImage"
              name="addImage"
              accept="image/*"
              label={<div>label</div>}
              type="file"
              disabled={false}
              formApi={{ change: noop, blur: noop }}
              onImageUploadHandler={files => recebidos.push(files)}
              remainingSlots={2}
              aspectWidth={1}
              aspectHeight={1}
            />
          </form>
        )}
      />
    );

    await user.upload(
      screen.getByLabelText(/label/i),
      [1, 2, 3, 4, 5].map(n => new File(['x'], `foto-${n}.png`, { type: 'image/png' }))
    );

    expect(recebidos[0].map(f => f.name)).toEqual(['foto-1.png', 'foto-2.png']);
  });
});
