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
          document.getElementById("loggedLatitude").innerText = userData.latitude || "Não informado";
          document.getElementById("loggedLongitude").innerText = userData.longitude || "Não informado";
          document.getElementById("loggedUserEmail").innerText = userData.email;
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
            const userNick = userData.iuserNick; // Pegue o iuserNick do usuário
  
            // Concatenar o link correto
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
  
// Carregar dados do perfil visitado
const urlParams = new URLSearchParams(window.location.search);
const visitedUserId = urlParams.get("userId");

if (visitedUserId) {
  const docRef = doc(db, "users", visitedUserId);
  getDoc(docRef)
    .then((docSnap) => {
      if (docSnap.exists()) {
        const userData = docSnap.data();
        document.getElementById("loggedUserEmail").textContent = userData.email;
        document.getElementById("loggedLatitude").textContent = userData.latitude || "Não informado";
        document.getElementById("loggedLongitude").textContent = userData.longitude || "Não informado";
      } else {
        alert("Usuário não encontrado.");
      }
    })
    .catch((error) => {
      console.error("Erro ao buscar o perfil:", error);
    });
} else {
  console.log("Nenhum ID de usuário encontrado na URL.");
}

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
