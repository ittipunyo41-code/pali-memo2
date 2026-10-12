# Pali Memorize Vue

A Vue 3 + TypeScript app built with Vite and deployed to GitHub Pages using GitHub Actions.

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
