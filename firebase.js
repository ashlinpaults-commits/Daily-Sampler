import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBMq_VYAsKUp4uR_9KuvScDA-AUZCsBm34",
  authDomain: "daily-sampler.firebaseapp.com",
  projectId: "daily-sampler",
  storageBucket: "daily-sampler.firebasestorage.app",
  messagingSenderId: "939377250067",
  appId: "1:939377250067:web:e24e91bca8d326d3ba14e6"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);