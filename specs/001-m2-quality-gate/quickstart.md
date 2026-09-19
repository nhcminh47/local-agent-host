# Quickstart: M2 Quality-Gate Delivery

This is an execution guide for a later authorized implementation turn. It does not authorize M3 capabilities or analyzed-repository command execution.

## 1. Review requirements

Review [spec.md](spec.md), [plan.md](plan.md), and [checklists/requirements.md](checklists/requirements.md). Resolve any reopened checklist item before implementation.

## 2. Implement by task phase

Follow [tasks.md](tasks.md) in dependency order. Keep each implementation run bounded to one phase or a small task range.

## 3. Run deterministic validation

After relevant changes and only when repository gates authorize execution:

```text
pnpm check
pnpm test
pnpm m1:smoke
pnpm m2:smoke:mcp
```

Record the actual Node and pnpm versions. Do not report wrapper results as pinned-toolchain results if versions differ.

## 4. Freeze qualification inputs

Before the first live run, record:

- source revision and result-contract/prompt version
- fixed target commit and five acceptance cases
- model name and digest
- context and output settings
- case deadline, turn budget, and tool budget

Do not change any frozen field between the qualifying run and confirmation run.

## 5. Run and review acceptance

Run `pnpm m2:acceptance` with the existing local endpoint configuration. Raw machine-specific output stays under ignored `.local/`. Review every finding against its excerpt and requested-fact rubric. A missing review is a failure.

Repeat once without changes. Both runs must pass 5/5 and preserve every measured repository dimension.

## 6. Record evidence

Create a dated report under `docs/`, update `docs/m2-status.md`, and keep Windows SDK and native Cursor/macOS evidence separate. Do not enable M3 until all required M2 gates are accepted.
