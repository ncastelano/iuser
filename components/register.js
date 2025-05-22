// components/register.js
import {
  getAuth,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/11.8.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  setDoc
} from "https://www.gstatic.com/firebasejs/11.8.0/firebase-firestore.js";

import { navigateTo } from "../app.js";

export function renderRegister() {
  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="login-container">
      <h2>Criar Conta</h2>
      <form id="register-form" autocomplete="off">
        <input type="text" id="name" placeholder="Nome" required />
        <input type="email" id="email" placeholder="Email" required />
        <input type="password" id="password" placeholder="Senha" required />
        <input type="url" id="image" placeholder="URL da imagem (opcional)" />
        <button type="submit">Registrar</button>
      </form>
      <p id="register-error" class="error-message"></p>
      <p>Já tem conta? <a href="#" id="go-login">Entrar</a></p>

    </div>
  `;

  const form = document.getElementById("register-form");
  const errorEl = document.getElementById("register-error");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = form.name.value.trim();
    const email = form.email.value.trim();
    const password = form.password.value.trim();
    const image = form.image.value.trim();

    if (!name || !email || !password) {
      errorEl.textContent = "Preencha todos os campos obrigatórios.";
      return;
    }

    try {
      const auth = getAuth();
      const db = getFirestore();

      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Salva dados no Firestore
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        name,
        email,
        image: image || ""
      });

      console.log("Registro realizado com sucesso:", user);
      navigateTo("home");

    } catch (error) {
      console.error("Erro ao registrar:", error.message);
      errorEl.textContent = "Erro ao registrar: " + error.message;
    }
  });

  document.getElementById("go-login").addEventListener("click", (e) => {
  e.preventDefault();
  navigateTo('login');
});


}
