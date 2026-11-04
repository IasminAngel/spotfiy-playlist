/**
 * app.js — Festival Playlist Generator
 * ─────────────────────────────────────────────────────────────
 * Fluxo:
 *   1. Upload/input da imagem do cartaz
 *   2. Simulação de OCR para extrair artistas
 *   3. Seleção de artistas + filtros
 *   4. Busca das top tracks no Spotify (Client Credentials)
 *   5. Exportação da playlist
 * ─────────────────────────────────────────────────────────────
 */

"use strict";

/* ══════════════════════════════════════════════
   ESTADO GLOBAL
══════════════════════════════════════════════ */
const state = {
  spotifyToken: null,
  tokenExpiresAt: 0,
  isSpotifyConnected: false,
  userId: null,

  uploadedImage: null,
  extractedArtists: [],
  selectedArtists: new Set(),

  playlistName: "Festival Mix",
  tracksPerArtist: 5,
  sortBy: "popularity",

  generatedTracks: [],
  currentAudio: null,
  currentPlayingBtn: null,
};

/* ══════════════════════════════════════════════
   DOM REFS
══════════════════════════════════════════════ */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const dom = {
  themeBtn: $("#btn-theme"),
  themeIcon: $(".theme-icon"),
  spotifyAuthBtn: $("#btn-spotify-auth"),
  spotifyAuthLabel: $("#spotify-auth-label"),

  uploadArea: $("#upload-area"),
  fileInput: $("#file-input"),
  extractBtn: $("#btn-extract"),
  manualArtists: $("#manual-artists"),

  stepUpload: $("#step-upload"),
  stepArtists: $("#step-artists"),
  stepFilters: $("#step-filters"),
  stepPlaylist: $("#step-playlist"),

  artistsGrid: $("#artists-grid"),
  artistsCount: $("#artists-count"),
  selectAllBtn: $("#btn-select-all"),
  deselectAllBtn: $("#btn-deselect-all"),
  toFiltersBtn: $("#btn-to-filters"),

  generateBtn: $("#btn-generate"),
  playlistNameInput: $("#playlist-name"),

  playlistMeta: $("#playlist-meta"),
  playlistTracks: $("#playlist-tracks"),
  exportSpotifyBtn: $("#btn-export-spotify"),
  copyTracksBtn: $("#btn-copy-tracks"),
  restartBtn: $("#btn-restart"),
  playPreviewBtn: $("#btn-play-preview"),

  toastContainer: $("#toast-container"),
  previewModal: $("#preview-modal"),
  modalBody: $("#modal-body"),
  modalClose: $("#modal-close"),
  previewAudio: $("#preview-audio"),
};

/* ══════════════════════════════════════════════
   BANCO DE DADOS MOCK (artistas simulados)
   Usado para simular o OCR quando não há API de visão
══════════════════════════════════════════════ */
const FESTIVAL_MOCK_LINEUPS = {
  default: [
    "Arctic Monkeys", "Billie Eilish", "Tame Impala", "The Strokes",
    "Doja Cat", "Kendrick Lamar", "Florence and The Machine",
    "Vampire Weekend", "Lorde", "Tyler, the Creator",
    "Haim", "Phoebe Bridgers", "Glass Animals", "The 1975",
    "Wet Leg", "Idles", "Fontaines D.C.", "Japanese Breakfast",
    "Khruangbin", "Men I Trust",
  ],
  rock: [
    "Foo Fighters", "Red Hot Chili Peppers", "Green Day", "Muse",
    "Queens of the Stone Age", "Pearl Jam", "The Black Keys",
    "Jack White", "Nothing But Thieves", "Wolf Alice",
    "Royal Blood", "Radiohead", "Blur", "Oasis",
  ],
  electronic: [
    "Daft Punk", "Chemical Brothers", "Aphex Twin", "Four Tet",
    "Bicep", "Fred Again..", "Jamie xx", "Disclosure",
    "Caribou", "Floating Points", "Objekt", "Amelie Lens",
    "Charlotte de Witte", "Jon Hopkins",
  ],
};

