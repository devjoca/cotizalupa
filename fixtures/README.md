# Synthetic test documents

`valid-tiny.jpg` is a tiny synthetic JPEG. Everything else is generated in memory
by the Go tests (`api/internal/app/testsupport_test.go`): one-page and multi-page PDFs,
PNGs, and the malformed or oversized variants. No customer original belongs here.

The validation tests run without calling any model and cover the mechanical
limits: file count, total size, page count, MIME mismatch, and image dimensions.
The order-flow tests use synthetic documents to verify that no analysis runs
before payment and that a paid order ends in a persisted report.

There is no paid eval runner. Review a few model-generated reports manually
before selling. Add synthetic equivalents of useful failure cases to the Go tests;
never copy customer originals here.
