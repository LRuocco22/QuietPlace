// === CONFIGURAZIONE ===
const API_BASE = "https://quietplace-functions-2025-llr-dtfgbgc7fsddg6e6.francecentral-01.azurewebsites.net/api";

// === MAPPA ===
const map = L.map('map').setView([40.85, 14.27], 11);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

let selectedMarker = null;

// FUNZIONE PER DETERMINARE IL COLORE IN BASE AI DECIBEL 
function getColor(db) {
  if (db < 50) return "green";
  if (db < 80) return "yellow";
  return "red";
}

// CARICAMENTO DEI PUNTI ESISTENTI
async function loadPoints() {
  try {
    const res = await fetch(`${API_BASE}/points`);
    const data = await res.json();

    // Rimuovi cerchi esistenti
    map.eachLayer(layer => {
      if (layer instanceof L.CircleMarker) map.removeLayer(layer);
    });

    // Aggiungi punti rumorosi
    data.features.forEach(f => {
      const [lon, lat] = f.geometry.coordinates;
      const { decibel, color, timestamp, reason, id } = f.properties;

      L.circleMarker([lat, lon], {
        radius: 8,
        color: color || getColor(decibel),
        fillOpacity: 0.8
      })
        .addTo(map)
        .bindPopup(
          `<b>${decibel} dB</b><br>` +
          (reason ? `<i>${reason}</i><br>` : "") +
          `<small>${new Date(timestamp).toLocaleString()}</small>`
        );
    });
  } catch (err) {
    console.error("Errore nel caricamento dei punti:", err);
  }
}

// CLICK SULLA MAPPA
map.on('click', (e) => {
  const { lat, lng } = e.latlng;
  const latRounded = lat.toFixed(4);
  const lonRounded = lng.toFixed(4);

  document.getElementById("lat").value = latRounded;
  document.getElementById("lon").value = lonRounded;

  if (selectedMarker) map.removeLayer(selectedMarker);

  selectedMarker = L.marker([lat, lng], {
    icon: L.divIcon({
      className: 'selected-point',
      html: '📍',
      iconSize: [24, 24],
      iconAnchor: [12, 24]
    })
  }).addTo(map);
});

//  INVIO DEL FORM 
document.getElementById("noiseForm").addEventListener("submit", async e => {
  e.preventDefault();

  const lat = parseFloat(document.getElementById("lat").value).toFixed(4);
  const lon = parseFloat(document.getElementById("lon").value).toFixed(4);
  const decibel = parseInt(document.getElementById("decibel").value);
  const reason = document.getElementById("reason").value.trim();
  const msg = document.getElementById("msg");

  if (isNaN(lat) || isNaN(lon)) {
    msg.textContent = "Seleziona un punto sulla mappa prima di inviare!";
    msg.style.color = "red";
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/submitNoise`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: Number(lat), lon: Number(lon), decibel, reason })
    });

    if (res.ok) {
      msg.textContent = "Punto aggiunto con successo!";
      msg.style.color = "green";

      if (selectedMarker) map.removeLayer(selectedMarker);
      selectedMarker = null;

      document.getElementById("noiseForm").reset();
      loadPoints();
    } else {
      msg.textContent = "Errore durante l'invio del punto.";
      msg.style.color = "red";
    }
  } catch (err) {
    msg.textContent = "Errore di rete (controlla connessione o CORS).";
    msg.style.color = "red";
    console.error(err);
  }
});

loadPoints();

// GEOLOCALIZZAZIONE AUTOMATICA E CONTROLLO RUMORE VICINO 
window.onload = function () {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(successGeo, errorGeo);
  } else {
    console.warn("Geolocalizzazione non supportata.");
  }
};

async function successGeo(position) {
  const lat = Number(position.coords.latitude.toFixed(4));
  const lon = Number(position.coords.longitude.toFixed(4));

  // Riempie automaticamente il form
  document.getElementById("lat").value = lat;
  document.getElementById("lon").value = lon;

  // Mostra un marker per la posizione attuale
  const userMarker = L.marker([lat, lon], {
    icon: L.divIcon({
      className: 'selected-point',
      html: '🧍',
      iconSize: [24, 24],
      iconAnchor: [12, 24]
    })
  }).addTo(map).bindPopup("La tua posizione attuale").openPopup();

  map.setView([lat, lon], 14);

  // Dopo aver ottenuto la posizione, controlla se ci sono punti vicini
  await checkNearbyNoise(lat, lon);
}

function errorGeo(err) {
  console.warn("Errore geolocalizzazione:", err.message);
}

// CONTROLLO SE CI SONO PUNTI VICINI 
async function checkNearbyNoise(lat, lon) {
  try {
    const res = await fetch(`${API_BASE}/points`);
    const data = await res.json();

    const threshold = 0.002; // ≈ 200 metri
    const nearby = data.features.filter(f => {
      const [lonP, latP] = f.geometry.coordinates;
      return Math.abs(latP - lat) < threshold && Math.abs(lonP - lon) < threshold;
    });

    if (nearby.length > 0) {
      // Mostra popup personalizzato
      const popup = document.getElementById("noise-popup");
      popup.classList.remove("hidden");

      // Gestione pulsanti
      const yesBtn = document.getElementById("popup-yes");
      const noBtn = document.getElementById("popup-no");

      const handleChoice = async (choice) => {
        popup.classList.add("hidden");
        const action = choice === "yes" ? "refresh" : "inactive";

        for (const p of nearby) {
          if (p.properties.id) await updatePointStatus(p.properties.id, action);
        }

        // Se l'utente ha detto "No", rimuovi immediatamente i marker vicini dalla mappa
        if (action === "inactive") {
          map.eachLayer(layer => {
            if (layer instanceof L.CircleMarker) {
              const pos = layer.getLatLng();
              const tooClose = nearby.some(f =>
                Math.abs(f.geometry.coordinates[1] - pos.lat) < threshold &&
                Math.abs(f.geometry.coordinates[0] - pos.lng) < threshold
              );
              if (tooClose) map.removeLayer(layer);
            }
          });
        }

        loadPoints();

        if (action === "refresh") {
          showToast("🔊 Rumore confermato nella zona.", "info");
        } else if (action === "inactive") {
          showToast("🟢 Segnalazione rimossa dalla mappa.", "success");
        }

      };

      yesBtn.onclick = () => handleChoice("yes");
      noBtn.onclick = () => handleChoice("no");
    }

  } catch (err) {
    console.error("Errore nel controllo punti vicini:", err);
  }
}

async function updatePointStatus(id, action) {
  try {
    const res = await fetch(`${API_BASE}/updatePointStatus`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action })
    });
    if (!res.ok) console.warn("Errore aggiornamento punto:", id);
  } catch (err) {
    console.error("Errore rete updatePointStatus:", err);
  }
}

// MOSTRA UNA NOTIFICA TOAST 
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

