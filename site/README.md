# Landing page (GitHub Pages)

Static cosmic landing for **CMB Dual-Thread Engine**. Pure HTML/CSS/JS — no React build.

## Files

| File | Role |
|------|------|
| `index.html` | Landing markup |
| `styles.css` | Deep-space / CMB accent styles |
| `app.js` | Animated Mollweide-ish canvas |

## Enable GitHub Pages

1. Open the repo on GitHub → **Settings** → **Pages**.
2. Under **Build and deployment** → **Source**, choose **Deploy from a branch**.
3. Branch: **`main`** · Folder: **`/site`**.
4. Save. After the Pages workflow finishes, the site is at:

   `https://<user>.github.io/cmb-dual-viz/`

   (or the custom domain you configure).

> Stick with **`/site`**. Do not point Pages at `/docs` for this landing — project assurance docs live under `docs/` and are not the public landing root.

## Local preview

```bash
cd site
python3 -m http.server 8080
# open http://localhost:8080
```

Or open `index.html` directly in a browser (canvas and relative CSS/JS still work).

## Links

- Repo: https://github.com/ZuluYokohama/cmb-dual-viz
- Capabilities briefing: https://github.com/ZuluYokohama/cmb-dual-viz/blob/main/docs/CAPABILITIES_BRIEFING.md
- License: **Zulu Research-Only** © 2026 ZuluYokohama (`LicenseRef-Zulu-Research-Only`) — see [`../LICENSE`](../LICENSE)
