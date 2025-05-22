// app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.8.0/firebase-auth.js";

import { renderLogin } from './components/login.js';
import { renderRegister } from './components/register.js';
import { renderHome } from './components/home.js';

// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyA5U99_1Y2P52PTd6m5e1bf42ZLPh7KgS8",
  authDomain: "iuserprojeto.firebaseapp.com",
  projectId: "iuserprojeto",
  storageBucket: "iuserprojeto.appspot.com",
  messagingSenderId: "514966603347",
  appId: "1:514966603347:web:146c95a4ae6ce893ae68a6",
  measurementId: "G-K9CMFYP42L"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);


// Navegação simples (SPA)
export function navigateTo(screen) {
  switch (screen) {
    case 'login':
      renderLogin();
      break;
    case 'register':
      renderRegister();
      break;
    case 'home':
      renderHome();
      break;
    default:
      renderLogin();
  }
}

// Inicia a tela correta
onAuthStateChanged(auth, (user) => {
  if (user) {
    navigateTo('home');
  } else {
    navigateTo('login');
  }
});
