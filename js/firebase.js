// Firebase SDK (modular, via CDN).
// Force robust long-polling transport to avoid 'Listen 400' issues behind proxies/VPNs.
import { FIREBASE_CONFIG } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  initializeFirestore, // allows transport options
  doc, getDoc, setDoc, addDoc, collection, serverTimestamp,
  query, orderBy, getDocs, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

export const IS_CONFIGURED = !!FIREBASE_CONFIG?.apiKey;

export const app = initializeApp(FIREBASE_CONFIG);

// Hard-force long polling to eliminate streaming attempts that often cause
// 400 spam and multi-second fallbacks. If you prefer auto detection, change
// experimentalForceLongPolling -> false and set experimentalAutoDetectLongPolling -> true.
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  experimentalAutoDetectLongPolling: false,
  // experimentalLongPollingOptions: { timeoutSeconds: 30 },
  ignoreUndefinedProperties: true
});

export const auth = getAuth(app);

export {
  GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut,
  doc, getDoc, setDoc, addDoc, collection, serverTimestamp, query, orderBy, getDocs, runTransaction
};
