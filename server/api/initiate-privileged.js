const sharetribeSdk = require('sharetribe-flex-sdk');
const { transactionLineItems } = require('../api-util/lineItems');
const { isIntentionToMakeOffer } = require('../api-util/negotiation');
const {
  getSdk,
  getTrustedSdk,
  getIntegrationSdk,
  handleError,
  serialize,
  fetchCommission,
} = require('../api-util/sdk');
const log = require('../log');
const { resolveCommission, hostMetadataFrom } = require('../api-util/hostCommission');

// Best-effort blocking of additional slots' dates via availability exceptions.
const createMultiBookingExceptions = (listingId, multipleBookings) => {
  const integrationSdk = getIntegrationSdk();
  const additional = multipleBookings?.additionalBookings || [];
  if (!integrationSdk || additional.length === 0 || !listingId) return Promise.resolve();
  return Promise.all(
    additional.map(slot =>
      integrationSdk.availabilityExceptions
        .create({
          listingId,
          start: new Date(slot.bookingStart),
          end: new Date(slot.bookingEnd),
          seats: 0,
        })
        .catch(e => {
          log.error(e, 'multi-booking-exception-create-failed', {
            slotStart: slot.bookingStart,
            slotEnd: slot.bookingEnd,
          });
        })
    )
  );
};

const { Money } = sharetribeSdk.types;

// O autor vem incluido para se saber o modelo de comissao do anfitriao.
const listingPromise = (sdk, id) => sdk.listings.show({ id, include: ['author'] });

const getFullOrderData = (orderData, bodyParams, currency) => {
  const { offerInSubunits } = orderData || {};
  const transitionName = bodyParams.transition;

  return isIntentionToMakeOffer(offerInSubunits, transitionName)
    ? {
        ...orderData,
        ...bodyParams.params,
        currency,
        offer: new Money(offerInSubunits, currency),
      }
    : { ...orderData, ...bodyParams.params };
};

const getMetadata = (orderData, transition) => {
  const { actor, offerInSubunits } = orderData || {};
  // NOTE: for now, the actor is always "provider".
  const hasActor = ['provider', 'customer'].includes(actor);
  const by = hasActor ? actor : null;

  return isIntentionToMakeOffer(offerInSubunits, transition)
    ? {
        metadata: {
          offers: [
            {
              offerInSubunits,
              by,
              transition,
            },
          ],
        },
      }
    : {};
};

module.exports = (req, res) => {
  const { isSpeculative, orderData, bodyParams, queryParams } = req.body || {};
  const transitionName = bodyParams.transition;
  const sdk = getSdk(req, res);
  let lineItems = null;
  let metadataMaybe = {};

  Promise.all([listingPromise(sdk, bodyParams?.params?.listingId), fetchCommission(sdk)])
    .then(([showListingResponse, fetchAssetsResponse]) => {
      const listing = showListingResponse.data.data;
      const commissionAsset = fetchAssetsResponse.data.data[0];

      const currency = listing.attributes.price?.currency || orderData.currency;
      const { providerCommission, customerCommission } = resolveCommission(
        commissionAsset?.type === 'jsonAsset' ? commissionAsset.attributes.data : {},
        hostMetadataFrom(showListingResponse)
      );

      lineItems = transactionLineItems(
        listing,
        getFullOrderData(orderData, bodyParams, currency),
        providerCommission,
        customerCommission
      );
      metadataMaybe = getMetadata(orderData, transitionName);

      return getTrustedSdk(req);
    })
    .then(trustedSdk => {
      const { params } = bodyParams;

      // Add lineItems to the body params
      const body = {
        ...bodyParams,
        params: {
          ...params,
          lineItems,
          ...metadataMaybe,
        },
      };

      if (isSpeculative) {
        return trustedSdk.transactions.initiateSpeculative(body, queryParams);
      }
      return trustedSdk.transactions.initiate(body, queryParams);
    })
    .then(apiResponse => {
      const { status, statusText, data } = apiResponse;
      // Block additional slots' dates after a successful (non-speculative)
      // multi-booking initiate.
      if (!isSpeculative) {
        const protectedData = bodyParams?.params?.protectedData || {};
        const multipleBookings = protectedData.multipleBookings;
        const listingId = bodyParams?.params?.listingId;
        if (multipleBookings && listingId) {
          createMultiBookingExceptions(listingId, multipleBookings).catch(() => {});
        }
      }
      res
        .status(status)
        .set('Content-Type', 'application/transit+json')
        .send(
          serialize({
            status,
            statusText,
            data,
          })
        )
        .end();
    })
    .catch(e => {
      handleError(res, e);
    });
};
