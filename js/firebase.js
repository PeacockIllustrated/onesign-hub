// Firebase SDK (modular, via CDN).
// Uses FIREBASE_CONFIG from ./firebase-config.js and forces a network mode that
// works behind proxies/VPNs/ad-blockers that break Firestore streaming.
import { FIREBASE_CONFIG } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  initializeFirestore, // NOTE: use initializeFirestore to pass transport options
  doc, getDoc, setDoc, addDoc, collection, serverTimestamp,
  query, orderBy, getDocs, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

export const IS_CONFIGURED = !!FIREBASE_CONFIG?.apiKey;

// Initialize core app
export const app = initializeApp(FIREBASE_CONFIG);

// Initialize Firestore with robust transport settings.
// experimentalAutoDetectLongPolling: true -> avoids the 'Listen' 400 spam behind some proxies/CDNs.
// You can switch to experimentalForceLongPolling: true if your environment still blocks streams.
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  // experimentalForceLongPolling: true, // <- uncomment to hard-force long polling
  // experimentalLongPollingOptions: { timeoutSeconds: 30 } // optional tweak
});

// Auth (kept minimal; you can wire Google sign-in later)
export const auth = getAuth(app);

// Re-export helpers for the rest of the app
export {
  GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut,
  doc, getDoc, setDoc, addDoc, collection, serverTimestamp, query, orderBy, getDocs, runTransaction
};
