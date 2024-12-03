import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-auth.js";
import { getFirestore, getDoc, doc } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-firestore.js";

// Configuração Firebase
const firebaseConfig = {
  apiKey: "AIzaSyA5U99_1Y2P52PTd6m5e1bf42ZLPh7KgS8",
  authDomain: "iuserprojeto.firebaseapp.com",
  projectId: "iuserprojeto",
  storageBucket: "iuserprojeto.appspot.com",
  messagingSenderId: "514966603347",
  appId: "1:514966603347:web:146c95a4ae6ce893ae68a6",
  measurementId: "G-K9CMFYP42L",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth();
const db = getFirestore();

// Atualizar URL para o nick do usuário logado
function updateURLWithNick(userNick) {
  const newURL = `/${userNick}`;
  window.history.pushState(null, "", newURL);
}

// Verifica usuário autenticado e carrega seus dados
onAuthStateChanged(auth, (user) => {
  if (user) {
    const loggedInUserId = user.uid;
    localStorage.setItem("loggedInUserId", loggedInUserId);

    const docRef = doc(db, "users", loggedInUserId);
    getDoc(docRef)
      .then((docSnap) => {
        if (docSnap.exists()) {
          const userData = docSnap.data();
          const userNick = userData.iuserNick; // Obtém o nick do usuário
          document.getElementById("loggedLatitude").innerText = userData.latitude || "Não informado";
          document.getElementById("loggedLongitude").innerText = userData.longitude || "Não informado";
          document.getElementById("loggedUserEmail").innerText = userData.email;

          // Atualiza a URL com o nick do usuário
          if (userNick) {
            updateURLWithNick(userNick);
          } else {
            console.error("Nick do usuário não encontrado.");
          }
        } else {
          console.log("Nenhum documento encontrado para o usuário logado.");
        }
      })
      .catch((error) => {
        console.error("Erro ao buscar os dados do usuário logado:", error);
      });
  } else {
    console.log("Usuário não autenticado.");
  }
});

// Compartilhar link do perfil
document.getElementById("shareProfileButton").addEventListener("click", () => {
  const user = auth.currentUser;

  if (user) {
    const docRef = doc(db, "users", user.uid);
    getDoc(docRef)
      .then((docSnap) => {
        if (docSnap.exists()) {
          const userData = docSnap.data();
          const userNick = userData.iuserNick; // Obtém o nick do usuário

          // Gera o link do perfil
          const profileLink = `iuser.com.br/${userNick}`;

          // Copiar o link para a área de transferência
          navigator.clipboard.writeText(profileLink)
            .then(() => {
              alert("Link do perfil copiado para a área de transferência!");
            })
            .catch((err) => {
              console.error("Erro ao copiar o link:", err);
            });
        } else {
          console.log("Nenhum documento encontrado para o usuário logado.");
        }
      })
      .catch((err) => {
        console.error("Erro ao buscar dados do usuário:", err);
      });
  } else {
    alert("Usuário não autenticado.");
  }
});

// Logout
const logoutButton = document.getElementById("logout");
logoutButton.addEventListener("click", () => {
  signOut(auth)
    .then(() => {
      localStorage.removeItem("loggedInUserId");
      window.location.href = "index.html";
    })
    .catch((error) => {
      console.error("Erro ao fazer logout:", error);
    });
});
