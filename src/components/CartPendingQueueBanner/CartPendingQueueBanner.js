import React, { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useHistory } from 'react-router-dom';

import { useRouteConfiguration } from '../../context/routeConfigurationContext';
import { useIntl, FormattedMessage } from '../../util/reactIntl';
import { createResourceLocatorString } from '../../util/routes';
import { createSlug } from '../../util/urlHelpers';
import { formatMoney } from '../../util/currency';
import { initializeCardPaymentData } from '../../ducks/stripe.duck';
import { storeData } from '../../containers/CheckoutPage/CheckoutPageSessionHelpers';
import {
  loadCartQueue,
  storeCartQueue,
  clearCartQueue,
} from '../../containers/CartPage/cartQueueStorage';

import Button from '../Button/Button';

import css from './CartPendingQueueBanner.module.css';

/**
 * Shown on the transaction (order confirmation) page after a space booking
 * is paid, when the customer still has complementary services selected in
 * the Cart that have not been checked out yet — each service is its own
 * separate transaction, so this lets them pay for the next one.
 */
const CartPendingQueueBanner = () => {
  const [queue, setQueue] = useState([]);
  const dispatch = useDispatch();
  const history = useHistory();
  const routes = useRouteConfiguration();
  const intl = useIntl();

  useEffect(() => {
    setQueue(loadCartQueue());
  }, []);

  if (!queue || queue.length === 0) {
    return null;
  }

  const payItem = index => {
    const item = queue[index];
    const remaining = queue.filter((_, i) => i !== index);
    storeCartQueue(remaining);
    dispatch(initializeCardPaymentData());
    storeData(item.orderData, item.listing, null, 'CheckoutPage');
    history.push(
      createResourceLocatorString(
        'CheckoutPage',
        routes,
        { id: item.listing.id.uuid, slug: createSlug(item.listing.attributes.title) },
        {}
      )
    );
  };

  const dismiss = () => {
    clearCartQueue();
    setQueue([]);
  };

  return (
    <div className={css.root}>
      <div className={css.header}>
        <span className={css.heading}>
          <FormattedMessage id="CartQueue.bannerHeading" />
        </span>
        <span className={css.subheading}>
          <FormattedMessage id="CartQueue.bannerSubheading" values={{ count: queue.length }} />
        </span>
      </div>
      <div className={css.items}>
        {queue.map((item, index) => {
          const title = item.listing?.attributes?.title;
          const price = item.listing?.attributes?.price;
          const formattedPrice = price ? formatMoney(intl, price) : null;
          return (
            <div key={item.listing?.id?.uuid || index} className={css.item}>
              <div className={css.itemInfo}>
                <span className={css.itemTitle}>{title}</span>
                {formattedPrice ? <span className={css.itemPrice}>{formattedPrice}</span> : null}
              </div>
              <Button className={css.payButton} onClick={() => payItem(index)}>
                <FormattedMessage id="CartQueue.payItemButton" values={{ title }} />
              </Button>
            </div>
          );
        })}
      </div>
      <button type="button" className={css.dismissButton} onClick={dismiss}>
        <FormattedMessage id="CartQueue.dismissButton" />
      </button>
    </div>
  );
};

export default CartPendingQueueBanner;
