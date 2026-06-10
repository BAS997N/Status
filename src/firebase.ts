import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import firebaseConfig from "./firebase-applet-config.json";

// Check if Firebase is provisioned with real credentials (not placeholders)
export const isFirebaseActive = 
  firebaseConfig && 
  firebaseConfig.apiKey && 
  firebaseConfig.apiKey !== "PLACEHOLDER" && 
  firebaseConfig.projectId !== "PLACEHOLDER";

let firebaseApp;
let firestoreDb: any = null;
let firebaseAuth: any = null;

if (isFirebaseActive) {
  try {
    firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    firestoreDb = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
    firebaseAuth = getAuth(firebaseApp);
    console.log("Firebase initialized successfully with project ID:", firebaseConfig.projectId);
  } catch (error) {
    console.error("Failed to initialize Firebase with configured credentials:", error);
  }
} else {
  console.log("Using IDF Attendance Simulation Mode (Firebase project not fully configured yet).");
}

export const db = firestoreDb;
export const auth = firebaseAuth;