/* ══════════════════════════════════════════════
   TEMA
══════════════════════════════════════════════ */
function initTheme() {
  const saved = localStorage.getItem("fpg-theme") || "dark";
  setTheme(saved);
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  dom.themeIcon.textContent = theme === "dark" ? "🌙" : "☀️";
  dom.themeBtn.setAttribute("aria-label", `Mudar para tema ${theme === "dark" ? "claro" : "escuro"}`);
  localStorage.setItem("fpg-theme", theme);
}

dom.themeBtn.addEventListener("click", () => {
  const current = document.documentElement.dataset.theme;
  setTheme(current === "dark" ? "light" : "dark");
});

/* ══════════════════════════════════════════════
   TOAST NOTIFICATIONS
══════════════════════════════════════════════ */
function showToast(message, type = "info", duration = 4000) {
  const icons = { success: "✅", error: "❌", warn: "⚠️", info: "ℹ️" };
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon" aria-hidden="true">${icons[type]}</span>
    <span>${message}</span>
  `;
  dom.toastContainer.appendChild(toast);

  const remove = () => {
    toast.classList.add("is-exiting");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  };

  const timer = setTimeout(remove, duration);
  toast.addEventListener("click", () => { clearTimeout(timer); remove(); });
}

/* ══════════════════════════════════════════════
   SPOTIFY AUTH — Client Credentials Flow
══════════════════════════════════════════════ */
async function getSpotifyToken() {
  if (state.spotifyToken && Date.now() < state.tokenExpiresAt - 5000) {
    return state.spotifyToken;
  }

  if (
    !SPOTIFY_CONFIG.CLIENT_ID ||
    SPOTIFY_CONFIG.CLIENT_ID === "SEU_CLIENT_ID_AQUI" ||
    !SPOTIFY_CONFIG.CLIENT_SECRET ||
    SPOTIFY_CONFIG.CLIENT_SECRET === "SEU_CLIENT_SECRET_AQUI"
  ) {
    throw new Error("Configure suas credenciais do Spotify em spotify-test.js");
  }

  const credentials = btoa(`${SPOTIFY_CONFIG.CLIENT_ID}:${SPOTIFY_CONFIG.CLIENT_SECRET}`);

  let res;
  try {
    res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
  } catch (networkErr) {
    throw new Error(`Sem conexão com o Spotify: ${networkErr.message}`);
  }

  if (!res.ok) {
    let errBody = {};
    try { errBody = await res.json(); } catch {}
    console.error("Spotify auth error:", res.status, errBody);
    throw new Error(
      `Autenticação Spotify falhou (HTTP ${res.status}): ${errBody.error_description || errBody.error || "verifique suas credenciais"}`
    );
  }

  const data = await res.json();
  state.spotifyToken = data.access_token;
  state.tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return state.spotifyToken;
}

async function connectSpotify() {
  setButtonLoading(dom.spotifyAuthBtn, true);
  try {
    await getSpotifyToken();
    state.isSpotifyConnected = true;
    dom.spotifyAuthLabel.textContent = "Spotify Conectado ✓";
    dom.spotifyAuthBtn.style.opacity = "0.8";
    dom.exportSpotifyBtn.disabled = false;
    showToast("Conectado ao Spotify com sucesso!", "success");
  } catch (err) {
    showToast(err.message, "error", 6000);
  } finally {
    setButtonLoading(dom.spotifyAuthBtn, false);
  }
}

dom.spotifyAuthBtn.addEventListener("click", connectSpotify);

/* ══════════════════════════════════════════════
   UPLOAD DE IMAGEM
══════════════════════════════════════════════ */
dom.uploadArea.addEventListener("click", (e) => {
  if (e.target !== dom.uploadArea && !e.target.closest(".upload-area")) return;
  dom.fileInput.click();
});

dom.uploadArea.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    dom.fileInput.click();
  }
});

dom.fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) handleImageFile(file);
});

// Drag & Drop
dom.uploadArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  dom.uploadArea.classList.add("drag-over");
});

dom.uploadArea.addEventListener("dragleave", () => {
  dom.uploadArea.classList.remove("drag-over");
});

dom.uploadArea.addEventListener("drop", (e) => {
  e.preventDefault();
  dom.uploadArea.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith("image/")) {
    handleImageFile(file);
  } else {
    showToast("Por favor, solte apenas arquivos de imagem.", "warn");
  }
});

function handleImageFile(file) {
  if (file.size > 10 * 1024 * 1024) {
    showToast("Imagem muito grande. Máximo de 10 MB.", "error");
    return;
  }

  state.uploadedImage = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    const existing = dom.uploadArea.querySelector(".upload-preview");
    if (existing) existing.remove();

    const img = document.createElement("img");
    img.src = e.target.result;
    img.className = "upload-preview";
    img.alt = "Preview do cartaz";
    dom.uploadArea.prepend(img);
    showToast(`Imagem "${file.name}" carregada!`, "success");
  };
  reader.readAsDataURL(file);
}

/* ══════════════════════════════════════════════
   EXTRAÇÃO DE ARTISTAS (OCR Simulado)
══════════════════════════════════════════════ */
dom.extractBtn.addEventListener("click", extractArtists);

async function extractArtists() {
  const manualText = dom.manualArtists.value.trim();

  if (manualText) {
    // Usa input manual
    const artists = manualText
      .split("\n")
      .map((a) => a.trim())
      .filter((a) => a.length > 0)
      .filter((a, i, arr) => arr.indexOf(a) === i); // dedup

    if (artists.length === 0) {
      showToast("Insira pelo menos um artista.", "warn");
      return;
    }

    await simulateOCR(artists, "manual");
  } else if (state.uploadedImage) {
    // Simula OCR na imagem
    const mockArtists = pickRandomLineup();
    await simulateOCR(mockArtists, "ocr");
  } else {
    showToast("Cole os nomes dos artistas ou faça o upload de um cartaz.", "warn");
    return;
  }
}

function pickRandomLineup() {
  const keys = Object.keys(FESTIVAL_MOCK_LINEUPS);
  const key = keys[Math.floor(Math.random() * keys.length)];
  const pool = FESTIVAL_MOCK_LINEUPS[key];
  // Retorna entre 8 e 18 artistas aleatórios
  const count = 8 + Math.floor(Math.random() * 11);
  return [...pool].sort(() => Math.random() - 0.5).slice(0, count);
}

async function simulateOCR(artists, mode) {
  setButtonLoading(dom.extractBtn, true);

  // Mostra barra de progresso dentro do card
  const progressHTML = `
    <div id="ocr-progress" style="margin:1rem 0">
      <div class="progress-bar-wrapper">
        <div class="progress-bar" id="progress-fill"></div>
      </div>
      <p class="progress-label" id="progress-label">
        ${mode === "ocr" ? "Analisando imagem..." : "Processando lista..."}
      </p>
    </div>
  `;
  dom.extractBtn.insertAdjacentHTML("beforebegin", progressHTML);

  const fill = $("#progress-fill");
  const label = $("#progress-label");

  const steps = mode === "ocr"
    ? [
        [15, "Detectando texto na imagem..."],
        [35, "Identificando nomes de artistas..."],
        [60, "Filtrando e normalizando..."],
        [85, "Verificando duplicatas..."],
        [100, "Concluído!"],
      ]
    : [
        [40, "Lendo lista de artistas..."],
        [80, "Normalizando nomes..."],
        [100, "Pronto!"],
      ];

  for (const [pct, msg] of steps) {
    await sleep(300 + Math.random() * 300);
    fill.style.width = `${pct}%`;
    label.textContent = msg;
  }

  await sleep(400);
  $("#ocr-progress")?.remove();

  state.extractedArtists = artists;
  state.selectedArtists = new Set(artists);
  setButtonLoading(dom.extractBtn, false);

  renderArtistsStep();
  showStep("step-artists");
  showToast(`${artists.length} artistas encontrados!`, "success");
}

/* ══════════════════════════════════════════════
   STEP: ARTISTAS
══════════════════════════════════════════════ */
function renderArtistsStep() {
  dom.artistsGrid.innerHTML = "";

  state.extractedArtists.forEach((artist) => {
    const card = document.createElement("div");
    card.className = "artist-card is-selected";
    card.tabIndex = 0;
    card.setAttribute("role", "checkbox");
    card.setAttribute("aria-checked", "true");
    card.setAttribute("aria-label", artist);
    card.dataset.artist = artist;

    card.innerHTML = `
      <div class="artist-check" aria-hidden="true">✓</div>
      <span class="artist-name">${escapeHtml(artist)}</span>
    `;

    card.addEventListener("click", () => toggleArtist(card, artist));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleArtist(card, artist);
      }
    });

    dom.artistsGrid.appendChild(card);
  });

  updateArtistCount();
}

function toggleArtist(card, artist) {
  if (state.selectedArtists.has(artist)) {
    state.selectedArtists.delete(artist);
    card.classList.remove("is-selected");
    card.setAttribute("aria-checked", "false");
    card.querySelector(".artist-check").textContent = "";
  } else {
    state.selectedArtists.add(artist);
    card.classList.add("is-selected", "just-selected");
    card.setAttribute("aria-checked", "true");
    card.querySelector(".artist-check").textContent = "✓";
    card.addEventListener("animationend", () => card.classList.remove("just-selected"), { once: true });
  }
  updateArtistCount();
}

function updateArtistCount() {
  const total = state.extractedArtists.length;
  const selected = state.selectedArtists.size;
  dom.artistsCount.textContent = `${selected} de ${total} selecionados`;
}

dom.selectAllBtn.addEventListener("click", () => {
  state.selectedArtists = new Set(state.extractedArtists);
  $$(".artist-card", dom.artistsGrid).forEach((card) => {
    card.classList.add("is-selected");
    card.setAttribute("aria-checked", "true");
    card.querySelector(".artist-check").textContent = "✓";
  });
  updateArtistCount();
});

dom.deselectAllBtn.addEventListener("click", () => {
  state.selectedArtists.clear();
  $$(".artist-card", dom.artistsGrid).forEach((card) => {
    card.classList.remove("is-selected");
    card.setAttribute("aria-checked", "false");
    card.querySelector(".artist-check").textContent = "";
  });
  updateArtistCount();
});

dom.toFiltersBtn.addEventListener("click", () => {
  if (state.selectedArtists.size === 0) {
    showToast("Selecione pelo menos um artista.", "warn");
    return;
  }
  showStep("step-filters");
});

/* ══════════════════════════════════════════════
   STEP: FILTROS
══════════════════════════════════════════════ */
dom.generateBtn.addEventListener("click", generatePlaylist);

dom.playlistNameInput.addEventListener("input", (e) => {
  state.playlistName = e.target.value || "Festival Mix";
});

/* ══════════════════════════════════════════════
   GERAÇÃO DA PLAYLIST
══════════════════════════════════════════════ */
async function generatePlaylist() {
  state.tracksPerArtist = parseInt(
    $("input[name='tracks-per-artist']:checked")?.value || "5"
  );
  state.sortBy = $("input[name='sort-by']:checked")?.value || "popularity";
  state.playlistName = dom.playlistNameInput.value || "Festival Mix";

  const artists = [...state.selectedArtists];
  setButtonLoading(dom.generateBtn, true);

  // Barra de progresso inline
  const progressHTML = `
    <div id="gen-progress" style="margin-top:1rem">
      <div class="progress-bar-wrapper">
        <div class="progress-bar" id="gen-progress-fill"></div>
      </div>
      <p class="progress-label" id="gen-progress-label">Buscando faixas...</p>
    </div>
  `;
  dom.generateBtn.insertAdjacentHTML("beforebegin", progressHTML);
  const fill = $("#gen-progress-fill");
  const label = $("#gen-progress-label");

  try {
    const token = await getSpotifyToken();
    const allTracks = [];
    let notFound = 0;

    for (let i = 0; i < artists.length; i++) {
      const artist = artists[i];
      label.textContent = `Buscando: ${artist} (${i + 1}/${artists.length})`;
      fill.style.width = `${Math.round(((i + 1) / artists.length) * 100)}%`;

      try {
        const tracks = await fetchArtistTracks(artist, token, state.tracksPerArtist);
        if (tracks.length === 0) notFound++;
        allTracks.push(...tracks);
      } catch (innerErr) {
        if (innerErr.message === "TOKEN_EXPIRED") {
          // Força renovação e retenta este artista
          state.spotifyToken = null;
          const newToken = await getSpotifyToken();
          const tracks = await fetchArtistTracks(artist, newToken, state.tracksPerArtist);
          allTracks.push(...tracks);
        } else {
          console.warn(`Erro ao buscar "${artist}":`, innerErr);
          notFound++;
        }
      }

      // Pequeno delay entre requisições para não triggerar rate limit
      if (i < artists.length - 1) await sleep(120);
    }

    $("#gen-progress")?.remove();

    if (notFound > 0) {
      showToast(`${notFound} artista(s) não encontrado(s) no Spotify.`, "warn");
    }

    if (allTracks.length === 0) {
      // Nenhuma track real — cai no modo demo com aviso claro
      showToast("Spotify não retornou faixas. Usando modo demo.", "warn", 6000);
      state.generatedTracks = generateMockPlaylist(artists, state.tracksPerArtist, state.sortBy);
    } else {
      state.generatedTracks = sortTracks(allTracks, state.sortBy);
      showToast(`Playlist gerada com ${state.generatedTracks.length} músicas!`, "success");
    }

    renderPlaylist();
    showStep("step-playlist");
  } catch (err) {
    $("#gen-progress")?.remove();
    console.error("Erro ao gerar playlist:", err);

    if (err.message.includes("credenciais") || err.message.includes("Configure")) {
      // Modo demo — credenciais ausentes
      state.generatedTracks = generateMockPlaylist(artists, state.tracksPerArtist, state.sortBy);
      renderPlaylist();
      showStep("step-playlist");
      showToast("Modo demo ativo — configure suas credenciais em spotify-test.js.", "warn", 7000);
    } else {
      showToast(`Erro: ${err.message}`, "error", 7000);
    }
  } finally {
    setButtonLoading(dom.generateBtn, false);
  }
}

/* ── Spotify API calls ── */
async function spotifyGet(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw new Error("TOKEN_EXPIRED");
  if (res.status === 429) {
    const wait = parseInt(res.headers.get("Retry-After") || "2", 10) * 1000;
    await sleep(wait);
    return spotifyGet(url, token); // retenta uma vez
  }
  if (!res.ok) {
    console.warn(`Spotify GET ${url} → HTTP ${res.status}`);
    return null;
  }
  return res.json();
}

async function fetchArtistTracks(artistName, token, limit) {
  // 1. Encontra o artista pelo nome
  const searchData = await spotifyGet(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(artistName)}&type=artist&limit=1`,
    token
  );
  const artist = searchData?.artists?.items?.[0];
  if (!artist) {
    console.warn(`Artista não encontrado: "${artistName}"`);
    return [];
  }

  // 2. Busca álbuns do artista (albums + singles, sem necessidade de market)
  //    O endpoint /top-tracks exige usuário autenticado em alguns planos de app —
  //    álbuns funcionam com Client Credentials.
  const albumsData = await spotifyGet(
    `https://api.spotify.com/v1/artists/${artist.id}/albums?limit=20&include_groups=album,single`,
    token
  );
  const albums = albumsData?.items || [];

  if (albums.length === 0) {
    console.warn(`Nenhum álbum encontrado para "${artistName}"`);
    return [];
  }

  // 3. Coleta faixas de cada álbum até atingir o limite pedido
  //    Ordena álbuns do mais recente para o mais antigo para priorizar material atual
  const sortedAlbums = [...albums].sort(
    (a, b) => new Date(b.release_date) - new Date(a.release_date)
  );

  const tracks = [];
  const seenNames = new Set(); // evita duplicatas de single vs álbum

  for (const album of sortedAlbums) {
    if (tracks.length >= limit) break;

    const albumTracksData = await spotifyGet(
      `https://api.spotify.com/v1/albums/${album.id}/tracks?limit=50`,
      token
    );
    const albumTracks = albumTracksData?.items || [];

    // Thumbnail vem do objeto do álbum (tem 3 tamanhos: 640, 300, 64)
    const thumbnail =
      album.images?.[2]?.url || // 64px
      album.images?.[1]?.url || // 300px
      album.images?.[0]?.url || // 640px
      null;

    for (const t of albumTracks) {
      if (tracks.length >= limit) break;
      const normName = t.name.toLowerCase().trim();
      if (seenNames.has(normName)) continue;
      seenNames.add(normName);

      tracks.push({
        id: t.id,
        name: t.name,
        artist: artistName,
        artistId: artist.id,
        artistGenres: artist.genres || [],
        album: album.name,
        thumbnail,
        previewUrl: t.preview_url || null,
        popularity: album.total_tracks || 0, // proxy de popularidade pelo nº de faixas do álbum
        externalUrl: t.external_urls?.spotify || null,
        duration: t.duration_ms,
      });
    }

    // Pequeno delay entre chamadas de álbum para não triggerar rate limit
    await sleep(80);
  }

  return tracks;
}

