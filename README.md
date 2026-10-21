# Pali Memorize Vue

A Vue 3 + TypeScript app built with Vite and deployed to GitHub Pages using GitHub Actions.

## Features

- **Choose which words to hide** – open the "เลือกคำที่ซ่อน" tab, then click/tap words (or drag across several), toggle a whole line with the ◐ button, invert / clear / hide all, or pick a random 25–100 %. Undo with the button or `Ctrl+Z`. Optionally apply a choice to every repeated word at once.
- **Practice tab** – the hidden words become blanks; reveal by click/tap, arrow keys, `Shift+C`, `Delete`/`Backspace`.
- **My passages** – paste any text, choose the hidden words and save it as "บทของฉัน" (stored with the selection).
- **Auto-save** – text, hidden words, theme, font size and saved passages are kept in `localStorage`, so everything survives a reload and works offline.
- **Export HTML** – downloads a single offline file containing the current selection.

## Offline / PWA

`vite build` emits `dist/sw.js` (from `sw-template.js`) which precaches every built file, so the app opens offline after the first visit. After deploying a new build, reload once to pick up the new service worker.

## Features

- **Choose which words to hide** – open the "เลือกคำที่ซ่อน" tab, then click/tap words (or drag across several), toggle a whole line with the ◐ button, invert / clear / hide all, or pick a random 25–100 %. Undo with the button or Ctrl+Z. Optionally apply a choice to every repeated word at once.
- **Practice tab** – the hidden words become blanks; reveal by click/tap, arrow keys, Shift+C, Delete/Backspace.
- **My passages** – paste any text, choose the hidden words and save it as "บทของฉัน" (stored together with the selection).
- **Auto-save** – text, hidden words, theme, font size and saved passages are kept in localStorage, so everything survives a reload and works offline.
- **Export HTML** – downloads a single offline file containing the current selection.

## Offline / PWA

vite build emits dist/sw.js (from sw-template.js), which precaches every built file, so the app opens offline after the first visit. After deploying a new build, reload once to pick up the new service worker.

## GitHub Pages deployment

The workflow at `../.github/workflows/deploy.yml` installs dependencies and builds the site from `vue-project/` whenever a commit is pushed to `main`. It then publishes `vue-project/dist` to GitHub Pages. You can also start it manually from the repository's **Actions** tab.

To enable deployment in GitHub:

1. Open the repository's **Settings → Pages**.
2. Set **Build and deployment → Source** to **GitHub Actions**.
3. Push a commit to `main`, or run **Deploy to GitHub Pages** from the **Actions** tab.

The site URL is `https://ittipunyo41-code.github.io/pali-memorize-vue/`.

## Local development

Run these commands from this directory (`vue-project/`):

```sh
npm ci
npm run dev
```

To run the same checks and production build as the workflow:

```sh
npm run build
npm run preview
```

The production build uses the repository subpath when running in GitHub Actions so assets load correctly on GitHub Pages. Local builds use a relative asset base.
