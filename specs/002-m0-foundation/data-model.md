# Data Model: M0 Compatibility Foundation

M0 has no durable production task lifecycle. Probe and evaluation results are JSON observations. Coding fixtures are in `src/diagnostics/compatibility/coding-fixtures.ts`; the evaluator owns transient source/test files and removes its temporary directory. SQLite tests exercise WAL, transactions and reopen independently of the later task store.
