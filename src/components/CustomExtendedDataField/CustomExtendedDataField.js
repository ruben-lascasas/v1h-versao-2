import React, { useRef } from 'react';
import classNames from 'classnames';
import { useForm, useFormState } from 'react-final-form';

// Import config and utils
import { useIntl } from '../../util/reactIntl';
import {
  SCHEMA_TYPE_ENUM,
  SCHEMA_TYPE_MULTI_ENUM,
  SCHEMA_TYPE_TEXT,
  SCHEMA_TYPE_LONG,
  SCHEMA_TYPE_BOOLEAN,
  SCHEMA_TYPE_YOUTUBE,
} from '../../util/types';
import {
  required,
  nonEmptyArray,
  validateInteger,
  validateYoutubeURL,
} from '../../util/validators';
// Import shared components
import { FieldCheckboxGroup, FieldSelect, FieldTextInput, FieldBoolean } from '../../components';
// Import modules from this directory
import css from './CustomExtendedDataField.module.css';

const createFilterOptions = options => options.map(o => ({ key: `${o.option}`, label: o.label }));

const getLabel = fieldConfig => fieldConfig?.saveConfig?.label || fieldConfig?.label;

const CustomFieldEnum = props => {
  const { name, fieldConfig, defaultRequiredMessage, formId, intl } = props;
  const { enumOptions = [], saveConfig } = fieldConfig || {};
  const { placeholderMessage, isRequired, requiredMessage } = saveConfig || {};
  const validateMaybe = isRequired
    ? { validate: required(requiredMessage || defaultRequiredMessage) }
    : {};
  const placeholder =
    placeholderMessage ||
    intl.formatMessage({ id: 'CustomExtendedDataField.placeholderSingleSelect' });
  const filterOptions = createFilterOptions(enumOptions);

  const label = getLabel(fieldConfig);

  return filterOptions ? (
    <FieldSelect
      className={css.customField}
      name={name}
      id={formId ? `${formId}.${name}` : name}
      label={label}
      helpText={fieldConfig?.helpText}
      {...validateMaybe}
    >
      <option disabled value="">
        {placeholder}
      </option>
      {filterOptions.map(optionConfig => {
        const key = optionConfig.key;
        return (
          <option key={key} value={key}>
            {optionConfig.label}
          </option>
        );
      })}
    </FieldSelect>
  ) : null;
};

const CustomFieldMultiEnum = props => {
  const { name, fieldConfig, defaultRequiredMessage, formId } = props;
  const { enumOptions = [], saveConfig } = fieldConfig || {};
  const { isRequired, requiredMessage } = saveConfig || {};
  const label = getLabel(fieldConfig);
  const validateMaybe = isRequired
    ? { validate: nonEmptyArray(requiredMessage || defaultRequiredMessage) }
    : {};

  return enumOptions ? (
    <FieldCheckboxGroup
      className={css.customField}
      id={formId ? `${formId}.${name}` : name}
      name={name}
      label={label}
      helpText={fieldConfig?.helpText}
      options={createFilterOptions(enumOptions)}
      {...validateMaybe}
    />
  ) : null;
};

const CustomFieldText = props => {
  const { name, fieldConfig, defaultRequiredMessage, formId, intl } = props;
  const { placeholderMessage, isRequired, requiredMessage } = fieldConfig?.saveConfig || {};
  const label = getLabel(fieldConfig);
  const validateMaybe = isRequired
    ? { validate: required(requiredMessage || defaultRequiredMessage) }
    : {};
  const placeholder =
    placeholderMessage || intl.formatMessage({ id: 'CustomExtendedDataField.placeholderText' });

  return (
    <FieldTextInput
      className={css.customField}
      id={formId ? `${formId}.${name}` : name}
      name={name}
      type="textarea"
      label={label}
      helpText={fieldConfig?.helpText}
      placeholder={placeholder}
      {...validateMaybe}
    />
  );
};