/* ── Gerador mock (sem Spotify) ── */
function generateMockPlaylist(artists, tracksPerArtist, sortBy) {
  const genres = ["Indie Rock", "Pop", "Hip-Hop", "Electronic", "Alternative"];
  const days = ["Quinta-feira", "Sexta-feira", "Sábado", "Domingo"];
  const fakeAlbums = ["Favourite Worst Nightmare", "When We All Fall Asleep",
    "Currents", "First Impressions of Earth", "Planet Her", "Mr. Morale"];

  const tracks = [];
  artists.forEach((artist, ai) => {
    for (let i = 0; i < tracksPerArtist; i++) {
      tracks.push({
        id: `mock-${ai}-${i}`,
        name: generateFakeTrackName(),
        artist,
        artistGenres: [genres[Math.floor(Math.random() * genres.length)]],
        album: fakeAlbums[Math.floor(Math.random() * fakeAlbums.length)],
        thumbnail: null,
        previewUrl: null,
        popularity: Math.floor(40 + Math.random() * 60),
        day: days[ai % days.length],
        externalUrl: null,
        duration: 180000 + Math.floor(Math.random() * 120000),
      });
    }
  });

  return sortTracks(tracks, sortBy);
}

const FAKE_ADJECTIVES = ["Lost", "Golden", "Neon", "Crystal", "Electric", "Silent", "Broken", "Endless"];
const FAKE_NOUNS = ["Highway", "Dreams", "Signal", "Motion", "Fire", "Rain", "Ocean", "Gravity"];

