import React from 'react';
import classNames from 'classnames';

import { FormattedMessage } from '../../../util/reactIntl';
import { createSlug, stringify } from '../../../util/urlHelpers';

import { H1, H2, NamedLink } from '../../../components';

import css from './TransactionPanel.module.css';
import { formatMoney } from '../../../util/currency';

const createListingLink = (listingId, label, listingDeleted, searchParams = {}, className = '') => {
  if (!listingDeleted) {
    const params = { id: listingId, slug: createSlug(label) };
    const to = { search: stringify(searchParams) };
    return (
      <NamedLink className={className} name="ListingPage" params={params} to={to}>
        {label}
      </NamedLink>
    );
  } else {
    return <FormattedMessage id="TransactionPanel.deletedListingOrderTitle" />;
  }
};

// Component to render the main heading for an order or a sale. Optionally also
// renders an info message based on the transaction state.
const PanelHeading = props => {
  const {
    className,
    rootClassName,
    processName,
    processState,
    showExtraInfo,
    showPriceOnMobile,
    price,
    intl,
    deliveryMethod,
    isPendingPayment,
    transactionRole,
    providerName,
    customerName,
    listingId,
    listingTitle,
    listingDeleted,
    isCustomerBanned,
  } = props;

  const isProvider = transactionRole === 'provider';
  const isCustomer = !isProvider;

  const defaultRootClassName = isCustomer ? css.headingOrder : css.headingSale;
  const titleClasses = classNames(rootClassName || defaultRootClassName, className);
  const listingLink = createListingLink(listingId, listingTitle, listingDeleted);
  const breakline = <br />;

  // `mobileMode` lets the parent split the heading across the page on mobile:
  //   "top"    → only the H1 main title + extra info (rendered above the image)
  //   "bottom" → only the H2 listing title + banned/deleted messages (below image)
  //   undefined → full heading (used on desktop)
  const { mobileMode } = props;
  const renderTitleAndExtraInfo = !mobileMode || mobileMode === 'top';
  const renderListingTitle = !mobileMode || mobileMode === 'bottom';

  const titleNode = renderTitleAndExtraInfo ? (
    <H1 className={titleClasses}>
      <span className={css.mainTitle}>
        <FormattedMessage
          id={`TransactionPage.${processName}.${transactionRole}.${processState}.title`}
          values={{ customerName, providerName, breakline }}
        />
      </span>
    </H1>
  ) : null;

  const extraInfoNode = renderTitleAndExtraInfo ? (
    <>
      {!listingDeleted && showExtraInfo ? (
        <p className={css.transactionInfoMessage}>
          <FormattedMessage
            id={`TransactionPage.${processName}.${transactionRole}.${processState}.extraInfo`}
            values={{ customerName, providerName, deliveryMethod, breakline }}
          />
        </p>
      ) : null}
    </>
  ) : null;

  const listingTitleNode = renderListingTitle ? (
    <>
      <H2 className={css.listingTitleMobile}>
        <FormattedMessage id="TransactionPage.listingTitleMobile" values={{ listingLink }} />

        {showPriceOnMobile && price ? (
          <>
            <br />
            <span className={css.inquiryPrice}>{formatMoney(intl, price)}</span>
          </>
        ) : null}
      </H2>
      {isCustomer && listingDeleted ? (
        <p className={css.transactionInfoMessage}>
          <FormattedMessage id="TransactionPanel.messageDeletedListing" />
        </p>
      ) : null}
      {isProvider && isPendingPayment ? (
        <p className={css.transactionInfoMessage}>
          <FormattedMessage
            id="TransactionPanel.salePaymentPendingInfo"
            values={{ customerName }}
          />
        </p>
      ) : null}
      {isProvider && isCustomerBanned ? (
        <p className={css.transactionInfoMessage}>
          <FormattedMessage id="TransactionPanel.customerBannedStatus" />
        </p>
      ) : null}
    </>
  ) : null;

  return (
    <>
      {titleNode}
      {extraInfoNode}
      {listingTitleNode}
    </>
  );
};

export default PanelHeading;
