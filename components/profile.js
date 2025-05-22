// components/profile.js
import { navigateTo } from "../app.js";

export function renderProfile(userData) {
  const app = document.getElementById("app");
  app.innerHTML = ""; // Limpa a tela

  const profileContainer = document.createElement("div");
  profileContainer.className = "profile-container";

  profileContainer.innerHTML = `
    <h2>Perfil do Usuário</h2>
    <div class="profile-info">
      <img src="${userData.image || "https://via.placeholder.com/100"}" alt="Foto de perfil" />
      <p><strong>Nome:</strong> ${userData.name || "Sem nome"}</p>
      <p><strong>Email:</strong> ${userData.email || "Sem email"}</p>
      <p><strong>UID:</strong> ${userData.uid || "Sem UID"}</p>
    </div>
    <button id="back-button">Voltar</button>
  `;

  app.appendChild(profileContainer);

  document.getElementById("back-button").addEventListener("click", () => {
    navigateTo("home");
  });
}
