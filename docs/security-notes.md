## 2026-03-28 — dompurify moderate XSS (GHSA-h8r8-wccr-v5f2, GHSA-v2wj-7wpq-c8vv)
- Package: dompurify@3.2.7 via monaco-editor@0.55.1 via @monaco-editor/react@4.7.0
- Fix: not available upstream — monaco has not shipped dompurify >=3.3.2 yet
- Risk: low — monaco editor runs in authenticated admin dashboard only
- Action: revisit when monaco-editor@0.56+ releases with patched dompurify
