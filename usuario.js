import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.0/firebase-app.js";
import { getFirestore, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.8.0/firebase-firestore.js";
import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/11.8.0/firebase-auth.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyA5U99_1Y2P52PTd6m5e1bf42ZLPh7KgS8",
  authDomain: "iuserprojeto.firebaseapp.com",
  projectId: "iuserprojeto",
  storageBucket: "iuserprojeto.appspot.com",
  messagingSenderId: "514966603347",
  appId: "1:514966603347:web:146c95a4ae6ce893ae68a6",
  measurementId: "G-K9CMFYP42L"
};

// Inicializa Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Pega o "username" diretamente do path (ex: /outravez)
const path = window.location.pathname;
const username = path.substring(1); // remove a barra inicial

async function carregarPerfil() {
  if (!username) {
    document.getElementById("profile-name").textContent = "Nome de usuário não fornecido.";
    return;
  }

  try {
    const q = query(collection(db, "users"), where("username", "==", username));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const userData = snapshot.docs[0].data();

      document.getElementById("profile-name").textContent = userData.name || "Sem nome";
      document.getElementById("profile-email").textContent = userData.email || "";

      const imageElement = document.getElementById("profile-image");
      if (userData.image) {
        imageElement.src = userData.image;
        imageElement.alt = "Foto de perfil";
        imageElement.style.display = "block";
      } else {
        imageElement.style.display = "none";
      }
    } else {
      document.getElementById("profile-name").textContent = "Usuário não encontrado.";
      document.getElementById("profile-email").textContent = "";
      document.getElementById("profile-image").style.display = "none";
    }
  } catch (error) {
    console.error("Erro ao buscar usuário:", error);
    document.getElementById("profile-name").textContent = "Erro ao carregar perfil.";
  }
}

carregarPerfil();

// Botão de logout
const logoutButton = document.getElementById("logout-button");
if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    try {
      await signOut(auth);
      window.location.href = "/index.html"; // Redireciona para tela inicial
    } catch (error) {
      console.error("Erro ao sair:", error);
      alert("Erro ao sair. Tente novamente.");
    }
  });
}