const CustomFieldLong = props => {
  const { name, fieldConfig, defaultRequiredMessage, formId, intl } = props;
  const { minimum, maximum, saveConfig } = fieldConfig;
  const { placeholderMessage, isRequired, requiredMessage } = saveConfig || {};
  const label = getLabel(fieldConfig);
  const placeholder =
    placeholderMessage || intl.formatMessage({ id: 'CustomExtendedDataField.placeholderLong' });
  const numberTooSmallMessage = intl.formatMessage(
    { id: 'CustomExtendedDataField.numberTooSmall' },
    { min: minimum }
  );
  const numberTooBigMessage = intl.formatMessage(
    { id: 'CustomExtendedDataField.numberTooBig' },
    { max: maximum }
  );

  // Field with schema type 'long' will always be validated against min & max
  const validate = (value, min, max) => {
    const requiredMsg = requiredMessage || defaultRequiredMessage;
    return isRequired && value == null
      ? requiredMsg
      : validateInteger(value, max, min, numberTooSmallMessage, numberTooBigMessage);
  };

  return (
    <NumberFieldWithSteppers
      formId={formId}
      name={name}
      label={label}
      placeholder={placeholder}
      helpText={fieldConfig?.helpText}
      minimum={minimum}
      maximum={maximum}
      validate={validate}
    />
  );
};

// Number input with custom +/- steppers that respect min/max from field config.
// Uses Final Form hooks to read/write the value cleanly.
const NumberFieldWithSteppers = ({
  formId,
  name,
  label,
  placeholder,
  helpText,
  minimum,
  maximum,
  validate,
}) => {
  const form = useForm();
  const { values } = useFormState({ subscription: { values: true } });
  const currentValue = values?.[name];

  const clamp = n => {
    let next = n;
    if (typeof minimum === 'number' && next < minimum) next = minimum;
    if (typeof maximum === 'number' && next > maximum) next = maximum;
    return next;
  };

  const stepBy = delta => {
    const latest = form.getState().values?.[name];
    const num = typeof latest === 'number' ? latest : Number.parseInt(latest, 10);
    const base = Number.isNaN(num) ? (typeof minimum === 'number' ? minimum : 0) : num;
    form.change(name, clamp(base + delta));
  };

  // Hold-to-repeat: after a short delay, keep stepping until released.
  const holdTimeoutRef = useRef(null);
  const holdIntervalRef = useRef(null);
  const stopHold = () => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  };
  const startHold = delta => {
    stopHold();
    stepBy(delta);
    // Wait 400ms before kicking off repeat (so a quick click doesn't repeat).
    holdTimeoutRef.current = setTimeout(() => {
      holdIntervalRef.current = setInterval(() => stepBy(delta), 80);
    }, 400);
  };

  const incDisabled =
    typeof maximum === 'number' && typeof currentValue === 'number' && currentValue >= maximum;
  const decDisabled =
    typeof minimum === 'number' && typeof currentValue === 'number' && currentValue <= minimum;

  const inputId = formId ? `${formId}.${name}` : name;

  return (
    <div className={classNames(css.customField, css.numberField)}>
      {label ? (
        <label htmlFor={inputId} className={css.numberLabel}>
          {label}
        </label>
      ) : null}
      <div className={css.numberWrapper}>
        <FieldTextInput
          id={inputId}
          name={name}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          helpText={helpText}
          inputRootClass={css.numberInput}
          parse={value => {
            const digits = (value || '').toString().replace(/\D+/g, '');
            if (digits === '') return null;
            const parsed = Number.parseInt(digits, 10);
            return Number.isNaN(parsed) ? null : parsed;
          }}
          format={value => (value == null || value === '' ? '' : String(value))}
          placeholder={placeholder}
          validate={value => validate(value, minimum, maximum)}
          onKeyDown={e => {
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              stepBy(1);
              return;
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              stepBy(-1);
              return;
            }
            const allowed = [
              'Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'Home', 'End',
              'ArrowLeft', 'ArrowRight',
            ];
            if (allowed.includes(e.key)) return;
            if (e.ctrlKey || e.metaKey) return;
            if (!/^[0-9]$/.test(e.key)) {
              e.preventDefault();
            }
          }}
        />
        <div className={css.steppers}>
          <button
            type="button"
            className={css.stepperButton}
            onMouseDown={e => { e.preventDefault(); startHold(1); }}
            onMouseUp={stopHold}
            onMouseLeave={stopHold}
            onTouchStart={e => { e.preventDefault(); startHold(1); }}
            onTouchEnd={stopHold}
            onTouchCancel={stopHold}
            disabled={incDisabled}
            tabIndex={-1}
            aria-label="Aumentar"
          >
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
              <path d="M1 5l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </button>
          <button
            type="button"
            className={css.stepperButton}
            onMouseDown={e => { e.preventDefault(); startHold(-1); }}
            onMouseUp={stopHold}
            onMouseLeave={stopHold}
            onTouchStart={e => { e.preventDefault(); startHold(-1); }}
            onTouchEnd={stopHold}
            onTouchCancel={stopHold}
            disabled={decDisabled}
            tabIndex={-1}
            aria-label="Diminuir"
          >
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
              <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

