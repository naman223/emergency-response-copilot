import { initializeApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  signInAnonymously,
  signOut,
} from "firebase/auth";
const local = import.meta.env.VITE_USE_EMULATORS === "true";
const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "demo-key",
  projectId:
    import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "demo-emergency-copilot",
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ??
    "demo-emergency-copilot.firebaseapp.com",
});
export const auth = getAuth(app);
if (local)
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
export async function ensureUser() {
  await auth.authStateReady();
  if (!auth.currentUser) await signInAnonymously(auth);
  return auth.currentUser!;
}
export async function clearUser() {
  await signOut(auth);
}