function generateFakeTrackName() {
  const adj = FAKE_ADJECTIVES[Math.floor(Math.random() * FAKE_ADJECTIVES.length)];
  const noun = FAKE_NOUNS[Math.floor(Math.random() * FAKE_NOUNS.length)];
  return `${adj} ${noun}`;
}

/* ── Ordenação ── */
function sortTracks(tracks, sortBy) {
  switch (sortBy) {
    case "popularity":
      return [...tracks].sort((a, b) => b.popularity - a.popularity);
    case "genre":
      return [...tracks].sort((a, b) => {
        const ga = a.artistGenres?.[0] || "zzz";
        const gb = b.artistGenres?.[0] || "zzz";
        return ga.localeCompare(gb);
      });
    case "day":
      return [...tracks].sort((a, b) => {
        const order = ["Quinta-feira", "Sexta-feira", "Sábado", "Domingo"];
        return (order.indexOf(a.day) - order.indexOf(b.day)) || 0;
      });
    case "random":
      return [...tracks].sort(() => Math.random() - 0.5);
    default:
      return tracks;
  }
}

/* ══════════════════════════════════════════════
   RENDERIZAR PLAYLIST
══════════════════════════════════════════════ */
function renderPlaylist() {
  const tracks = state.generatedTracks;

  // Meta info
  const totalMs = tracks.reduce((s, t) => s + (t.duration || 210000), 0);
  dom.playlistMeta.innerHTML = `
    <strong>${escapeHtml(state.playlistName)}</strong>
    ${tracks.length} músicas · ${formatDuration(totalMs)}
    ${state.isSpotifyConnected ? " · <span style='color:var(--clr-green)'>Spotify ativo</span>" : ""}
  `;

  dom.playlistTracks.innerHTML = "";

  // Agrupamento visual por gênero/dia se aplicável
  let lastGroup = null;

  tracks.forEach((track, idx) => {
    // Separador de grupo
    if (state.sortBy === "genre" || state.sortBy === "day") {
      const group = state.sortBy === "genre"
        ? (track.artistGenres?.[0] || "Outros")
        : (track.day || track.artist);

      if (group !== lastGroup) {
        lastGroup = group;
        const sep = document.createElement("div");
        sep.className = "track-group-label";
        sep.textContent = group;
        dom.playlistTracks.appendChild(sep);
      }
    }

    const item = document.createElement("div");
    item.className = "track-item";
    item.setAttribute("role", "listitem");
    item.style.animationDelay = `${Math.min(idx * 25, 600)}ms`;

    const thumbHTML = track.thumbnail
      ? `<img class="track-thumb" src="${track.thumbnail}" alt="${escapeHtml(track.name)}" loading="lazy" />`
      : `<div class="track-thumb-placeholder" aria-hidden="true">🎵</div>`;

    const playBtn = track.previewUrl
      ? `<button class="btn-play" data-preview="${track.previewUrl}" data-id="${track.id}" title="Ouvir prévia" aria-label="Ouvir prévia de ${escapeHtml(track.name)}">▶</button>`
      : `<button class="btn-play" disabled title="Sem prévia disponível" aria-label="Sem prévia">—</button>`;

    item.innerHTML = `
      <span class="track-num" aria-label="Faixa ${idx + 1}">${idx + 1}</span>
      ${thumbHTML}
      <div class="track-info">
        <div class="track-name">${escapeHtml(track.name)}</div>
        <div class="track-artist">${escapeHtml(track.artist)}</div>
        <div class="popularity-bar" title="Popularidade: ${track.popularity}%">
          <div class="popularity-fill" style="width:${track.popularity}%"></div>
        </div>
      </div>
      <div class="track-actions">${playBtn}</div>
    `;

    dom.playlistTracks.appendChild(item);
  });

  // Eventos de play
  $$(".btn-play:not([disabled])", dom.playlistTracks).forEach((btn) => {
    btn.addEventListener("click", () => playPreview(btn));
  });
}

