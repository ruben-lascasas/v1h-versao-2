import React from 'react';
import { Form as FinalForm } from 'react-final-form';
import arrayMutators from 'final-form-arrays';
import classNames from 'classnames';

// Import configs and util modules
import appSettings from '../../../../config/settings';
import { FormattedMessage, useIntl } from '../../../../util/reactIntl';
import * as validators from '../../../../util/validators';
import { formatMoney } from '../../../../util/currency';
import { types as sdkTypes } from '../../../../util/sdkLoader';
import { FIXED, isBookingProcess } from '../../../../transactions/transaction';
import { aceitaDoisModos, outroModo } from '../../../../util/modosDePreco';

// Import shared components
import { Button, Form, FieldCurrencyInput } from '../../../../components';

import BookingPriceVariants from './BookingPriceVariants';
import StartTimeInterval from './StartTimeInverval';

// Import modules from this directory
import css from './EditListingPricingForm.module.css';
import { submeterRevelandoErros } from '../../../../util/submeter';

const { Money } = sdkTypes;

const getPriceValidators = (
  listingMinimumPriceSubUnits,
  listingMaximumPriceSubUnits,
  marketplaceCurrency,
  intl
) => {
  const priceRequiredMsgId = { id: 'EditListingPricingForm.priceRequired' };
  const priceRequiredMsg = intl.formatMessage(priceRequiredMsgId);
  const priceRequired = validators.required(priceRequiredMsg);

  const minPriceRaw = new Money(listingMinimumPriceSubUnits, marketplaceCurrency);
  const minPrice = formatMoney(intl, minPriceRaw);
  const priceTooLowMsgId = { id: 'EditListingPricingForm.priceTooLow' };
  const priceTooLowMsg = intl.formatMessage(priceTooLowMsgId, { minPrice });
  const minPriceRequired = validators.moneySubUnitAmountAtLeast(
    priceTooLowMsg,
    listingMinimumPriceSubUnits
  );

  const maxPriceRaw = listingMaximumPriceSubUnits
    ? new Money(listingMaximumPriceSubUnits, marketplaceCurrency)
    : null;
  const maxPrice = maxPriceRaw ? formatMoney(intl, maxPriceRaw) : null;
  const priceTooHighMsg = maxPrice
    ? intl.formatMessage({ id: 'EditListingPricingForm.priceTooHigh' }, { maxPrice })
    : null;
  const maxPriceRequired = listingMaximumPriceSubUnits
    ? validators.moneySubUnitAmountAtMost(priceTooHighMsg, listingMaximumPriceSubUnits)
    : null;

  const validatorsList = [priceRequired];
  if (listingMinimumPriceSubUnits) validatorsList.push(minPriceRequired);
  if (maxPriceRequired) validatorsList.push(maxPriceRequired);
  return validatorsList.length === 1
    ? validatorsList[0]
    : validators.composeValidators(...validatorsList);
};

/**
 * Validadores do segundo preço: os mesmos limites do preço principal, mas sem
 * o "obrigatório". O campo é opcional — deixar em branco é a maneira de dizer
 * "não alugo assim", e tem de continuar a ser possível gravar.
 */
const getPrecoOpcionalValidators = (minimo, maximo, marketplaceCurrency, intl) => {
  const lista = [];

  if (minimo) {
    const minPrice = formatMoney(intl, new Money(minimo, marketplaceCurrency));
    lista.push(
      validators.moneySubUnitAmountAtLeast(
        intl.formatMessage({ id: 'EditListingPricingForm.priceTooLow' }, { minPrice }),
        minimo
      )
    );
  }
  if (maximo) {
    const maxPrice = formatMoney(intl, new Money(maximo, marketplaceCurrency));
    lista.push(
      validators.moneySubUnitAmountAtMost(
        intl.formatMessage({ id: 'EditListingPricingForm.priceTooHigh' }, { maxPrice }),
        maximo
      )
    );
  }

  const composto =
    lista.length === 0
      ? null
      : lista.length === 1
      ? lista[0]
      : validators.composeValidators(...lista);

  // Campo vazio passa sempre. Sem isto, um mínimo configurado tornava o campo
  // opcional em obrigatório pela porta das traseiras.
  return value =>
    value == null || value === '' ? undefined : composto ? composto(value) : undefined;
};

