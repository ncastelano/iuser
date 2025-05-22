// components/login.js
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.8.0/firebase-auth.js";
import { navigateTo } from '../app.js';

export function renderLogin() {
  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="login-container">
      <h2>Login</h2>
      <form id="login-form" autocomplete="off">
        <input type="email" id="email" placeholder="Email" required />
        <input type="password" id="password" placeholder="Senha" required />
        <button type="submit">Entrar</button>
      </form>
      <p id="login-error" class="error-message"></p>
      <p class="redirect-text">Não tem conta? <a href="#" id="go-register">Registrar</a></p>
    </div>
  `;

  const form = document.getElementById("login-form");
  const errorEl = document.getElementById("login-error");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = form.email.value.trim();
    const password = form.password.value.trim();

    if (!email || !password) {
      errorEl.textContent = "Preencha todos os campos.";
      return;
    }

    try {
      const auth = getAuth();
      const userCredential = await signInWithEmailAndPassword(auth, email, password);

      console.log("Login bem-sucedido:", userCredential.user);
      errorEl.textContent = "";
      navigateTo('home');

    } catch (error) {
      console.error("Erro ao fazer login:", error.message);
      errorEl.textContent = "Email ou senha inválidos.";
    }
  });

  document.getElementById("go-register").addEventListener("click", (e) => {
    e.preventDefault();
    navigateTo('register');
  });
}
