// components/home.js
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.8.0/firebase-firestore.js";
import { navigateTo } from "../app.js";

export function renderHome() {
  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="home-container">
      <h2>Bem-vindo</h2>
      <div class="profile-info">
        <img id="profile-image" src="" alt="Foto de perfil" />
        <p><strong>Nome:</strong> <span id="profile-name"></span></p>
        <p><strong>Email:</strong> <span id="profile-email"></span></p>
        <p><strong>UID:</strong> <span id="profile-uid"></span></p>
      </div>
      <button id="logout-button">Sair</button>
    </div>
  `;

  const auth = getAuth();
  const db = getFirestore();

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        document.getElementById("profile-name").textContent = data.name;
        document.getElementById("profile-email").textContent = data.email;
        document.getElementById("profile-uid").textContent = data.uid;
        document.getElementById("profile-image").src = data.image || "https://via.placeholder.com/100";
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
