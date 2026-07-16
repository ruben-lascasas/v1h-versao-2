import React, { useRef } from 'react';
import { Field } from 'react-final-form';
import { useIntl } from 'react-intl';
import classNames from 'classnames';

import { richText } from '../../util/richText';
import { ValidationError } from '../../components';

import css from './FieldSelectTree.module.css';

const MIN_LENGTH_FOR_LONG_WORDS = 16;

/**
 * Collects all focusable option buttons in the tree in DFS order.
 *
 * @param {HTMLElement} container - The container element containing the option buttons
 * @returns {Array<HTMLElement>} Array of focusable option buttons in order
 */
const getAllFocusableOptions = container => {
  if (!container) return [];
  const buttons = container.querySelectorAll('button');
  return Array.from(buttons).filter(button => {
    // Filter out disabled buttons and buttons with negative tabIndex
    return !button.disabled && button.tabIndex !== -1;
  });
};

/**
 * Finds the parent <ul> element that contains the given button.
 *
 * @param {HTMLElement} button - The button element
 * @returns {HTMLElement|null} The parent <ul> element or null if not found
 */
const getParentOptionList = (button, container) => {
  let parent = button.parentElement;
  while (parent && parent.tagName !== 'UL') {
    parent = parent.parentElement;
  }
  if (parent === container.firstChild) {
    parent = parent.closest('form');
  }
  return parent;
};

/**
 * Finds the parent option button (the button in the parent <li> that contains the current button's <ul>).
 *
 * @param {HTMLElement} button - The currently focused button
 * @param {HTMLElement} container - The container element containing all options
 * @returns {HTMLElement|null} The parent option button or null if not found
 */
const getParentOptionButton = (button, container) => {
  const parentList = getParentOptionList(button, container);
  if (!parentList) return null;

  // Find the parent <li> that contains this <ul>
  const parentLi = parentList.parentElement;
  if (!parentLi || parentLi.tagName !== 'LI') return null;

  // Find the button within the parent <li>
  const parentButton = parentLi.querySelector('button');
  return parentButton || null;
};

/**
 * Finds the next focusable option button within the same parent list, with looping.
 *
 * @param {HTMLElement} currentButton - The currently focused button
 * @param {HTMLElement} container - The container element containing all options
 * @returns {HTMLElement|null} The next focusable button or null if none exists
 */
const getNextOption = (currentButton, container) => {
  const parentList = getParentOptionList(currentButton, container);
  if (!parentList) return null;

  const siblingButtons = Array.from(parentList.querySelectorAll('button')).filter(
    button => !button.disabled && button.tabIndex !== -1
  );
  const currentIndex = siblingButtons.indexOf(currentButton);
  if (currentIndex === -1) return null;

  // Loop to first if at the end
  const nextIndex = currentIndex === siblingButtons.length - 1 ? 0 : currentIndex + 1;
  return siblingButtons[nextIndex];
};

/**
 * Finds the previous focusable option button within the same parent list, with looping.
 *
 * @param {HTMLElement} currentButton - The currently focused button
 * @param {HTMLElement} container - The container element containing all options
 * @returns {HTMLElement|null} The previous focusable button or null if none exists
 */
const getPreviousOption = (currentButton, container) => {
  const parentList = getParentOptionList(currentButton, container);
  if (!parentList) return null;

  const siblingButtons = Array.from(parentList.querySelectorAll('button')).filter(
    button => !button.disabled && button.tabIndex !== -1
  );
  const currentIndex = siblingButtons.indexOf(currentButton);
  if (currentIndex === -1) return null;

  // Loop to last if at the beginning
  const previousIndex = currentIndex === 0 ? siblingButtons.length - 1 : currentIndex - 1;
  return siblingButtons[previousIndex];
};
/**
 * Pick valid option configurations with format like:
 * [{ option, label, suboptions: [{ option, label }] }]
 *
 * @param {Array} options contain configs like { option, label, suboptions }
 * @param {Number} level specifies the nesting level
 * @returns an array of valid option configurations.
 */
const pickValidOptions = (options, level = 1) => {
  const isString = str => typeof str === 'string';
  const isValidOptions = opts => Array.isArray(opts);
  return options.reduce((picked, optionConfig) => {
    const { option, label, suboptions } = optionConfig;
    const isValid = isString(option) && isString(label);
    const suboptionsMaybe = isValidOptions(suboptions)
      ? { suboptions: pickValidOptions(suboptions, level + 1) }
      : {};
    const validOptionConfigMaybe = isValid ? [{ option, label, level, ...suboptionsMaybe }] : [];
    return [...picked, ...validOptionConfigMaybe];
  }, []);
};

