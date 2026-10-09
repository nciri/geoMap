# Map assets

Copied from https://github.com/protomaps/basemaps-assets at commit
028c18f713baecad011301ff7a69acc39bcc2ae7 so the app never fetches them from the Internet.

- `fonts/<stack>/<range>.pbf`: Noto Sans glyphs, ranges 0-255, 256-511, 8192-8447.
- `sprites/v4/light*`, `sprites/v4/dark*`: Protomaps light and dark sprites.

Licences: `fonts/OFL.txt` (SIL Open Font License, covers the Noto Sans glyphs) was found next to
the font stacks and copied here. No licence or notice file was found anywhere under `sprites/`
in that repository (checked `sprites/`, `sprites/v3/`, `sprites/v4/` via the GitHub contents
API) — ledgered for legal review, same status as the mil-sym licence point in the spec. Update
all files together when upgrading `@protomaps/basemaps`; `src/map/style.test.ts` fails if a
style needs a font missing here.
