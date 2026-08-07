/**
 * This file contains server side endpoints that can be used to perform backend
 * tasks that can not be handled in the browser.
 *
 * The endpoints should not clash with the application routes. Therefore, the
 * endpoints are prefixed in the main server where this file is used.
 */

const express = require('express');
const bodyParser = require('body-parser');
const { deserialize } = require('./api-util/sdk');

const initiateLoginAs = require('./api/initiate-login-as');
const loginAs = require('./api/login-as');
const transactionLineItems = require('./api/transaction-line-items');
const initiatePrivileged = require('./api/initiate-privileged');
const transitionPrivileged = require('./api/transition-privileged');
const deleteAccount = require('./api/delete-account');
const recomputeListingRating = require('./api/recompute-listing-rating');

const createUserWithIdp = require('./api/auth/createUserWithIdp');
const contact = require('./api/contact');
const notifyAdmin = require('./api/notify-admin');
const verification = require('./api/verification');
const verificationAdmin = require('./api/verification-admin');
const destaqueBilling = require('./api/destaque-billing');
const changeUserType = require('./api/change-user-type');
const newsletter = require('./api/newsletter');
const reportListing = require('./api/report-listing');
const reportListingStatus = require('./api/report-listing-status');
const reportUser = require('./api/report-user');
const reportUserStatus = require('./api/report-user-status');
const feedback = require('./api/feedback');
const pwaCounter = require('./api/pwa-counter');
const waitlist = require('./api/waitlist');
const hostStats = require('./api/host-stats');
const listingLike = require('./api/listing-like');
const dismissFavoriteAlerts = require('./api/dismiss-favorite-alerts');
const userFollow = require('./api/user-follow');
const dismissFollowAlerts = require('./api/dismiss-follow-alerts');
const dismissExtraAlert = require('./api/dismiss-extra-alert');
const translate = require('./api/translate');
const listingViews = require('./api/listing-views');
const approveDestaque = require('./api/approve-destaque');
const approveListing = require('./api/approve-listing');
const profileMetadata = require('./api/profile-metadata');

const { authenticateFacebook, authenticateFacebookCallback } = require('./api/auth/facebook');
const { authenticateGoogle, authenticateGoogleCallback } = require('./api/auth/google');

const router = express.Router();

// ================ Webhook do Stripe ================ //

// Antes de qualquer parser de corpo: a verificacao da assinatura precisa dos
// bytes exactos que o Stripe enviou, e bodyParser.json() destroi-os.
const stripeWebhook = require('./api/stripe-webhook');
router.post(
  '/stripe/webhook',
  bodyParser.raw({ type: 'application/json' }),
  stripeWebhook.handler
);

// ================ API router middleware: ================ //

// Parse JSON body (used by the contact form endpoint)
router.use(bodyParser.json({ limit: '30mb' }));

// Parse Transit body first to a string
router.use(
  bodyParser.text({
    type: 'application/transit+json',
  })
);

// Deserialize Transit body string to JS data
router.use((req, res, next) => {
  if (req.get('Content-Type') === 'application/transit+json' && typeof req.body === 'string') {
    try {
      req.body = deserialize(req.body);
    } catch (e) {
      console.error('Failed to parse request body as Transit:');
      console.error(e);
      res.status(400).send('Invalid Transit in request body.');
      return;
    }
  }
  next();
});

// ================ API router endpoints: ================ //

router.get('/initiate-login-as', initiateLoginAs);
router.get('/login-as', loginAs);
router.post('/transaction-line-items', transactionLineItems);
router.post('/initiate-privileged', initiatePrivileged);
router.post('/transition-privileged', transitionPrivileged);
router.post('/delete-account', deleteAccount);
router.post('/contact', contact);
router.post('/notify-admin', notifyAdmin);
// Verificação de anunciantes: o próprio utilizador consulta e submete.
router.get('/verification', verification.getStatus);
router.post('/verification/upload', verification.upload);

// Mudanca de tipo de conta apos o registo.
router.get('/user-types', changeUserType.list);
router.post('/change-user-type', changeUserType.change);

router.post('/destaque/checkout', destaqueBilling.checkout);

// Painel do operador. Protegido por ADMIN_EMAILS, não por URL secreto.
router.get('/verification-admin/list', verificationAdmin.list);
router.get('/verification-admin/doc', verificationAdmin.docUrl);
router.post('/verification-admin/decision', verificationAdmin.decision);
router.post('/newsletter', newsletter);
router.post('/report-listing', reportListing);
router.get('/report-listing-status', reportListingStatus);
router.post('/report-user', reportUser);
router.get('/report-user-status', reportUserStatus);
router.post('/feedback', feedback);
router.post('/recompute-listing-rating', recomputeListingRating);
router.get('/pwa-counter', pwaCounter.get);
router.post('/pwa-counter/increment', pwaCounter.increment);
router.post('/waitlist', waitlist);
router.get('/host-stats', hostStats);
router.post('/listing-like', listingLike);
router.post('/dismiss-favorite-alerts', dismissFavoriteAlerts);
router.post('/user-follow', userFollow);
router.post('/dismiss-follow-alerts', dismissFollowAlerts);
router.post('/dismiss-extra-alert', dismissExtraAlert);
router.post('/translate', translate);
router.post('/listing-views', listingViews.record);
router.get('/listing-views', listingViews.getAll);
router.get('/listing-views/:id', listingViews.get);
router.post('/listing-views/:id/reset', listingViews.reset);
router.get('/approve-destaque', approveDestaque);
router.get('/approve-listing', approveListing);
router.post('/profile-metadata', profileMetadata);

// Create user with identity provider (e.g. Facebook or Google)
// This endpoint is called to create a new user after user has confirmed
// they want to continue with the data fetched from IdP (e.g. name and email)
router.post('/auth/create-user-with-idp', createUserWithIdp);

// Facebook authentication endpoints

// This endpoint is called when user wants to initiate authenticaiton with Facebook
router.get('/auth/facebook', authenticateFacebook);

// This is the route for callback URL the user is redirected after authenticating
// with Facebook. In this route a Passport.js custom callback is used for calling
// loginWithIdp endpoint in Sharetribe Auth API to authenticate user to the marketplace
router.get('/auth/facebook/callback', authenticateFacebookCallback);

// Google authentication endpoints

// This endpoint is called when user wants to initiate authenticaiton with Google
router.get('/auth/google', authenticateGoogle);

// This is the route for callback URL the user is redirected after authenticating
// with Google. In this route a Passport.js custom callback is used for calling
// loginWithIdp endpoint in Sharetribe Auth API to authenticate user to the marketplace
router.get('/auth/google/callback', authenticateGoogleCallback);

module.exports = router;