/* ══════════════════════════════════════════════
   PREVIEW DE ÁUDIO
══════════════════════════════════════════════ */
function playPreview(btn) {
  const url = btn.dataset.preview;
  const audio = dom.previewAudio;

  // Mesma faixa — toggle pause/play
  if (state.currentPlayingBtn === btn) {
    if (audio.paused) {
      audio.play();
      btn.textContent = "⏸";
      btn.classList.add("is-playing");
    } else {
      audio.pause();
      btn.textContent = "▶";
      btn.classList.remove("is-playing");
    }
    return;
  }

  // Nova faixa
  if (state.currentPlayingBtn) {
    state.currentPlayingBtn.textContent = "▶";
    state.currentPlayingBtn.classList.remove("is-playing");
  }

  audio.src = url;
  audio.play().catch(() => showToast("Não foi possível tocar a prévia.", "warn"));
  btn.textContent = "⏸";
  btn.classList.add("is-playing");
  state.currentPlayingBtn = btn;

  audio.onended = () => {
    btn.textContent = "▶";
    btn.classList.remove("is-playing");
    state.currentPlayingBtn = null;
  };
}

/* Modal de prévia completa */
dom.playPreviewBtn.addEventListener("click", () => {
  if (state.generatedTracks.length === 0) return;

  const trackables = state.generatedTracks.filter((t) => t.previewUrl);
  if (trackables.length === 0) {
    showToast("Nenhuma prévia disponível para esta playlist.", "info");
    return;
  }

  dom.modalBody.innerHTML = trackables
    .slice(0, 20)
    .map(
      (t) => `
    <div class="preview-track" data-url="${t.previewUrl}" role="button" tabindex="0" aria-label="Tocar prévia de ${escapeHtml(t.name)}">
      <div class="track-thumb-placeholder" aria-hidden="true">🎵</div>
      <div class="preview-track-info">
        <div class="preview-track-name">${escapeHtml(t.name)}</div>
        <div class="preview-track-artist">${escapeHtml(t.artist)}</div>
      </div>
      <span style="font-size:0.8rem;color:var(--clr-text-3)">▶</span>
    </div>
  `
    )
    .join("");

  $$(".preview-track", dom.modalBody).forEach((row) => {
    const handler = () => {
      dom.previewAudio.src = row.dataset.url;
      dom.previewAudio.play().catch(() => {});
      $$(".preview-track", dom.modalBody).forEach((r) =>
        r.querySelector("span").textContent = "▶"
      );
      row.querySelector("span").textContent = "⏸";
    };
    row.addEventListener("click", handler);
    row.addEventListener("keydown", (e) => { if (e.key === "Enter") handler(); });
  });

  dom.previewModal.classList.remove("hidden");
  dom.modalClose.focus();
});

