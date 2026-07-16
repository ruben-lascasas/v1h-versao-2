import React from 'react';
import { Field } from 'react-final-form';
import classNames from 'classnames';

import { intlShape } from '../../util/reactIntl';
import { propTypes } from '../../util/types';
import * as validators from '../../util/validators';

import css from './AuthenticationPage.module.css';

// Hidden input field
const FieldHidden = props => {
  const { name } = props;
  return (
    <Field id={name} name={name} type="hidden" className={css.unitTypeHidden}>
      {fieldRenderProps => <input {...fieldRenderProps?.input} />}
    </Field>
  );
};

// Airbnb-style icons for the user type cards, keyed by user type ID.
const UserTypeIcon = ({ userType }) => {
  const common = {
    width: 30,
    height: 30,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };

  switch (userType) {
    case 'anunciante':
      // Storefront — "I list my spaces"
      return (
        <svg {...common}>
          <path d="M3 9.5 4.7 4h14.6L21 9.5" />
          <path d="M3 9.5a2.6 2.6 0 0 0 5.14.6A2.6 2.6 0 0 0 13.2 10a2.6 2.6 0 0 0 5.06.1A2.6 2.6 0 0 0 21 9.5" />
          <path d="M4.5 12.5V20h15v-7.5" />
          <path d="M9.5 20v-5h5v5" />
        </svg>
      );
    case 'visitante':
      // Magnifying glass — "I discover and book spaces"
      return (
        <svg {...common}>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m15.4 15.4 5.1 5.1" />
          <path d="M7.8 10.5a2.7 2.7 0 0 1 2.7-2.7" />
        </svg>
      );
    default:
      // Generic person icon for any future user type
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4.5 20c1.3-3.2 4.1-5 7.5-5s6.2 1.8 7.5 5" />
        </svg>
      );
  }
};

/**
 * Return React Final Form Field that allows selecting user type.
 * Rendered as a two-column card picker (icon + label + description)
 * instead of the template's default dropdown.
 *
 * @component
 * @param {Object} props
 * @param {string} props.rootClassName - The root class that overrides the default class css.userTypeSelect
 * @param {string} props.className - The class that extends the root class
 * @param {string} props.name - The name of the field / input
 * @param {Array<propTypes.userType>} props.userTypes - The user types
 * @param {boolean} props.hasExistingUserType - Whether the user type already exists
 * @param {intlShape} props.intl - The intl object
 * @returns {JSX.Element}
 */
const FieldSelectUserType = props => {
  const { rootClassName, className, name, userTypes, hasExistingUserType, intl } = props;
  const hasMultipleUserTypes = userTypes?.length > 1;
  const classes = classNames(rootClassName || css.userTypeSelect, className);
  const requiredValidator = validators.required(
    intl.formatMessage({ id: 'FieldSelectUserType.required' })
  );

  // Optional per-type description (e.g. FieldSelectUserType.anuncianteDescription).
  const descriptionMaybe = type => {
    const descriptionKey = `FieldSelectUserType.${type}Description`;
    return intl.messages[descriptionKey] ? intl.formatMessage({ id: descriptionKey }) : null;
  };

  return hasMultipleUserTypes && !hasExistingUserType ? (
    <div className={classes} role="radiogroup" aria-label={intl.formatMessage({ id: 'FieldSelectUserType.label' })}>
      <div className={css.userTypeCards}>
        {userTypes.map(config => {
          const type = config.userType;
          const description = descriptionMaybe(type);
          return (
            <Field
              key={type}
              name={name}
              type="radio"
              value={type}
              validate={requiredValidator}
            >
              {({ input }) => (
                <label
                  className={classNames(css.userTypeCard, {
                    [css.userTypeCardSelected]: input.checked,
                  })}
                >
                  <input {...input} className={css.userTypeCardInput} />
                  <span className={css.userTypeCardIcon}>
                    <UserTypeIcon userType={type} />
                  </span>
                  <span className={css.userTypeCardLabel}>{config.label}</span>
                  {description ? (
                    <span className={css.userTypeCardDescription}>{description}</span>
                  ) : null}
                </label>
              )}
            </Field>
          );
        })}
      </div>
      <Field name={name} subscription={{ error: true, touched: true, submitFailed: true }}>
        {({ meta }) =>
          meta.error && (meta.touched || meta.submitFailed) ? (
            <div className={css.userTypeCardsError}>{meta.error}</div>
          ) : null
        }
      </Field>
    </div>
  ) : (
    <>
      <FieldHidden name={name} />
    </>
  );
};

export default FieldSelectUserType;
