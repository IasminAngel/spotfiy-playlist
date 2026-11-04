# 🎪 Festival Playlist Generator

Gera playlists do Spotify automaticamente a partir de cartazes de festivais de música.

## Como usar

### 1. Configure as credenciais do Spotify

Abra `spotify-test.js` e preencha:

```js
CLIENT_ID: "seu_client_id_aqui",
CLIENT_SECRET: "seu_client_secret_aqui",
```

> Obtenha em: https://developer.spotify.com/dashboard → Crie um App → copie Client ID e Client Secret.

### 2. Abra a aplicação

Abra `index.html` em um servidor local (não funciona como `file://` por causa do CORS do Spotify).

Opção rápida com VS Code: instale a extensão **Live Server** e clique em "Go Live".

Ou via terminal:
```bash
npx serve .
# acesse http://localhost:3000
```

### 3. Fluxo da aplicação

| Step | O que fazer |
|------|-------------|
| 01 | Faça upload do cartaz ou cole os artistas manualmente |
| 02 | Selecione os artistas desejados |
| 03 | Configure quantidade de músicas e ordenação |
| 04 | Ouça prévias e exporte a lista |

## Funcionalidades

- Upload de imagem com drag & drop + simulação de OCR
- Input manual de artistas (um por linha)
- Integração com a API do Spotify (Client Credentials Flow)
- 3, 5 ou 10 músicas por artista
- Ordenação por popularidade, gênero, dia do evento ou aleatório
- Prévias de 30s das músicas
- Copiar lista de faixas
- Suporte a tema escuro/claro
- **Modo demo** automático quando as credenciais não estão configuradas

## Estrutura

```
festival-playlist/
├── index.html       — Estrutura da aplicação
├── styles.css       — Estilos com tema escuro/claro
├── app.js           — Lógica principal
└── spotify-test.js  — Configuração de credenciais do Spotify
```

## Notas de segurança

- Nunca suba `spotify-test.js` com suas credenciais para repositórios públicos
- O `CLIENT_SECRET` não deve ficar exposto em produção — use um backend proxy ou PKCE Flow
- Para criar playlists reais no Spotify, é necessário o Authorization Code Flow com login do usuário
# spotfiy-playlist
