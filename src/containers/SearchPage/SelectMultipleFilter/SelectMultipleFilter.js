import React from 'react';
import classNames from 'classnames';
import { useForm, useFormState } from 'react-final-form';

import { useIntl } from '../../../util/reactIntl';
import { parseSelectFilterOptions } from '../../../util/search';
import { SCHEMA_TYPE_ENUM, SCHEMA_TYPE_MULTI_ENUM } from '../../../util/types';

import { FieldCheckbox } from '../../../components';

import FilterPlain from '../FilterPlain/FilterPlain';
import FilterPopup from '../FilterPopup/FilterPopup';

import css from './SelectMultipleFilter.module.css';

const SingleSelectItem = ({ id, name, option, labelNode }) => {
  const { change } = useForm();
  const { values } = useFormState({ subscription: { values: true } });
  const current = values[name] || [];
  const isChecked = current.includes(option);

  const handleChange = () => {
    change(name, isChecked ? [] : [option]);
  };

  return (
    <span className={css.singleRoot}>
      <input
        id={id}
        type="checkbox"
        className={css.singleInput}
        checked={isChecked}
        onChange={handleChange}
      />
      <label htmlFor={id} className={css.singleLabel}>
        <span className={css.singleCheckboxWrapper}>
          <svg width="16" height="16" xmlns="http://www.w3.org/2000/svg" role="presentation">
            <g fill="none" fillRule="evenodd">
              <g transform="translate(2 2)">
                <path
                  className={isChecked ? css.singleChecked : css.singleCheckedHidden}
                  d="M9.9992985 1.5048549l-.0194517 6.9993137C9.977549 9.3309651 9.3066522 10 8.4798526 10H1.5001008c-.8284271 0-1.5-.6715729-1.5-1.5l-.000121-7c0-.8284271.6715728-1.5 1.5-1.5h.000121l6.9993246.0006862c.8284272.000067 1.4999458.671694 1.499879 1.5001211a1.5002208 1.5002208 0 0 1-.0000059.0040476z"
                />
                <path
                  className={isChecked ? css.singleBoxChecked : css.singleBox}
                  strokeWidth="2"
                  d="M10.9992947 1.507634l-.0194518 6.9993137C10.9760133 9.8849417 9.8578519 11 8.4798526 11H1.5001008c-1.3807119 0-2.5-1.1192881-2.5-2.4999827L-1.0000202 1.5c0-1.3807119 1.119288-2.5 2.500098-2.5l6.9994284.0006862c1.3807118.0001115 2.4999096 1.11949 2.4997981 2.5002019-.0000018.003373-.0000018.003373-.0000096.0067458z"
                />
              </g>
              <path
                d="M5.636621 10.7824771L3.3573694 8.6447948c-.4764924-.4739011-.4764924-1.2418639 0-1.7181952.4777142-.473901 1.251098-.473901 1.7288122 0l1.260291 1.1254782 2.8256927-4.5462307c.3934117-.5431636 1.1545778-.6695372 1.7055985-.278265.5473554.3912721.6731983 1.150729.2797866 1.6951077l-3.6650524 5.709111c-.2199195.306213-.5803433.5067097-.9920816.5067097-.3225487 0-.6328797-.1263736-.8637952-.3560334z"
                fill="#FFF"
                style={{ display: isChecked ? 'block' : 'none' }}
              />
            </g>
          </svg>
        </span>
        <span className={css.singleText}>{labelNode}</span>
      </label>
    </span>
  );
};

