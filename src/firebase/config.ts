// ┌──────────────────────────────────────────────────────────────────────────┐
// │  FIREBASE WEB CONFIG                                                     │
// │  This is the only place the Firebase project configuration lives.        │
// │  The web config is public by design (it identifies the project; access   │
// │  is governed by the security rules in firestore.rules and                │
// │  database.rules.json). Never put service-account keys or secrets here.   │
// └──────────────────────────────────────────────────────────────────────────┘
export const firebaseConfig = {
  apiKey: 'REPLACE_ME',
  authDomain: 'REPLACE_ME.firebaseapp.com',
  databaseURL: 'https://REPLACE_ME-default-rtdb.firebaseio.com',
  projectId: 'REPLACE_ME',
  storageBucket: 'REPLACE_ME.firebasestorage.app',
  messagingSenderId: 'REPLACE_ME',
  appId: 'REPLACE_ME',
};

/** When true the client talks to the local Firebase Emulator Suite instead of production. */
export const USE_EMULATORS = import.meta.env.VITE_USE_EMULATORS === '1';