const CustomFieldBoolean = props => {
  const { name, fieldConfig, defaultRequiredMessage, formId, intl } = props;
  const { placeholderMessage, isRequired, requiredMessage } = fieldConfig?.saveConfig || {};
  const label = getLabel(fieldConfig);
  const validateMaybe = isRequired
    ? { validate: required(requiredMessage || defaultRequiredMessage) }
    : {};
  const placeholder =
    placeholderMessage || intl.formatMessage({ id: 'CustomExtendedDataField.placeholderBoolean' });

  return (
    <FieldBoolean
      className={css.customField}
      id={formId ? `${formId}.${name}` : name}
      name={name}
      label={label}
      helpText={fieldConfig?.helpText}
      placeholder={placeholder}
      {...validateMaybe}
    />
  );
};

const CustomFieldYoutube = props => {
  const { name, fieldConfig, defaultRequiredMessage, formId, intl } = props;
  const { placeholderMessage, isRequired, requiredMessage } = fieldConfig?.saveConfig || {};
  const label = getLabel(fieldConfig);
  const placeholder =
    placeholderMessage ||
    intl.formatMessage({ id: 'CustomExtendedDataField.placeholderYoutubeVideoURL' });

  const notValidUrlMessage = intl.formatMessage({
    id: 'CustomExtendedDataField.notValidYoutubeVideoURL',
  });

  const validate = value => {
    const requiredMsg = requiredMessage || defaultRequiredMessage;
    return isRequired && value == null
      ? requiredMsg
      : validateYoutubeURL(value, notValidUrlMessage);
  };

  return (
    <FieldTextInput
      className={css.customField}
      id={formId ? `${formId}.${name}` : name}
      name={name}
      type="text"
      label={label}
      helpText={fieldConfig?.helpText}
      placeholder={placeholder}
      validate={value => validate(value)}
    />
  );
};

/**
 * Return Final Form field for each configuration according to schema type.
 *
 * These custom extended data fields are for generating input fields from configuration defined
 * in marketplace-custom-config.js. Other panels in EditListingWizard might add more extended data
 * fields (e.g. shipping fee), but these are independently customizable.
 *
 * @param {Object} props should contain fieldConfig that defines schemaType, enumOptions?, and
 * saveConfig for the field.
 */
const CustomExtendedDataField = props => {
  const intl = useIntl();
  const { enumOptions = [], schemaType } = props?.fieldConfig || {};
  const defaultRequiredMessage = intl.formatMessage({
    id: 'CustomExtendedDataField.required',
  });
  const renderFieldComponent = (FieldComponent, props) => (
    <FieldComponent {...props} defaultRequiredMessage={defaultRequiredMessage} intl={intl} />
  );

  return schemaType === SCHEMA_TYPE_ENUM && enumOptions
    ? renderFieldComponent(CustomFieldEnum, props)
    : schemaType === SCHEMA_TYPE_MULTI_ENUM && enumOptions
    ? renderFieldComponent(CustomFieldMultiEnum, props)
    : schemaType === SCHEMA_TYPE_TEXT
    ? renderFieldComponent(CustomFieldText, props)
    : schemaType === SCHEMA_TYPE_LONG
    ? renderFieldComponent(CustomFieldLong, props)
    : schemaType === SCHEMA_TYPE_BOOLEAN
    ? renderFieldComponent(CustomFieldBoolean, props)
    : schemaType === SCHEMA_TYPE_YOUTUBE
    ? renderFieldComponent(CustomFieldYoutube, props)
    : null;
};

export default CustomExtendedDataField;