// SelectMultipleFilter doesn't need array mutators since it doesn't require validation.
// TODO: Live edit didn't work with FieldCheckboxGroup
//       There's a mutation problem: formstate.dirty is not reliable with it.
const GroupOfFieldCheckboxes = props => {
  const { id, className, name, options, legend, optionCounts = {}, singleSelect = false } = props;
  return (
    <fieldset className={className}>
      {legend ? <legend className={css.accessibilityLegend}>{legend}</legend> : null}
      <ul className={css.list}>
        {options.map(optionConfig => {
          const { option, label } = optionConfig;
          const fieldId = `${id}.${option}`;
          const count = optionCounts[option];
          const labelNode = count != null
            ? <span className={css.labelRow}><span>{label}</span><span className={css.optionCount}>{count}</span></span>
            : label;
          return (
            <li key={fieldId} className={css.item}>
              {singleSelect
                ? <SingleSelectItem id={fieldId} name={name} option={option} labelNode={labelNode} />
                : <FieldCheckbox id={fieldId} name={name} label={labelNode} value={option} />
              }
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
};

const getQueryParamName = queryParamNames => {
  return Array.isArray(queryParamNames) ? queryParamNames[0] : queryParamNames;
};

// Format URI component's query param: { pub_key: 'has_all:a,b,c' }
const format = (selectedOptions, queryParamName, schemaType, searchMode) => {
  const hasOptionsSelected = selectedOptions && selectedOptions.length > 0;
  const mode = schemaType === SCHEMA_TYPE_MULTI_ENUM && searchMode ? `${searchMode}:` : '';
  const value = hasOptionsSelected ? `${mode}${selectedOptions.join(',')}` : null;
  return { [queryParamName]: value };
};

/**
 * SelectMultipleFilter component
 *
 * @component
 * @param {Object} props
 * @param {string} [props.rootClassName] - Custom class that extends the default class for the root element
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {string} props.id - The id
 * @param {string} props.name - The name
 * @param {node} props.label - The label
 * @param {Function} props.getAriaLabel - The function to retrieve the aria label for the component
 * @param {Array<string>} props.queryParamNames - The query param names
 * @param {Object} props.initialValues - The initial values
 * @param {Function} props.onSubmit - The function to handle the submit
 * @param {Array<Object>} props.options - The options
 * @param {SCHEMA_TYPE_ENUM | SCHEMA_TYPE_MULTI_ENUM} props.schemaType - The schema type
 * @param {'has_all' | 'has_any'} props.searchMode - The search mode
 * @param {boolean} [props.showAsPopup] - Whether to show as popup
 * @param {number} [props.contentPlacementOffset] - The content placement offset
 * @returns {JSX.Element}
 */
const SelectMultipleFilter = props => {
  const intl = useIntl();
  const {
    rootClassName,
    className,
    id,
    name,
    label,
    getAriaLabel,
    options,
    initialValues,
    contentPlacementOffset = 0,
    onSubmit,
    queryParamNames,
    schemaType,
    searchMode,
    showAsPopup,
    optionCounts,
    singleSelect = false,
    ...rest
  } = props;

  const classes = classNames(rootClassName || css.root, className);

  const queryParamName = getQueryParamName(queryParamNames);
  const hasInitialValues = !!initialValues && !!initialValues[queryParamName];
  // Parse options from param strings like "has_all:a,b,c" or "a,b,c"
  const selectedOptions = hasInitialValues
    ? parseSelectFilterOptions(initialValues[queryParamName])
    : [];

  const labelForPopup = hasInitialValues
    ? intl.formatMessage(
        { id: 'SelectMultipleFilter.labelSelected' },
        { labelText: label, count: selectedOptions.length }
      )
    : label;

  const labelSelectionForPlain = hasInitialValues
    ? intl.formatMessage(
        { id: 'SelectMultipleFilterPlainForm.labelSelected' },
        { count: selectedOptions.length }
      )
    : '';

  // pass the initial values with the name key so that
  // they can be passed to the correct field
  const namedInitialValues = { [name]: selectedOptions };

  const handleSubmit = values => {
    const usedValue = values ? values[name] : values;
    onSubmit(format(usedValue, queryParamName, schemaType, searchMode));
  };

  return showAsPopup ? (
    <FilterPopup
      className={classes}
      rootClassName={rootClassName}
      label={labelForPopup}
      ariaLabel={getAriaLabel(label, selectedOptions.join(', '))}
      isSelected={hasInitialValues}
      id={`${id}.popup`}
      showAsPopup
      contentPlacementOffset={contentPlacementOffset}
      onSubmit={handleSubmit}
      initialValues={namedInitialValues}
      keepDirtyOnReinitialize
      {...rest}
    >
      <GroupOfFieldCheckboxes
        className={css.fieldGroup}
        name={name}
        id={`${id}-checkbox-group`}
        options={options}
        legend={label}
        optionCounts={optionCounts}
        singleSelect={singleSelect}
      />
    </FilterPopup>
  ) : (
    <FilterPlain
      className={className}
      rootClassName={rootClassName}
      label={label}
      labelSelection={labelSelectionForPlain}
      ariaLabel={getAriaLabel(label, selectedOptions.join(', '))}
      isSelected={hasInitialValues}
      id={`${id}.plain`}
      liveEdit
      onSubmit={handleSubmit}
      initialValues={namedInitialValues}
      {...rest}
    >
      <GroupOfFieldCheckboxes
        className={css.fieldGroupPlain}
        name={name}
        id={`${id}-checkbox-group`}
        options={options}
        legend={label}
        optionCounts={optionCounts}
        singleSelect={singleSelect}
      />
    </FilterPlain>
  );
};

export default SelectMultipleFilter;