dom.modalClose.addEventListener("click", closeModal);
dom.previewModal.addEventListener("click", (e) => {
  if (e.target === dom.previewModal) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !dom.previewModal.classList.contains("hidden")) closeModal();
});

function closeModal() {
  dom.previewModal.classList.add("hidden");
  dom.previewAudio.pause();
  if (state.currentPlayingBtn) {
    state.currentPlayingBtn.textContent = "▶";
    state.currentPlayingBtn.classList.remove("is-playing");
    state.currentPlayingBtn = null;
  }
}

/* ══════════════════════════════════════════════
   EXPORTAR PARA O SPOTIFY
══════════════════════════════════════════════ */
dom.exportSpotifyBtn.addEventListener("click", exportToSpotify);

async function exportToSpotify() {
  showToast(
    "Para criar playlists, o Spotify exige Authorization Code Flow com login do usuário. " +
    "Abra spotify-test.js para ver como configurar.",
    "info",
    8000
  );
  // Em uma implementação completa com backend ou PKCE:
  // 1. Redirecionar para getAuthorizationURL()
  // 2. Trocar code por access_token
  // 3. POST /v1/users/{user_id}/playlists
  // 4. POST /v1/playlists/{id}/tracks
}

/* ══════════════════════════════════════════════
   COPIAR LISTA DE MÚSICAS
══════════════════════════════════════════════ */
dom.copyTracksBtn.addEventListener("click", async () => {
  if (state.generatedTracks.length === 0) return;

  const text = state.generatedTracks
    .map((t, i) => `${i + 1}. ${t.artist} — ${t.name}`)
    .join("\n");

  try {
    await navigator.clipboard.writeText(text);
    showToast("Lista copiada para a área de transferência!", "success");
  } catch {
    showToast("Não foi possível copiar. Tente manualmente.", "warn");
  }
});

