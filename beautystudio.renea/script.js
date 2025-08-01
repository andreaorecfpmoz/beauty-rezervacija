let zauzetiTermini = [];
const radnoVrijemeStart = 7;
const radnoVrijemeEnd = 19;
let odabraniTermin = null;

// 💬 Poruka
function prikaziPoruku(text, success = true) {
  const alertBox = document.getElementById("custom-alert");
  const message = document.getElementById("custom-alert-message");
  message.textContent = text;
  alertBox.style.backgroundColor = success ? "#28a745" : "#dc3545";
  alertBox.style.display = "block";
  setTimeout(() => alertBox.style.display = "none", 3000);
}

// 🕒 ISO format za lokalno vrijeme
function formatLocalISO(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

// 📥 Učitaj zauzete termine
async function ucitajZauzeteTermine() {
  try {
    const res = await fetch("https://sheetdb.io/api/v1/jw14ox2kt0nyb");
    const podaci = await res.json();

    zauzetiTermini = podaci
      .filter(p => p.Termin && typeof p.Termin === "string")
      .map(p => {
        const d = new Date(p.Termin);
        return formatLocalISO(d);
      });

    const grouped = {};
    zauzetiTermini.forEach(t => {
      const date = t.split("T")[0];
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(t);
    });

    const zauzetiDatumi = new Set();
    Object.entries(grouped).forEach(([dateStr, termini]) => {
      const datum = new Date(dateStr);
      const brojSlotova = generirajTermineZaDan(30, datum).length;
      if (termini.length >= brojSlotova) {
        zauzetiDatumi.add(dateStr);
      }
    });

    flatpickr("#date", {
      dateFormat: "d. m. Y",
      minDate: new Date().fp_incr(1),
      disable: [
        function (date) {
          const iso = date.toISOString().split("T")[0];
          return zauzetiDatumi.has(iso);
        }
      ],
      onDayCreate: function (dObj, dStr, fp, dayElem) {
        const datum = dayElem.dateObj.toISOString().split("T")[0];
        if (zauzetiDatumi.has(datum)) {
          dayElem.style.opacity = "0.4";
          dayElem.style.pointerEvents = "none";
        }
      },
      onChange: function (selectedDates) {
        prikaziSlobodneTermine(selectedDates[0]);
      }
    });

  } catch (err) {
    console.error("Greška kod učitavanja termina:", err);
    prikaziPoruku("Greška kod dohvaćanja termina!", false);
  }
}

function getTrajanjeZaUslugu(usluga) {
  if (!usluga) return 30;
  usluga = usluga.toLowerCase();
  return (usluga.includes("šminkanje") || usluga.includes("cijele noge")) ? 60 : 30;
}

// 📅 Generiraj termine
function generirajTermineZaDan(trajanje, customDate = null) {
  const termini = [];
  const datumString = document.getElementById("date").value;
  if (!datumString && !customDate) return termini;

  const datum = customDate || new Date(datumString.split(".").reverse().join("-"));
  datum.setHours(radnoVrijemeStart, 0, 0, 0);

  while (datum.getHours() < radnoVrijemeEnd) {
    const iso = formatLocalISO(new Date(datum));
    if (!zauzetiTermini.includes(iso)) {
      const prikaz = datum.toLocaleTimeString("hr-HR", {
        hour: "2-digit",
        minute: "2-digit"
      });
      termini.push({ iso, prikaz });
    }
    datum.setMinutes(datum.getMinutes() + trajanje);
  }

  return termini;
}

// 🕘 Prikaz slobodnih termina
function prikaziSlobodneTermine() {
  odabraniTermin = null;
  const usluga = document.getElementById("service").value;
  const trajanje = getTrajanjeZaUslugu(usluga);
  const termini = generirajTermineZaDan(trajanje);
  const container = document.getElementById("slobodni-termini");
  container.innerHTML = "<p>Dostupni termini:</p>";

  if (termini.length === 0) {
    container.innerHTML += "<p>Nema dostupnih termina.</p>";
    return;
  }

  const grid = document.createElement("div");
  grid.className = "grid-termini";

  termini.forEach(t => {
    const btn = document.createElement("button");
    btn.className = "termin-button";
    btn.textContent = t.prikaz;
    btn.type = "button";

    btn.onclick = () => {
      odabraniTermin = t.iso;
      document.querySelectorAll(".termin-button").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
    };

    grid.appendChild(btn);
  });

  container.appendChild(grid);
}

// 📨 Slanje forme
function postaviFormu() {
  document.getElementById("form").addEventListener("submit", async function (e) {
    e.preventDefault();

    const submitBtn = document.querySelector(".submit-btn");
    submitBtn.disabled = true;
    submitBtn.textContent = "Provjeravam...";

    if (!odabraniTermin) {
      prikaziPoruku("❗ Molimo odaberite termin klikom na satnicu.", false);
      submitBtn.disabled = false;
      submitBtn.textContent = "Pošalji";
      return;
    }

    // 🔁 Višestruka provjera termina (3x)
    let block = false;
    for (let i = 0; i < 3; i++) {
      await ucitajZauzeteTermine();
      if (zauzetiTermini.includes(odabraniTermin)) {
        block = true;
        break;
      }
      await new Promise(r => setTimeout(r, 400));
    }

    if (block) {
      prikaziPoruku("❗ Termin je upravo postao zauzet. Molimo odaberite drugi.", false);
      prikaziSlobodneTermine();
      submitBtn.disabled = false;
      submitBtn.textContent = "Pošalji";
      return;
    }

    const formData = new FormData(this);
    const brojTelefona = formData.get("phone");

    if (!brojTelefona || brojTelefona.trim() === "") {
      prikaziPoruku("❗ Molimo unesite broj telefona.", false);
      submitBtn.disabled = false;
      submitBtn.textContent = "Pošalji";
      return;
    }

    const data = {
      Ime: formData.get("name"),
      Broj: brojTelefona,
      Usluga: formData.get("service"),
      Termin: odabraniTermin
    };
    fetch("https://beauty-rezervacija.vercel.app/api/rezerviraj", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data })
    })
    .then(res => {
      if (res.ok) {
        prikaziPoruku("✅ Rezervacija uspješna!");
        this.reset();
        document.getElementById("slobodni-termini").innerHTML = "";
        odabraniTermin = null;
        ucitajZauzeteTermine();
      } else {
        prikaziPoruku("Greška pri slanju.", false);
      }
      submitBtn.disabled = false;
      submitBtn.textContent = "Pošalji";
    })
    .catch(err => {
      console.error("Greška:", err);
      prikaziPoruku("Došlo je do greške.", false);
      submitBtn.disabled = false;
      submitBtn.textContent = "Pošalji";
    });
  });
}

// 🚀 Inicijalizacija
window.addEventListener("DOMContentLoaded", () => {
  ucitajZauzeteTermine();
  postaviFormu();

  document.getElementById("service").addEventListener("change", () => {
    if (document.getElementById("date").value) {
      prikaziSlobodneTermine();
    }
  });
});