const getSuboptions = optionConfig => optionConfig.suboptions;
const hasSuboptions = optionConfig => getSuboptions(optionConfig)?.length > 0;

/**
 * A component that represents a single option.
 *
 * @param {*} props include: config, level, handleChange, branchPath, containerRef
 * @returns <li> wrapped elements.
 */
const Option = props => {
  const intl = useIntl();
  const { config, level, handleChange, branchPath, ancestors = [], containerRef, optionCounts = {}, ...rest } = props;
  const { option, label, suboptions } = config;
  const foundFromBranchPath = branchPath.find(bc => bc.option === option);
  const isOptSelected = !!foundFromBranchPath;
  const selectedSuboptions = branchPath.filter(bc => bc.level > foundFromBranchPath?.level);
  const isSuboptionSelected = selectedSuboptions.length > 0;
  const isClickable = !isOptSelected || (isOptSelected && isSuboptionSelected);
  const cursorMaybe = { cursor: 'pointer' };

  const optionLabelRaw = label || option;
  const optionLabel = richText(optionLabelRaw, {
    longWordMinLength: MIN_LENGTH_FOR_LONG_WORDS,
    longWordClass: css.longWord,
  });

  const optionName = [...ancestors, { label: optionLabelRaw }].map(bc => bc.label).join('/');
  const pathMatch =
    isOptSelected && ancestors.length + 1 === branchPath.length ? 'exact' : 'nested';
  const ariaLabel = isOptSelected
    ? intl.formatMessage(
        { id: 'FieldSelectTree.screenreader.optionSelected' },
        { optionName, pathMatch }
      )
    : intl.formatMessage({ id: 'FieldSelectTree.screenreader.option' }, { optionName, pathMatch });

  const buttonClasses = classNames({
    [css.optionBtn]: !isOptSelected,
    [css.optionBtnSelected]: isOptSelected,
    [css.optionBtnSelectedLowest]: isOptSelected && !isSuboptionSelected,
  });

  const handleKeyDown = e => {
    if (!containerRef?.current) return;

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        e.stopPropagation();
        const nextOption = getNextOption(e.target, containerRef.current);
        if (nextOption) {
          nextOption.focus();
        }
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        e.stopPropagation();
        const previousOption = getPreviousOption(e.target, containerRef.current);
        if (previousOption) {
          previousOption.focus();
        }
        break;
      }
      case 'ArrowRight': {
        if (hasSuboptions(config) && !isOptSelected) {
          e.preventDefault();
          e.stopPropagation();
          // Expand suboptions by selecting this option
          handleChange(option, level);
          // Focus will move to first child after suboptions are rendered
          setTimeout(() => {
            const allOptions = getAllFocusableOptions(containerRef.current);
            const currentIndex = allOptions.indexOf(e.target);
            if (currentIndex !== -1 && currentIndex < allOptions.length - 1) {
              allOptions[currentIndex + 1]?.focus();
            }
          }, 100);
        }
        break;
      }
      case 'ArrowLeft': {
        // Find parent button first (before DOM changes)
        const parentButton = getParentOptionButton(e.target, containerRef.current);

        // If there's a parent option (level > 1), deselect it
        if (level >= 1 && ancestors.length >= 0) {
          e.preventDefault();
          e.stopPropagation();

          if (branchPath.length > 0) {
            // Get the parent option (last ancestor)
            const parentLevel = level - 1;

            // Clear selections at parent level and below
            const updatedValue = branchPath.reduce((picked, selectedOptionByLevel) => {
              const { level: branchPathLevel, levelKey } = selectedOptionByLevel;
              if (branchPathLevel <= parentLevel && levelKey) {
                return { ...picked, [levelKey]: selectedOptionByLevel.option };
              }
              return picked;
            }, {});
            rest.onChange?.(updatedValue);
          }

          // Move focus to parent option button
          if (parentButton) {
            setTimeout(() => {
              parentButton.focus();
            }, 0);
          }
        }
        break;
      }
      case 'Home': {
        e.preventDefault();
        e.stopPropagation();
        const firstOption = getAllFocusableOptions(containerRef.current)?.[0];
        if (firstOption) {
          firstOption.focus();
        }
        break;
      }
      case 'End': {
        e.preventDefault();
        e.stopPropagation();
        const allOptions = getAllFocusableOptions(containerRef.current);
        const lastOption = allOptions?.[allOptions.length - 1];
        if (lastOption) {
          lastOption.focus();
        }
        break;
      }
      default:
        break;
    }
  };

  const count = level === 1 ? optionCounts[option] : undefined;

  return (
    <li className={css.option} style={{ paddingLeft: `${12}px`, ...cursorMaybe }}>
      <button
        className={buttonClasses}
        onClick={e => {
          e.preventDefault();
          e.stopPropagation();
          if (isOptSelected && !isSuboptionSelected) {
            rest.onChange?.({});
          } else if (isClickable) {
            handleChange(option, level);
          }
        }}
        onKeyDown={handleKeyDown}
        aria-label={ariaLabel}
      >
        {level === 1 ? (
          <span className={css.optionRow}>
            <span className={css.optionCheckbox}>
              <svg width="16" height="16" xmlns="http://www.w3.org/2000/svg" role="presentation">
                <g fill="none" fillRule="evenodd">
                  <g transform="translate(2 2)">
                    {isOptSelected && !isSuboptionSelected ? (
                      <path fill="#3F3131" d="M9.9992985 1.5048549l-.0194517 6.9993137C9.977549 9.3309651 9.3066522 10 8.4798526 10H1.5001008c-.8284271 0-1.5-.6715729-1.5-1.5l-.000121-7c0-.8284271.6715728-1.5 1.5-1.5h.000121l6.9993246.0006862c.8284272.000067 1.4999458.671694 1.499879 1.5001211a1.5002208 1.5002208 0 0 1-.0000059.0040476z" />
                    ) : null}
                    <path
                      stroke={isOptSelected && !isSuboptionSelected ? '#3F3131' : '#C4C4C4'}
                      strokeWidth="2"
                      fill="none"
                      d="M10.9992947 1.507634l-.0194518 6.9993137C10.9760133 9.8849417 9.8578519 11 8.4798526 11H1.5001008c-1.3807119 0-2.5-1.1192881-2.5-2.4999827L-1.0000202 1.5c0-1.3807119 1.119288-2.5 2.500098-2.5l6.9994284.0006862c1.3807118.0001115 2.4999096 1.11949 2.4997981 2.5002019-.0000018.003373-.0000018.003373-.0000096.0067458z"
                    />
                  </g>
                  {isOptSelected && !isSuboptionSelected ? (
                    <path fill="#FFF" d="M5.636621 10.7824771L3.3573694 8.6447948c-.4764924-.4739011-.4764924-1.2418639 0-1.7181952.4777142-.473901 1.251098-.473901 1.7288122 0l1.260291 1.1254782 2.8256927-4.5462307c.3934117-.5431636 1.1545778-.6695372 1.7055985-.278265.5473554.3912721.6731983 1.150729.2797866 1.6951077l-3.6650524 5.709111c-.2199195.306213-.5803433.5067097-.9920816.5067097-.3225487 0-.6328797-.1263736-.8637952-.3560334z" />
                  ) : null}
                </g>
              </svg>
            </span>
            <span className={css.optionLabelText}>{optionLabel}</span>
            {count != null ? <span className={css.optionCount}>{count}</span> : null}
          </span>
        ) : optionLabel}
      </button>

      {hasSuboptions(config) && isOptSelected ? (
        <SelectOptions
          options={suboptions}
          level={level + 1}
          handleChange={handleChange}
          branchPath={branchPath}
          ancestors={[...ancestors, { option, label }]}
          containerRef={containerRef}
          optionCounts={optionCounts}
          {...rest}
        />
      ) : null}
    </li>
  );
};

