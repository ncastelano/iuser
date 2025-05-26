import { navigateTo } from "../app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.8.0/firebase-firestore.js";
import { slugifyName } from "../utils/slugify.js";


export async function renderProfileFromSlug(slug) {
  const app = document.getElementById("app");
  app.innerHTML = "<p>Carregando perfil...</p>";

  const db = getFirestore();
  const usersSnapshot = await getDocs(collection(db, "users"));

  let foundUser = null;

  for (const doc of usersSnapshot.docs) {
    const user = doc.data();
    if (!user.name) continue; // garante que existe name
    if (slugifyName(user.name) === slug) {
      foundUser = user;
      break; // para de buscar após encontrar
    }
  }

  if (!foundUser) {
    app.innerHTML = "<p>Usuário não encontrado.</p>";
    return;
  }

  const profileContainer = document.createElement("div");
  profileContainer.className = "profile-container";

  profileContainer.innerHTML = `
    <h2>Perfil do Usuário</h2>
    <div class="profile-info">
      <img src="${foundUser.image || "https://via.placeholder.com/100"}" alt="Foto de perfil" />
      <p><strong>Nome:</strong> ${foundUser.name}</p>
      <p><strong>Email:</strong> ${foundUser.email}</p>
    </div>
    <button id="back-button">Voltar</button>
  `;

  app.innerHTML = ""; // limpa o loading
  app.appendChild(profileContainer);

  document.getElementById("back-button").addEventListener("click", () => {
    navigateTo("home");
  });
}
