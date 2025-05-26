import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.8.0/firebase-firestore.js";

export function renderMyAvatar(container) {
  container.innerHTML = "<p>Carregando perfil...</p>";

  const auth = getAuth();
  const db = getFirestore();

  onAuthStateChanged(auth, async (user) => {
    if (!user) return container.innerHTML = "<p>Usuário não autenticado.</p>";

    const docSnap = await getDoc(doc(db, "users", user.uid));
    if (!docSnap.exists()) return container.innerHTML = "<p>Perfil não encontrado.</p>";

    const data = docSnap.data();

    container.innerHTML = `
      <div style="display:flex; align-items:center; gap:20px; padding:20px;">
        <img src="${data.image || "https://via.placeholder.com/80"}" alt="Foto" style="width:100px; height:100px; border-radius:50%; object-fit:cover; border:2px solid #999;" />
        <div>
          <h2 style="margin:0;">${data.name}</h2>
          <p style="margin:0;">${data.email}</p>
          <p style="margin:0; font-size:0.9em; color:#666;">UID: ${data.uid}</p>
        </div>
      </div>
    `;
  });
}
    