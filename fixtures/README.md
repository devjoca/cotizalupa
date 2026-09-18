# Synthetic analysis cases

`analysis.ts` generates PDFs in memory: normal quotation, missing price, options,
annex, multiple quotations, invoice, empty/unreadable input, ten-page quotation,
two providers in separate files, and an invoice containing prompt injection.
These replace the previously listed but absent eight PDFs. They are deliberately
simple synthetic cases, not a claim of real-world OCR or report-quality coverage.

`pnpm test tests/validation.test.ts` validates every generated file locally
without calling AI. The order-flow tests also use a synthetic invoice to verify
post-payment failure and manual-refund bookkeeping.

There is no paid eval runner. Review a few model-generated reports manually
before selling. Add synthetic equivalents of useful failure cases to tests;
never copy customer originals here.
