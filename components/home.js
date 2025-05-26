import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/11.8.0/firebase-auth.js";
import { navigateTo } from "../app.js";
import { renderMyAvatar } from "./myAvatar.js";
import { renderAllUsers } from "./allUsers.js";

export function renderHome() {
  const app = document.getElementById("app");
  app.innerHTML = "";

  const navbar = document.createElement("div");
  navbar.style.display = "flex";
  navbar.style.justifyContent = "space-between";
  navbar.style.alignItems = "center";
  navbar.style.backgroundColor = "#333";
  navbar.style.color = "#fff";
  navbar.style.padding = "10px 20px";
  navbar.style.position = "fixed";
  navbar.style.top = "0";
  navbar.style.left = "0";
  navbar.style.right = "0";
  navbar.style.zIndex = "1000";

  navbar.innerHTML = `
    <div>
      <button id="nav-avatar" style="margin-right: 10px;">👤 Meu Perfil</button>
      <button id="nav-users">🧑‍🤝‍🧑 Todos Usuários</button>
    </div>
    <button id="logout-button" style="background:#e74c3c; color:#fff; border:none; padding:6px 12px; border-radius:4px; cursor:pointer;">Sair</button>
  `;

  const content = document.createElement("div");
  content.id = "home-content";
  content.style.marginTop = "60px"; // espaço para a navbar

  app.appendChild(navbar);
  app.appendChild(content);

  // Eventos
  document.getElementById("nav-avatar").addEventListener("click", () => {
    renderMyAvatar(content);
  });

  document.getElementById("nav-users").addEventListener("click", () => {
    renderAllUsers(content);
  });

  document.getElementById("logout-button").addEventListener("click", async () => {
    const auth = getAuth();
    await signOut(auth);
    navigateTo("login");
  });

  // Mostra perfil por padrão
  renderMyAvatar(content);
}
