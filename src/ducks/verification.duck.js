import { createSlice } from '@reduxjs/toolkit';

/**
 * Anunciante document verification, client side.
 *
 * The document list is never hardcoded here: the server owns it and returns it
 * with the status, so adding or removing a required document needs no frontend
 * change. `required: false` means this account type has nothing to submit.
 */

const initialState = {
  fetched: false,
  loading: false,
  required: false,
  status: null, // 'nao_iniciado' | 'pendente' | 'aprovado' | 'recusado'
  docs: [],
  // Formatos e tamanho aceites, vindos do servidor para nao divergirem do que
  // o upload valida de facto. Null ate a primeira resposta chegar.
  limits: null,
  uploadingDocKey: null,
  uploadError: null,
};

const slice = createSlice({
  name: 'verification',
  initialState,
  reducers: {
    statusRequested: state => {
      state.loading = true;
    },
    statusReceived: (state, action) => {
      state.loading = false;
      state.fetched = true;
      state.required = !!action.payload.required;
      state.status = action.payload.status || null;
      state.docs = action.payload.docs || [];
      state.limits = action.payload.limits || state.limits;
    },
    statusFailed: state => {
      state.loading = false;
      state.fetched = true;
    },
    uploadStarted: (state, action) => {
      state.uploadingDocKey = action.payload;
      state.uploadError = null;
    },
    uploadSucceeded: (state, action) => {
      state.uploadingDocKey = null;
      state.status = action.payload.status || state.status;
      state.docs = action.payload.docs || state.docs;
    },
    uploadFailed: (state, action) => {
      state.uploadingDocKey = null;
      state.uploadError = action.payload || 'upload-failed';
    },
  },
});

export const {
  statusRequested,
  statusReceived,
  statusFailed,
  uploadStarted,
  uploadSucceeded,
  uploadFailed,
} = slice.actions;

export default slice.reducer;

// ================ Selectors ================ //

export const selectVerification = state => state.verification;

/** True when this user has documents outstanding and should be nudged. */
export const selectNeedsAttention = state => {
  const v = state.verification;
  return v.required && (v.status === 'nao_iniciado' || v.status === 'recusado');
};

// ================ Thunks ================ //

/**
 * Read the current status. Safe to call on every page — the server skips its
 * own writes when nothing changed.
 */
export const fetchVerificationStatus = () => async dispatch => {
  dispatch(statusRequested());
  try {
    const response = await fetch('/api/verification', { credentials: 'include' });
    if (!response.ok) throw new Error('status-failed');
    const data = await response.json();
    dispatch(statusReceived(data));
    return data;
  } catch (e) {
    dispatch(statusFailed());
    return null;
  }
};

// The server enforces this too; checking here just avoids a pointless upload.
const MAX_BYTES = 8 * 1024 * 1024;

const readAsBase64 = file =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read-failed'));
    reader.onload = () => {
      const result = String(reader.result || '');
      // strip the "data:<mime>;base64," prefix
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });

/**
 * Submit one document.
 *
 * @param {string} docKey which document this is
 * @param {File} file
 */
export const uploadVerificationDoc = (docKey, file) => async dispatch => {
  if (!file) return null;
  if (file.size > MAX_BYTES) {
    dispatch(uploadFailed('too-large'));
    return null;
  }

  dispatch(uploadStarted(docKey));
  try {
    const data = await readAsBase64(file);
    const response = await fetch('/api/verification/upload', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docKey, filename: file.name, contentType: file.type, data }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      dispatch(uploadFailed(payload.error || 'upload-failed'));
      return null;
    }
    dispatch(uploadSucceeded(payload));
    return payload;
  } catch (e) {
    dispatch(uploadFailed('upload-failed'));
    return null;
  }
};
