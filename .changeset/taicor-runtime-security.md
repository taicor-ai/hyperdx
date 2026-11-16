---
'@hyperdx/api': patch
'@hyperdx/app': patch
'@hyperdx/common-utils': patch
---

Update production runtime dependencies and the Node image to include security
fixes.

Backport Zod's
[upstream collection size guard](https://github.com/colinhacks/zod/commit/a0ebf97)
to the application interface and bundled Zod 4 compatibility module in Zod
3.25.76 using Yarn patches. Oversized constrained arrays and sets now stop
before element validation. Zod 3 has no bounded map API. The package version
remains unchanged, so version-based scanners continue reporting
GHSA-mrhx-c7xc-m3w5; no finding is suppressed. Remove the patch when the
application migrates to a supported patched Zod release.
