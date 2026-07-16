import React from 'react';
import { useLocation } from 'react-router-dom';
import { Form as FinalForm } from 'react-final-form';
import classNames from 'classnames';

import { parse, getValidInboxSort } from '../../../util/urlHelpers';
import { Form } from '../../../components';

import css from './InboxSearchForm.module.css';
import InboxSortBy from './InboxSortBy';

const isEmptySort = sort => sort.constructor === Object && Object.keys(sort).length === 0;

/**
 * InboxSearchForm component
 *
 * Class for all inbox sorting/filtering options - customizations should be added here.
 * Currently only contains sorting functionality.
 *
 * @component
 * @param {Object} props
 * @param {string} [props.rootClassName] - Custom class that extends the default class for the root element
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {intlShape} props.intl - The intl object
 * @returns {JSX.Element}
 */
const InboxSearchForm = props => {
  const { intl, onSelect, tab } = props;

  const location = useLocation();
  const searchParams = parse(location.search);
  const validSort = getValidInboxSort(searchParams.sort);
  const defaultSort = 'createdAt';
  const initialValue = !isEmptySort(validSort) ? searchParams.sort : defaultSort;

  // On the messages tab the transaction "state" rarely changes (inquiries
  // don't transition on sdk.messages.send), so that sort option is not useful.
  const excludedKeys = tab === 'messages' ? ['lastTransitionedAt'] : [];

  return (
    <FinalForm
      {...props}
      render={formRenderProps => {
        const { rootClassName, className, handleSubmit } = formRenderProps;
        const classes = classNames(rootClassName || css.root, className);

        return (
          <Form onSubmit={handleSubmit} className={classes}>
            <div className={css.sortyByWrapper}>
              <span className={css.sortyBy}>
                {intl.formatMessage({ id: 'SortBy.heading' })}:
              </span>
              <InboxSortBy
                intl={intl}
                onSelect={onSelect}
                initialValue={initialValue}
                excludedKeys={excludedKeys}
              />
            </div>
          </Form>
        );
      }}
    />
  );
};

export default InboxSearchForm;
