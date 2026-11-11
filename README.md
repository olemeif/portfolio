# olemeif.de

Source of my personal site: a single static page with a radar/tracker animation and links to my profiles, in English (`/en/`) and German (`/`).
Built with [Astro](https://astro.build).

## Privacy

- No cookies, no analytics, no tracking.
- No third-party requests: fonts are system fonts, icons are inline, and all
  scripts and styles are served from this site.
- Links to other websites ask before they open.

The only thing the server sees is what any web server sees: the request itself (IP address, time, page, browser).

## Develop

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # static output in dist/
npm run icons      # re-render favicon PNGs and the share image from SVG
```

Personal details (name, email, links, Impressum address) live in `src/data/site.ts`.
The page is `src/components/Radar.astro`, the animation is `src/scripts/radar.js`.

## Deploy

The public site at olemeif.de is hosted on GitHub Pages.
A development copy runs on a Raspberry Pi in my home network.

### GitHub Pages (production)

Every push to `main` builds and publishes the site through `.github/workflows/deploy.yml`.
