import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.8.0/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.8.0/firebase-firestore.js";
import { navigateTo } from "../app.js";
import { renderProfile } from "./profile.js"; // ✅ Importa função de perfil

export async function renderHome() {
  const app = document.getElementById("app");
  app.innerHTML = ""; // Limpa antes de montar tudo

  const db = getFirestore();

  // 🔄 Container da galeria horizontal
  const galleryContainer = document.createElement("div");
  galleryContainer.style.display = "flex";
  galleryContainer.style.overflowX = "auto";
  galleryContainer.style.gap = "16px";
  galleryContainer.style.padding = "20px";
  galleryContainer.style.marginBottom = "20px";

  try {
    const querySnapshot = await getDocs(collection(db, "users"));
    querySnapshot.forEach((docSnap) => {
      const user = docSnap.data();

      const userCard = document.createElement("div");
      userCard.style.display = "flex";
      userCard.style.flexDirection = "column";
      userCard.style.alignItems = "center";
      userCard.style.minWidth = "80px";
      userCard.style.cursor = "pointer"; // ✅ Adicionado para indicar que é clicável

      const img = document.createElement("img");
      img.src = user.image || "https://via.placeholder.com/80";
      img.alt = user.email || "Usuário";
      img.style.width = "80px";
      img.style.height = "80px";
      img.style.borderRadius = "50%";
      img.style.objectFit = "cover";

      const email = document.createElement("span");
      email.textContent = user.email || "Sem email";
      email.style.fontSize = "0.75em";
      email.style.marginTop = "6px";
      email.style.textAlign = "center";

      // ✅ Ação ao clicar no usuário → renderProfile
      userCard.addEventListener("click", () => {
        renderProfile({
          name: user.name,
          email: user.email,
          uid: user.uid,
          image: user.image,
        });
      });

      userCard.appendChild(img);
      userCard.appendChild(email);
      galleryContainer.appendChild(userCard);
    });
  } catch (error) {
    console.error("Erro ao carregar usuários:", error);
  }

  const profileContainer = document.createElement("div");
  profileContainer.className = "profile-container";
  profileContainer.style.position = "fixed";      // fixa no topo
  profileContainer.style.top = "0";
  profileContainer.style.left = "0";
  profileContainer.style.right = "0";
  profileContainer.style.height = "200px";         // altura da barra
  profileContainer.style.backgroundColor = "#333"; // cor de fundo (pode mudar)
  profileContainer.style.color = "#fff";          // texto branco
  profileContainer.style.display = "flex";
  profileContainer.style.alignItems = "center";
  profileContainer.style.justifyContent = "space-between";
  profileContainer.style.padding = "0 20px";
  profileContainer.style.boxShadow = "0 2px 5px rgba(0,0,0,0.3)";
  profileContainer.style.zIndex = "1000";        // fica na frente

  profileContainer.innerHTML = `
  <div style="display:flex; align-items:center; gap: 10px;">
    <img id="profile-image" src="" alt="Foto de perfil" style="width:60px; height:60px; border-radius:50%; object-fit:cover; border: 2px solid red;" />
    <div>
      <p style="margin:0; font-weight:bold;" id="profile-name"></p>
      <p style="margin:0; font-size:0.8em;" id="profile-email"></p>
    </div>
  </div>
  <button id="logout-button" style="background:#e74c3c; color:#fff; border:none; padding:8px 12px; border-radius:4px; cursor:pointer;">Sair</button>
`;


  // Ajusta o galleryContainer para ficar abaixo da barra
  galleryContainer.style.marginTop = "80px"; // espaço para a barra fixa

  // Adiciona no DOM
  app.appendChild(profileContainer);
  app.appendChild(galleryContainer);

  const auth = getAuth();

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        document.getElementById("profile-name").textContent = data.name;
        document.getElementById("profile-email").textContent = data.email;
        document.getElementById("profile-image").src = data.image || "https://via.placeholder.com/60";
        //document.getElementById("profile-uid").textContent = data.uid;
      }
    } else {
      navigateTo("login");
    }
  });

  document.getElementById("logout-button").addEventListener("click", async () => {
    await signOut(auth);
    navigateTo("login");
  });
}
