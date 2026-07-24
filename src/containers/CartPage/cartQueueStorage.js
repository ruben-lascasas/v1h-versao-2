/**
 * Holds the complementary services a customer selected in the Cart but has not
 * checked out yet. Each item in the queue is a { orderData, listing } pair —
 * the same shape CheckoutPageSessionHelpers stores for the main booking —
 * so it can be pushed into CheckoutPage's own sessionStorage one at a time as
 * the customer works through separate transactions (space, then each service).
 */
import Decimal from 'decimal.js';
import { types as sdkTypes } from '../../util/sdkLoader';

const QUEUE_STORAGE_KEY = 'v1h_cart_pending_queue';

const replacer = function(k, v) {
  if (this[k] instanceof Date) {
    return { date: v, _serializedType: 'SerializableDate' };
  }
  if (this[k] instanceof Decimal) {
    return { decimal: v, _serializedType: 'SerializableDecimal' };
  }
  return sdkTypes.replacer(k, v);
};

const reviver = (k, v) => {
  if (v && typeof v === 'object' && v._serializedType === 'SerializableDate') {
    return new Date(v.date);
  } else if (v && typeof v === 'object' && v._serializedType === 'SerializableDecimal') {
    return new Decimal(v.decimal);
  }
  return sdkTypes.reviver(k, v);
};

export const storeCartQueue = queueItems => {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  if (!queueItems || queueItems.length === 0) {
    window.sessionStorage.removeItem(QUEUE_STORAGE_KEY);
    return;
  }
  window.sessionStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queueItems, replacer));
};

export const loadCartQueue = () => {
  if (typeof window === 'undefined' || !window.sessionStorage) return [];
  const raw = window.sessionStorage.getItem(QUEUE_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw, reviver);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
};

export const clearCartQueue = () => {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  window.sessionStorage.removeItem(QUEUE_STORAGE_KEY);
};
