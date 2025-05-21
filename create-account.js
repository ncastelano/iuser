import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/11.8.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.8.0/firebase-analytics.js";

// Configuração Firebase
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
const auth = getAuth(app);
const db = getFirestore(app);
const analytics = getAnalytics(app);

// Formulário
const form = document.getElementById("create-account-form");
const name = document.getElementById("name");
const email = document.getElementById("email");
const password = document.getElementById("password");
const image = document.getElementById("image");

function generateUsername(fullName) {
  return fullName.trim().toLowerCase().replace(/\s+/g, '');
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email.value, password.value);
    const user = userCredential.user;

    const username = generateUsername(name.value);

    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      name: name.value,
      username: username,
      email: email.value,
      image: image.value || null,
    });

    alert("Conta criada com sucesso!");

    // Redireciona para o perfil do usuário
    window.location.href = `/usuario.html?uid=${user.uid}`;

  } catch (error) {
    console.error("Erro:", error.message);
    alert("Erro ao criar conta: " + error.message);
  }
});
