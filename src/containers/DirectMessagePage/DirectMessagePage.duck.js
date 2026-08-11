import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { storableError } from '../../util/errors';
import { addMarketplaceEntities } from '../../ducks/marketplaceData.duck';
import { denormalisedResponseEntities } from '../../util/data';
import { types as sdkTypes } from '../../util/sdkLoader';

const { UUID } = sdkTypes;

// ── Slice ───────────────────────────────────────────────
const slice = createSlice({
  name: 'DirectMessagePage',
  initialState: {
    otherUserId: null,
    transactionId: null,
    transactionLastTransitionedAt: null,
    allTransactionIds: [],
    messages: [],
    fetchInProgress: false,
    fetchError: null,
    sendInProgress: false,
    sendError: null,
    pollInProgress: false,
  },
  reducers: {
    setTransactionId: (state, action) => {
      state.transactionId = action.payload;
    },
    setMessages: (state, action) => {
      state.messages = action.payload;
      state.pollInProgress = false;
    },
    setPollInProgress: state => {
      state.pollInProgress = true;
    },
    setSendInProgress: (state, action) => {
      state.sendInProgress = action.payload;
    },
    setSendError: (state, action) => {
      state.sendError = action.payload;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(loadDataThunk.pending, (state, action) => {
        const newOtherUserId = action.meta?.arg?.params?.id;
        state.fetchInProgress = true;
        state.fetchError = null;
        state.sendError = null;
        // Only wipe the conversation when switching to a different user.
        // Re-entering the same DM should keep the messages visible while
        // the refetch runs, preventing a spinner flash on fast navigation.
        if (newOtherUserId !== state.otherUserId) {
          state.transactionId = null;
          state.allTransactionIds = [];
          state.messages = [];
        }
      })
      .addCase(loadDataThunk.fulfilled, (state, action) => {
        state.fetchInProgress = false;
        state.otherUserId = action.payload.otherUserId;
        state.transactionId = action.payload.transactionId;
        state.transactionLastTransitionedAt = action.payload.transactionLastTransitionedAt;
        state.allTransactionIds = action.payload.allTransactionIds || [];
        state.messages = action.payload.messages;
      })
      .addCase(loadDataThunk.rejected, (state, action) => {
        state.fetchInProgress = false;
        state.fetchError = action.payload;
      });
  },
});

export const {
  setTransactionId,
  setMessages,
  setPollInProgress,
  setSendInProgress,
  setSendError,
} = slice.actions;

export default slice.reducer;

// ── Selectors ────────────────────────────────────────────
export const selectDMTransactionId = state => state.DirectMessagePage?.transactionId;
export const selectDMAllTransactionIds = state => state.DirectMessagePage?.allTransactionIds || [];
export const selectDMLastTransitionedAt = state => state.DirectMessagePage?.transactionLastTransitionedAt;
export const selectDMMessages = state => state.DirectMessagePage?.messages || [];
export const selectDMOtherUserId = state => state.DirectMessagePage?.otherUserId;
export const selectDMFetchInProgress = state => state.DirectMessagePage?.fetchInProgress;
export const selectDMSendInProgress = state => state.DirectMessagePage?.sendInProgress;
export const selectDMSendError = state => state.DirectMessagePage?.sendError;
export const selectDMPollInProgress = state => state.DirectMessagePage?.pollInProgress;

// ── Helper: extract messages from SDK response ───────────
const extractMessages = response => {
  try {
    const msgs = denormalisedResponseEntities(response);
    return [...msgs].sort(
      (a, b) => new Date(a.attributes?.createdAt) - new Date(b.attributes?.createdAt)
    );
  } catch {
    return [];
  }
};

// ── Helper: find existing conversation with target user ──
//
// Procura em todos os processos, e não só em default-inquiry. Uma consulta
// enviada a partir da página do anúncio é criada no processo do próprio anúncio
// — default-booking, tipicamente — com a transição "inquire". Ao filtrar por
// default-inquiry, esta página não encontrava essas conversas e mostrava
// "Início da conversa" a quem já tinha trocado mensagens.
//
// As mensagens são as mesmas em qualquer dos casos: vivem na transação. O que
// muda é o processo em que a transação foi criada, o que aqui não interessa.
const findExistingTx = async (sdk, otherUserId) => {
  const commonParams = {
    include: ['provider', 'customer'],
    'fields.transaction': ['processName', 'lastTransition', 'lastTransitionedAt'],
    'fields.user': ['profile.displayName'],
    perPage: 50,
  };

  const [ordersResp, salesResp] = await Promise.all([
    sdk.transactions.query({ ...commonParams, only: 'order' }).catch(() => null),
    sdk.transactions.query({ ...commonParams, only: 'sale' }).catch(() => null),
  ]);

  const orders = (ordersResp?.data?.data || []).filter(
    tx => tx.relationships?.provider?.data?.id?.uuid === otherUserId
  );
  const sales = (salesResp?.data?.data || []).filter(
    tx => tx.relationships?.customer?.data?.id?.uuid === otherUserId
  );

  const all = [...orders, ...sales];
  all.sort(
    (a, b) =>
      new Date(b.attributes?.lastTransitionedAt) - new Date(a.attributes?.lastTransitionedAt)
  );

  const tx = all[0] || null;
  const allIds = all.map(t => t.id.uuid);
  return tx
    ? { id: tx.id.uuid, lastTransitionedAt: tx.attributes?.lastTransitionedAt, allIds }
    : null;
};

// ── loadData ─────────────────────────────────────────────
const loadDataPayloadCreator = async (
  { params },
  { dispatch, rejectWithValue, extra: sdk }
) => {
  const { id: otherUserId } = params;

  try {
    // Fetch the other user's profile
    const userResp = await sdk.users
      .show({
        id: new UUID(otherUserId),
        include: ['profileImage'],
        'fields.image': ['variants.square-small', 'variants.square-small2x'],
        'fields.user': [
          'profile.displayName',
          'profile.abbreviatedName',
          'profile.publicData',
          'deleted',
          'banned',
        ],
      });
    dispatch(addMarketplaceEntities(userResp));

    // Look for an existing inquiry transaction with this user
    const txInfo = await findExistingTx(sdk, otherUserId);
    const transactionId = txInfo?.id || null;
    const transactionLastTransitionedAt = txInfo?.lastTransitionedAt || null;
    const allTransactionIds = txInfo?.allIds || [];

    let messages = [];
    if (transactionId) {
      const msgResp = await sdk.messages.query({
        transaction_id: new UUID(transactionId),
        include: ['sender', 'sender.profileImage'],
        'fields.user': ['profile.displayName', 'profile.abbreviatedName'],
        'fields.image': ['variants.square-small', 'variants.square-small2x'],
        perPage: 100,
      }).catch(() => null);

      if (msgResp) {
        messages = extractMessages(msgResp);
      }
    }

    return {
      otherUserId,
      transactionId,
      transactionLastTransitionedAt,
      allTransactionIds,
      messages,
    };
  } catch (e) {
    return rejectWithValue(storableError(e));
  }
};

export const loadDataThunk = createAsyncThunk('DirectMessagePage/loadData', loadDataPayloadCreator);

export const loadData = (params, search) => dispatch =>
  dispatch(loadDataThunk({ params, search }));

// ── pollMessages ─────────────────────────────────────────
export const pollMessages = transactionId => async (dispatch, getState, sdk) => {
  if (!transactionId) return;
  dispatch(setPollInProgress());
  try {
    const resp = await sdk.messages.query({
      transaction_id: new UUID(transactionId),
      include: ['sender', 'sender.profileImage'],
      'fields.user': ['profile.displayName', 'profile.abbreviatedName'],
      'fields.image': ['variants.square-small', 'variants.square-small2x'],
      perPage: 100,
    });
    dispatch(setMessages(extractMessages(resp)));
  } catch {
    dispatch(setMessages(getState().DirectMessagePage?.messages || []));
  }
};

// ── sendMessage ───────────────────────────────────────────
// Creates the inquiry transaction on first message if needed,
// then sends the message and refreshes the list.
export const sendMessage = ({ content, otherUserId }) =>
  async (dispatch, getState, sdk) => {
    dispatch(setSendInProgress(true));
    dispatch(setSendError(null));

    try {
      let txId = getState().DirectMessagePage?.transactionId;

      // No existing transaction → create one via inquiry
      if (!txId) {
        // Get a listing from the target user
        const listingsResp = await sdk.listings.query({
          authorId: new UUID(otherUserId),
          perPage: 1,
          'fields.listing': ['title'],
        });

        const listings = listingsResp?.data?.data || [];
        if (listings.length === 0) {
          dispatch(
            setSendError('Este utilizador não tem anúncios. Não é possível iniciar conversa.')
          );
          dispatch(setSendInProgress(false));
          return;
        }

        const listingId = listings[0].id.uuid;

        const txResp = await sdk.transactions.initiate({
          processAlias: 'default-inquiry/release-1',
          transition: 'transition/inquire-without-payment',
          params: { listingId: new UUID(listingId) },
        });

        txId = txResp.data?.data?.id?.uuid;
        if (!txId) throw new Error('Transaction creation failed');

        dispatch(setTransactionId(txId));
      }

      // Send the message
      await sdk.messages.send({ transactionId: new UUID(txId), content });

      // Refresh messages
      const msgResp = await sdk.messages.query({
        transaction_id: new UUID(txId),
        include: ['sender', 'sender.profileImage'],
        'fields.user': ['profile.displayName', 'profile.abbreviatedName'],
        'fields.image': ['variants.square-small', 'variants.square-small2x'],
        perPage: 100,
      });
      const refreshedMessages = extractMessages(msgResp);
      dispatch(setMessages(refreshedMessages));
      dispatch(setSendInProgress(false));

      // Same response-time tracking the TransactionPage does — measure how
      // long the user took to reply to the latest incoming message and fold
      // it into the running average on the user's publicData. Best-effort,
      // never blocks the send flow.
      try {
        const { trackReplyTime } = require('../../util/responseTime');
        const currentUser = getState().user?.currentUser;
        trackReplyTime({ sdk, messages: refreshedMessages, currentUser });
      } catch (_) {
        /* ignored */
      }
    } catch (e) {
      dispatch(setSendError('Erro ao enviar mensagem. Tenta novamente.'));
      dispatch(setSendInProgress(false));
    }
  };

// ── sendImage ────────────────────────────────────────────
// Uploads one or more images to Sharetribe, then sends a message per image
// whose content is a marker [image:URL] that the chat UI renders as <img>.
// If `caption` is provided, sends an additional text message after the images.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGES_PER_BATCH = 6;

export const sendImage = ({ file, files, caption, otherUserId }) =>
  async (dispatch, getState, sdk) => {
    // Normalize to array
    const rawList = Array.isArray(files) ? files : file ? [file] : [];
    if (rawList.length === 0) return;
    if (rawList.length > MAX_IMAGES_PER_BATCH) {
      dispatch(setSendError(`Só podes enviar até ${MAX_IMAGES_PER_BATCH} imagens de cada vez.`));
      return;
    }
    for (const f of rawList) {
      if (!f.type?.startsWith('image/')) {
        dispatch(setSendError('Apenas ficheiros de imagem são suportados.'));
        return;
      }
      if (f.size > MAX_IMAGE_BYTES) {
        dispatch(setSendError('Imagem demasiado grande (máx 10MB).'));
        return;
      }
    }

    dispatch(setSendInProgress(true));
    dispatch(setSendError(null));

    try {
      let txId = getState().DirectMessagePage?.transactionId;

      if (!txId) {
        const listingsResp = await sdk.listings.query({
          authorId: new UUID(otherUserId),
          perPage: 1,
          'fields.listing': ['title'],
        });

        const listings = listingsResp?.data?.data || [];
        if (listings.length === 0) {
          dispatch(
            setSendError('Este utilizador não tem anúncios. Não é possível iniciar conversa.')
          );
          dispatch(setSendInProgress(false));
          return;
        }

        const listingId = listings[0].id.uuid;

        const txResp = await sdk.transactions.initiate({
          processAlias: 'default-inquiry/release-1',
          transition: 'transition/inquire-without-payment',
          params: { listingId: new UUID(listingId) },
        });

        txId = txResp.data?.data?.id?.uuid;
        if (!txId) throw new Error('Transaction creation failed');

        dispatch(setTransactionId(txId));
      }

      // Upload all images in parallel
      const uploadResps = await Promise.all(
        rawList.map(f =>
          sdk.images.upload(
            { image: f },
            {
              expand: true,
              'fields.image': ['variants.scaled-medium', 'variants.scaled-large'],
            }
          )
        )
      );

      const urls = uploadResps.map(resp => {
        const variants = resp?.data?.data?.attributes?.variants || {};
        return variants['scaled-medium']?.url || variants['scaled-large']?.url || null;
      });

      if (urls.some(u => !u)) {
        throw new Error('Upload did not return a usable image URL');
      }

      // Build a single message in an email-friendly format:
      //   📷
      //   URL1
      //   URL2
      //
      //   caption (optional)
      // Each URL on its own line so email clients render them as separate
      // clickable links. The parser detects "📷" + sharetribe URLs.
      const trimmedCaption = (caption || '').trim();
      // Blank line between each URL so email clients render them as separate
      // visual blocks (instead of glued together).
      const urlBlock = urls.join('\n\n');
      const content = trimmedCaption
        ? `📷\n\n${urlBlock}\n\n${trimmedCaption}`
        : `📷\n\n${urlBlock}`;
      await sdk.messages.send({ transactionId: new UUID(txId), content });

      const msgResp = await sdk.messages.query({
        transaction_id: new UUID(txId),
        include: ['sender', 'sender.profileImage'],
        'fields.user': ['profile.displayName', 'profile.abbreviatedName'],
        'fields.image': ['variants.square-small', 'variants.square-small2x'],
        perPage: 100,
      });
      dispatch(setMessages(extractMessages(msgResp)));
      dispatch(setSendInProgress(false));
    } catch (e) {
      dispatch(setSendError('Erro ao enviar imagem. Tenta novamente.'));
      dispatch(setSendInProgress(false));
    }
  };
