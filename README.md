# Velin

Edit PDFs right in your browser. Nothing ever leaves your device.

Velin is a client-side PDF editor. Every operation — removing pages, adding
text, signing, drawing — runs entirely in your browser. No uploads, no servers,
no accounts. The file you open never touches a network.

## Features

- **Organize pages** — remove, reorder (drag), rotate, and extract pages.
- **Add text** — click anywhere to type, with font, size, and color controls.
- **Sign** — draw a signature or upload an image; reuse saved signatures.
- **Draw** — freehand pen with color and stroke-width options.
- **Export** — download your edited PDF, flattened and ready to share.
- **Private by design** — 100% client-side. Your document stays on your machine.

## Tech

- [Next.js](https://nextjs.org) (App Router) + TypeScript
- [Tailwind CSS](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com)
- [PDF.js](https://mozilla.github.io/pdf.js/) for rendering, [pdf-lib](https://pdf-lib.js.org) for writing
- [Zustand](https://zustand-demo.pmnd.rs) for state, [Vitest](https://vitest.dev) for tests

## Getting started

```bash
pnpm install
pnpm dev
```

Then open the local URL printed in the terminal.

## Scripts

```bash
pnpm dev     # start the dev server
pnpm build   # production build
pnpm test    # run the test suite
pnpm lint    # lint
```

## How it works

PDF.js renders each page to a canvas for display. Edits are kept as an
annotation layer (text, signatures, ink) in points relative to the unrotated
page, so zoom and rotation never mutate stored data. On export, pdf-lib copies
the retained pages in order, applies rotation, and draws the annotations —
producing a fresh PDF entirely in the browser.

## License

MIT
