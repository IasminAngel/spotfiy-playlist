/**
 * spotify-test.js
 * ─────────────────────────────────────────────────────────────
 * Insira suas credenciais do Spotify abaixo.
 *
 * Como obter suas credenciais:
 *   1. Acesse https://developer.spotify.com/dashboard
 *   2. Crie um novo App (ou use um existente)
 *   3. Copie o Client ID e o Client Secret para as variáveis abaixo
 *   4. Em "Redirect URIs", adicione: http://localhost:5500/callback
 *      (ou a URL onde você está rodando a aplicação)
 *
 * ATENÇÃO: Nunca suba este arquivo para repositórios públicos
 *          com suas credenciais preenchidas.
 * ─────────────────────────────────────────────────────────────
 */

const SPOTIFY_CONFIG = {
  // Substitua pelos seus valores reais:
  CLIENT_ID: "932936e8cba74240885cda918f3f96f4",
  CLIENT_SECRET: "908293c77747491a8db63443feb32a53",

  // Scopes necessários para a aplicação
  SCOPES: [
    "playlist-modify-public",
    "playlist-modify-private",
    "user-read-private",
    "user-read-email",
  ].join(" "),

  // URI de redirecionamento cadastrada no Spotify Dashboard
  REDIRECT_URI: "http://localhost:3000/callback",
};

/**
 * Obtém um token via Client Credentials Flow (server-side / sem login do usuário).
 * Útil para buscar informações públicas de artistas e faixas.
 *
 * ⚠️  Não exponha CLIENT_SECRET em produção — use um backend proxy.
 */
async function getClientCredentialsToken() {
  const credentials = btoa(
    `${SPOTIFY_CONFIG.CLIENT_ID}:${SPOTIFY_CONFIG.CLIENT_SECRET}`
  );

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Spotify Auth Error: ${err.error} — ${err.error_description}`);
  }

  const data = await response.json();
  console.log("✅ Token obtido com sucesso:", data.access_token.slice(0, 20) + "...");
  console.log("⏱  Expira em:", data.expires_in, "segundos");
  return data.access_token;
}

/**
 * Gera a URL de autorização para o Authorization Code Flow (com login do usuário).
 * Necessário para criar/modificar playlists em nome do usuário.
 */
function getAuthorizationURL() {
  const params = new URLSearchParams({
    client_id: SPOTIFY_CONFIG.CLIENT_ID,
    response_type: "code",
    redirect_uri: SPOTIFY_CONFIG.REDIRECT_URI,
    scope: SPOTIFY_CONFIG.SCOPES,
    show_dialog: "true",
  });

  const url = `https://accounts.spotify.com/authorize?${params.toString()}`;
  console.log("🔗 URL de autorização:", url);
  return url;
}

// Exporta para uso no app principal (quando usado como módulo)
if (typeof module !== "undefined") {
  module.exports = { SPOTIFY_CONFIG, getClientCredentialsToken, getAuthorizationURL };
}
