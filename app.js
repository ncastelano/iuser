// app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.8.0/firebase-auth.js";

import { renderLogin } from './components/login.js';
import { renderRegister } from './components/register.js';
import { renderHome } from './components/home.js';
import { renderProfileFromSlug } from './components/profile.js'; // ✅ IMPORTA aqui!

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

// ✅ Navegação por hash
export function navigateTo(route) {
  window.location.hash = route;
}

window.addEventListener("hashchange", handleRoute);
window.addEventListener("load", handleRoute);

// ✅ Define o roteamento
function handleRoute() {
  const hash = decodeURIComponent(window.location.hash.slice(1)); // remove #

  // 🔍 Se não for rota padrão, tenta achar perfil por nome (slug)
  if (hash && !["login", "register", "home"].includes(hash)) {
    renderProfileFromSlug(hash); // busca no Firestore por nome
    return;
  }

  // Rotas padrão
  switch (hash) {
    case "":
    case "login":
      renderLogin();
      break;
    case "register":
      renderRegister();
      break;
    case "home":
      renderHome();
      break;
    default:
      document.getElementById("app").innerHTML = "<h2>Página não encontrada</h2>";
  }
}