/* ══════════════════════════════════════════════
   RECOMEÇAR
══════════════════════════════════════════════ */
dom.restartBtn.addEventListener("click", () => {
  state.uploadedImage = null;
  state.extractedArtists = [];
  state.selectedArtists.clear();
  state.generatedTracks = [];
  state.currentAudio = null;

  dom.previewAudio.pause();
  dom.previewAudio.src = "";

  dom.fileInput.value = "";
  dom.manualArtists.value = "";
  dom.playlistNameInput.value = "Festival Mix";

  const preview = dom.uploadArea.querySelector(".upload-preview");
  if (preview) preview.remove();

  showStep("step-upload");
  dom.exportSpotifyBtn.disabled = !state.isSpotifyConnected;
  showToast("Pronto para um novo festival!", "info");
});

/* ══════════════════════════════════════════════
   NAVEGAÇÃO ENTRE STEPS
══════════════════════════════════════════════ */
function showStep(stepId) {
  const steps = ["step-upload", "step-artists", "step-filters", "step-playlist"];
  steps.forEach((id) => {
    const el = $(`#${id}`);
    if (id === stepId) {
      el.classList.remove("hidden");
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      // Mantém steps anteriores visíveis, oculta os posteriores
      const currentIndex = steps.indexOf(stepId);
      const thisIndex = steps.indexOf(id);
      if (thisIndex > currentIndex) {
        el.classList.add("hidden");
      }
    }
  });
}

/* ══════════════════════════════════════════════
   UTILITÁRIOS
══════════════════════════════════════════════ */
function setButtonLoading(btn, loading) {
  if (loading) {
    btn.classList.add("is-loading");
    btn.disabled = true;
  } else {
    btn.classList.remove("is-loading");
    btn.disabled = false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ══════════════════════════════════════════════
   INICIALIZAÇÃO
══════════════════════════════════════════════ */
function init() {
  initTheme();

  // Verifica se credenciais estão configuradas
  if (
    typeof SPOTIFY_CONFIG !== "undefined" &&
    SPOTIFY_CONFIG.CLIENT_ID !== "SEU_CLIENT_ID_AQUI"
  ) {
    // Auto-conecta se as credenciais parecem válidas
    connectSpotify().catch(() => {});
  }

  showStep("step-upload");
}

init();