/**
 * "COMO ALUGA ESTE ESPAÇO?" — UMA PERGUNTA, NÃO DUAS
 *
 * Antes, o tipo de anúncio já tinha perguntado "diário ou à hora?" na primeira
 * etapa, e aqui a pergunta voltava, repartida entre um campo obrigatório e
 * outro "também aluga à hora?". Duas perguntas para uma decisão, em etapas
 * diferentes, e sem deixar escolher as duas de forma óbvia.
 *
 * Agora é uma pergunta só, aqui, com os dois preços lado a lado e nenhum deles
 * privilegiado. Preencher um é vender só dessa maneira; preencher os dois dá a
 * escolha a quem reserva. Pelo menos um — e isso diz-se por palavras, não com
 * um asterisco.
 *
 * O `unitType` do tipo de anúncio continua a decidir qual dos dois vai para
 * `attributes.price`, que é o que a Sharetribe indexa. Isso é maquinaria, e
 * não tem de aparecer a quem publica.
 */
const ComoAluga = props => {
  const { formId, unitType, marketplaceCurrency, minimo, maximo, intl, erroDeAmbos } = props;
  const outro = outroModo(unitType);
  const validadores = getPrecoOpcionalValidators(minimo, maximo, marketplaceCurrency, intl);

  const campo = (modo, name) => (
    <FieldCurrencyInput
      id={`${formId}${name}`}
      name={name}
      className={css.campoModo}
      label={intl.formatMessage({
        id:
          modo === 'day'
            ? 'EditListingPricingForm.comoAluga.aoDia'
            : 'EditListingPricingForm.comoAluga.aHora',
      })}
      placeholder={intl.formatMessage({ id: 'EditListingPricingForm.comoAluga.vazio' })}
      currencyConfig={appSettings.getCurrencyFormatting(marketplaceCurrency)}
      validate={validadores}
    />
  );

  return (
    <div className={css.comoAluga}>
      <h3 className={css.comoAlugaTitulo}>
        <FormattedMessage id="EditListingPricingForm.comoAluga.titulo" />
      </h3>
      <p className={css.comoAlugaExplicacao}>
        <FormattedMessage id="EditListingPricingForm.comoAluga.explicacao" />
      </p>

      <div className={css.comoAlugaCampos}>
        {/* O modo principal primeiro, para a ordem não mudar sozinha. */}
        {campo(unitType, 'price')}
        {campo(outro, 'precoSegundoModo')}
      </div>

      {unitType === 'day' || outro === 'day' ? (
        <p className={css.comoAlugaNota}>
          <FormattedMessage id="EditListingPricingForm.comoAluga.diaExplicado" />
        </p>
      ) : null}

      {erroDeAmbos ? <p className={css.comoAlugaErro}>{erroDeAmbos}</p> : null}
    </div>
  );
};

const ErrorMessages = props => {
  const { fetchErrors } = props;
  const { updateListingError, showListingsError } = fetchErrors || {};

  return (
    <>
      {updateListingError ? (
        <p className={css.error}>
          <FormattedMessage id="EditListingPricingForm.updateFailed" />
        </p>
      ) : null}
      {showListingsError ? (
        <p className={css.error}>
          <FormattedMessage id="EditListingPricingForm.showListingFailed" />
        </p>
      ) : null}
    </>
  );
};

/**
 * The EditListingPricingForm component.
 *
 * @component
 * @param {Object} props
 * @param {string} [props.formId] - The form id
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {string} [props.rootClassName] - Custom class that overrides the default class for the root element
 * @param {string} props.unitType - The unitType from listing.attributes.publicData
 * @param {Object} [props.listingTypeConfig] - The listing type config that matches with listingType on publicData.
 * @param {Object} [props.listingTypeConfig.priceVariations] - The price variations config.
 * @param {boolean} props.listingTypeConfig.priceVariations.enabled - Whether the price variations are enabled.
 * @param {Object} [props.listingTypeConfig.transactionType] - The transaction type config.
 * @param {string} props.listingTypeConfig.transactionType.process - The transaction process config.
 * @param {string} props.marketplaceCurrency - The marketplace currency
 * @param {number} [props.listingMinimumPriceSubUnits] - The listing minimum price sub units
 * @param {boolean} [props.autoFocus] - Whether the input should be focused
 * @param {boolean} [props.disabled] - Whether the form is disabled
 * @param {boolean} [props.ready] - Whether the form is ready
 * @param {Function} props.onSubmit - The submit function
 * @param {boolean} [props.invalid] - Whether the form is invalid
 * @param {boolean} [props.pristine] - Whether the form is pristine
 * @param {string} props.saveActionMsg - The save action message
 * @param {boolean} [props.updated] - Whether the form is updated
 * @param {boolean} [props.updateInProgress] - Whether the form is updating
 * @param {Object} [props.fetchErrors] - The fetch errors
 * @returns {JSX.Element}
 */