/**
 * Presentational UI component wrapping <ul>.
 *
 * @param {*} props contains properties: hasOptions & children
 * @returns its children wrapped with <ul>
 */
const OptionList = props => {
  const { hasOptions, children } = props;
  return hasOptions ? <ul className={css.optionList}>{children}</ul> : null;
};

/**
 * Component, which allows user to select one of the options. Selected option might contain suboptions.
 *
 * @param {*} props must contain property options, which is an array of option configs.
 * @returns OptionList component.
 */
const SelectOptions = props => {
  const { options, containerRef, optionCounts = {}, ...rest } = props;
  return (
    <OptionList hasOptions={options?.length > 0}>
      {options.map(config => (
        <Option key={config.option} config={config} containerRef={containerRef} optionCounts={optionCounts} {...rest} />
      ))}
    </OptionList>
  );
};

/**
 * Returns an array of selected nested option configurations.
 * It roughly looks like this:
 * [
 *   { option: 'women', label: 'Women', levelKey: 'categoryLevel1', suboptions: [etc.] },
 *   { option: 'jackets', label: 'Jackets', levelKey: 'categoryLevel2' },
 * ]
 *
 * @param {Array} primaryOptions highest level of options
 * @param {Object} currentSelections selected nested options: { categoryLevel1: 'women', categoryLevel2: 'jacket' }
 * @returns an array of selected nested option configurations.
 */
