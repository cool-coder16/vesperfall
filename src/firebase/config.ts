// ┌──────────────────────────────────────────────────────────────────────────┐
// │  FIREBASE WEB CONFIG                                                     │
// │  This is the only place the Firebase project configuration lives.        │
// │  The web config is public by design (it identifies the project; access   │
// │  is governed by the security rules in firestore.rules and                │
// │  database.rules.json). Never put service-account keys or secrets here.   │
// └──────────────────────────────────────────────────────────────────────────┘
const firebaseConfig = {
  apiKey: "AIzaSyBEj2ZhlD6ScCOZ-iS1xFVy_El2kT5lTEk",
  authDomain: "vesperfall-9b23c.firebaseapp.com",
  projectId: "vesperfall-9b23c",
  storageBucket: "vesperfall-9b23c.firebasestorage.app",
  messagingSenderId: "541760948640",
  appId: "1:541760948640:web:449ff8acc5b5655713bcc5",
  measurementId: "G-ENVNDLG2F9"
};

/** When true the client talks to the local Firebase Emulator Suite instead of production. */
export const USE_EMULATORS = import.meta.env.VITE_USE_EMULATORS === '1';
