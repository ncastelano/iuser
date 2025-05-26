import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.8.0/firebase-firestore.js";
import { navigateTo } from "../app.js"; // 👈 importa
import { slugifyName } from "../utils/slugify.js";


export async function renderAllUsers(container) {
  container.innerHTML = "<p>Carregando usuários...</p>";

  const db = getFirestore();
  const gallery = document.createElement("div");
  gallery.style.display = "flex";
  gallery.style.overflowX = "auto";
  gallery.style.gap = "16px";
  gallery.style.padding = "20px";

  try {
    const querySnapshot = await getDocs(collection(db, "users"));
    querySnapshot.forEach((docSnap) => {
      const user = docSnap.data();

      const userCard = document.createElement("div");
      userCard.style.display = "flex";
      userCard.style.flexDirection = "column";
      userCard.style.alignItems = "center";
      userCard.style.minWidth = "80px";
      userCard.style.cursor = "pointer";

      const img = document.createElement("img");
      img.src = user.image || "https://via.placeholder.com/80";
      img.style.width = "80px";
      img.style.height = "80px";
      img.style.borderRadius = "50%";
      img.style.objectFit = "cover";

      const email = document.createElement("span");
      email.textContent = user.email;
      email.style.fontSize = "0.75em";
      email.style.textAlign = "center";

    userCard.addEventListener("click", () => {
  const slug = slugifyName(user.name);
  navigateTo(slug); // ex: "#joao-silva"
});



      userCard.appendChild(img);
      userCard.appendChild(email);
      gallery.appendChild(userCard);
    });

    container.innerHTML = ""; // limpa o loading
    container.appendChild(gallery);
  } catch (error) {
    container.innerHTML = `<p>Erro ao carregar usuários.</p>`;
    console.error(error);
  }
}