const getBranchPath = (primaryOptions, currentSelections) => {
  const currentSelectionsEntries = Object.entries(currentSelections).sort(([k, v]) => k);
  return currentSelectionsEntries.reduce((branchPath, entry) => {
    const [levelKey, selectedOption] = entry;

    const currentOptions =
      branchPath.length > 0 ? branchPath[branchPath.length - 1].suboptions : primaryOptions;
    const foundOption = currentOptions.find(o => o.option === selectedOption);
    const foundOptionWithLevelKeyMaybe = foundOption ? [{ ...foundOption, levelKey }] : [];

    return [...branchPath, ...foundOptionWithLevelKeyMaybe];
  }, []);
};

/**
 * Handle value changes that happen when user clicks different options.
 *
 * @param {Array} primaryOptions highest level of options
 * @param {Object} currentSelections selected nested options: { categoryLevel1: 'women', categoryLevel2: 'jacket' }
 * @param {String} namePrefix like "categoryLevel"
 * @param {Function} onChange Final Form's onChange function.
 */
const handleChangeFn = (primaryOptions, currentSelections, namePrefix, onChange) => (
  currentOption,
  level
) => {
  const branchPath = getBranchPath(primaryOptions, currentSelections);

  const updatedCurrentBranchPath = branchPath.reduce((picked, selectedOptionByLevel) => {
    const { level: branchPathLevel, option: optionByLevel } = selectedOptionByLevel;
    const levelKey = `${namePrefix}${branchPathLevel}`;

    return branchPathLevel < level
      ? { ...picked, [levelKey]: optionByLevel }
      : branchPathLevel === level
      ? { ...picked, [levelKey]: currentOption }
      : picked;
  }, {});

  const levelKeyToUpdate = `${namePrefix}${level}`;
  const isUpdateANewBranchPath = updatedCurrentBranchPath[levelKeyToUpdate] == null;
  const updatedValue = isUpdateANewBranchPath
    ? { ...updatedCurrentBranchPath, [levelKeyToUpdate]: currentOption }
    : updatedCurrentBranchPath;

  onChange(updatedValue);
};

/**
 * @typedef {Object} SelectTreeOptionConfig
 * @property {string} option
 * @property {string} label
 * @property {Array<SelectTreeOptionConfig>} suboptions
 */

/**
 * Create Final Form field that represents "tree select" component,
 * where user can select nested options like categories.
 *
 * @component
 * @param {Object} props
 * @param {string?} props.className add more style rules in addition to components own css.root
 * @param {string?} props.rootClassName overwrite components own css.root
 * @param {string} props.name Name of the input in Final Form
 * @param {ReactNode} props.label
 * @param {Array<SelectTreeOptionConfig>} props.options
 * @returns {JSX.Element} Final Form Field containing nested "select" input
 */
const FieldSelectTree = props => {
  const { className, rootClassName, label, name, options, optionCounts = {}, ...rest } = props;
  const namePrefix = name;
  const level = 1;
  const validOptions = pickValidOptions(options);
  const containerRef = useRef(null);

  const classes = classNames(rootClassName || css.root, className);

  return (
    <Field name={name} {...rest}>
      {fieldProps => {
        const { value, onChange } = fieldProps?.input || {};
        const fieldValue = value ? value : {};
        const branchPath = getBranchPath(validOptions, fieldValue);
        const meta = fieldProps?.meta;

        return (
          <div ref={containerRef} className={classes}>
            {label ? <label>{label}</label> : null}
            <SelectOptions
              options={validOptions}
              level={level}
              handleChange={handleChangeFn(validOptions, fieldValue, namePrefix, onChange)}
              branchPath={branchPath}
              containerRef={containerRef}
              namePrefix={namePrefix}
              onChange={onChange}
              optionCounts={optionCounts}
            />

            <ValidationError fieldMeta={meta} />
          </div>
        );
      }}
    </Field>
  );
};

export default FieldSelectTree;
