// import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import firebaseConfig from "./firebase-applet-config.json";

export const firebaseState = {
  isActive:
    firebaseConfig &&
    firebaseConfig.apiKey &&
    firebaseConfig.apiKey !== "PLACEHOLDER" &&
    firebaseConfig.projectId !== "PLACEHOLDER" &&
    !firebaseConfig.projectId.includes("remixed")
};

let firebaseApp: any = null;
let secondaryFirebaseApp: any = null;
let firestoreDb: any = null;
let firebaseAuth: any = null;
let secondaryFirebaseAuth: any = null;

if (firebaseState.isActive) {
  try {
    firebaseApp = getApps().find((app) => app.name === "[DEFAULT]")
      ? getApp()
      : initializeApp(firebaseConfig);

    secondaryFirebaseApp = getApps().find((app) => app.name === "Secondary");

    if (!secondaryFirebaseApp) {
      secondaryFirebaseApp = initializeApp(firebaseConfig, "Secondary");
    }

    firestoreDb = getFirestore(firebaseApp);
    firebaseAuth = getAuth(firebaseApp);
    secondaryFirebaseAuth = getAuth(secondaryFirebaseApp);

   
  } catch (error) {
    console.error(
      "Failed to initialize Firebase with configured credentials, falling back to simulation mode:",
      error
    );
    firebaseState.isActive = false;
  }
} else {
 
}

export const db = firestoreDb;
export const auth = firebaseAuth;
export const secondaryAuth = secondaryFirebaseAuth;
export const isFirebaseActive = () => firebaseState.isActive;
