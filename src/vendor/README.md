# Vendored code — do not edit here

`oauth2-authorization-server.js` and its `.test.js` are byte-for-byte copies of
[`mcp-development/shared/`](https://github.com/DavidWinterbottom-2/mcp-development/tree/main/shared)
at commit **279507d** (approval password on consent, #43; PKCE S256 required,
#44). They are kept verbatim so a later re-copy is a plain `cp` with no
merge, which is also why the source commit is recorded here and not in a
header comment inside the files.

To update: fix it in mcp-development first, then copy both files over these
and update the commit above, then regenerate `SHA256SUMS` (`sha256sum oauth2-* > SHA256SUMS`; `test/vendor.test.js` fails on any other edit). The vendored test runs with `npm run test:vendor`
(it uses `node:test`, not vitest).
