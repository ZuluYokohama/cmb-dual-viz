# Public website (GitHub Pages)

Representational boundary-layer site — a normal page an outsider can read.
Not a console / HUD / operational cockpit. Controls stay in the live engine.

## Enable Pages

Settings → Pages → Deploy from a branch → **`main`** → Folder **`/docs`** → Save.

URL: https://zuluyokohama.github.io/cmb-dual-viz/

## Files

| Path | Role |
|------|------|
| `index.html` | Public site shell |
| `styles.css` | Layout / typography |
| `app.js` | Light parallax only |
| `asset-*.js` / `asset-data.js` | Art embeds (hydrate `<img>`) |

Lab markdown (`CAPABILITIES_BRIEFING.md`, etc.) lives alongside; `index.html` is the site root.
