# Shared package build for treed-front

OWNS: packages/printer-logic/dist/**

User approved package-only build/pack/local offline install, no frontend build.
Source dev HEAD must remain 4b3a12ace75d926bd0463444ff49a37530219fd4.
Contract: G:/GitHub/treed-front/.unlazy/autoprinter-front/CONTRACT.md revision 2.

- [x] G1: Generated package includes AutoPrinter entrypoint from exact canonical source and no source/version edits.
  EVIDENCE: User-approved package-only tsc exit 0 at dev 4b3a12ace75d926bd0463444ff49a37530219fd4. Offline pnpm pack produced pinned frontend vendor tarball; ESM and TypeScript resolution smoke passed. Parent verified SHA256 and lock integrity; independent review found no material package/metadata issue. Source and version unchanged; only ignored generated dist remains for local development.
