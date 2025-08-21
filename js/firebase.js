// Firebase SDK (modular, via CDN).
// You must create js/firebase-config.js that exports FIREBASE_CONFIG.
import { FIREBASE_CONFIG } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, addDoc, collection, serverTimestamp,
  query, orderBy, getDocs, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

export const app = initializeApp(FIREBASE_CONFIG);
export const db = getFirestore(app);
export const auth = getAuth(app);
export { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, doc, getDoc, setDoc, addDoc, collection, serverTimestamp, query, orderBy, getDocs, runTransaction };