export const EditListingPricingForm = props => (
  <FinalForm
    mutators={{ ...arrayMutators }}
    {...props}
    render={formRenderProps => {
      const {
        formId = 'EditListingPricingForm',
        form: formApi,
        autoFocus,
        className,
        rootClassName,
        disabled,
        ready,
        handleSubmit,
        marketplaceCurrency,
        unitType,
        listingTypeConfig,
        isPriceVariationsInUse,
        listingMinimumPriceSubUnits = 0,
        listingMaximumPriceSubUnits,
        invalid,
        pristine,
        saveActionMsg,
        updated,
        updateInProgress = false,
        fetchErrors,
        initialValues: formInitialValues,
        values: formValues,
      } = formRenderProps;

      const intl = useIntl();
      const priceValidators = getPriceValidators(
        listingMinimumPriceSubUnits,
        listingMaximumPriceSubUnits,
        marketplaceCurrency,
        intl
      );

      const classes = classNames(rootClassName || css.root, className);
      const submitReady = (updated && pristine) || ready;
      const submitInProgress = updateInProgress;
      const submitDisabled = disabled || submitInProgress;
      const { transactionType } = listingTypeConfig || {};
      const { process } = transactionType || {};
      const isBooking = isBookingProcess(process);

      const isFixedLengthBooking = isBooking && unitType === FIXED;
      const isBookingPriceVariationsInUse = isBooking && isPriceVariationsInUse;
      const isUsingPriceVariants = isFixedLengthBooking || isBookingPriceVariationsInUse;
      const mostraSegundoModo = aceitaDoisModos({
        unitType,
        isBooking,
        isPriceVariationsInUse: isUsingPriceVariants,
      });

      /**
       * PELO MENOS UM PREÇO
       *
       * Nenhum dos dois campos é obrigatório por si: obrigar o do dia num espaço
       * que só se aluga à hora seria pedir um número inventado. O que é
       * obrigatório é haver um. A regra vive aqui, e não nos campos, porque
       * depende dos dois ao mesmo tempo.
       */
      const semNenhumPreco =
        mostraSegundoModo && !formValues?.price && !formValues?.precoSegundoModo;
      const erroDeAmbos =
        semNenhumPreco && (formApi.getState().submitFailed || formApi.getState().touched?.price)
          ? intl.formatMessage({ id: 'EditListingPricingForm.comoAluga.semNenhum' })
          : null;

      return (
        <Form
          onSubmit={e => {
            // A regra dos dois campos não é de nenhum deles, por isso é aqui que
            // se trava a gravacão — e o aviso aparece por baixo do par.
            if (semNenhumPreco) {
              e.preventDefault();
              formApi.blur('price');
              formApi.focus('price');
              formApi.blur('price');
              return;
            }
            return submeterRevelandoErros(handleSubmit, formApi)(e);
          }}
          className={classes}
        >
          <ErrorMessages fetchErrors={fetchErrors} />

          {isUsingPriceVariants ? (
            <BookingPriceVariants
              formId={formId}
              formApi={formApi}
              autoFocus={autoFocus}
              className={css.input}
              marketplaceCurrency={marketplaceCurrency}
              unitType={unitType}
              isPriceVariationsInUse={isBookingPriceVariationsInUse}
              initialLengthOfPriceVariants={formInitialValues?.priceVariants?.length || 0}
              listingMinimumPriceSubUnits={listingMinimumPriceSubUnits}
            />
          ) : mostraSegundoModo ? (
            <ComoAluga
              formId={formId}
              unitType={unitType}
              marketplaceCurrency={marketplaceCurrency}
              minimo={listingMinimumPriceSubUnits}
              maximo={listingMaximumPriceSubUnits}
              intl={intl}
              erroDeAmbos={erroDeAmbos}
            />
          ) : (
            <FieldCurrencyInput
              id={`${formId}price`}
              name="price"
              className={css.input}
              autoFocus={autoFocus}
              label={intl.formatMessage(
                { id: 'EditListingPricingForm.pricePerProduct' },
                { unitType }
              )}
              placeholder={intl.formatMessage({
                id: 'EditListingPricingForm.priceInputPlaceholder',
              })}
              currencyConfig={appSettings.getCurrencyFormatting(marketplaceCurrency)}
              validate={priceValidators}
            />
          )}

          {isFixedLengthBooking ? (
            <StartTimeInterval
              name="startTimeInterval"
              idPrefix={`${formId}_startTimeInterval`}
              formValues={formValues}
              pristine={pristine}
            />
          ) : null}

          <Button
            className={css.submitButton}
            type="submit"
            inProgress={submitInProgress}
            disabled={submitDisabled}
            ready={submitReady}
          >
            {saveActionMsg}
          </Button>
        </Form>
      );
    }}
  />
);

export default EditListingPricingForm;
