# Host Bootstrap & Workspace Trust

Status: **Planned**

Date: **2026-09-21**

## 1. Purpose

This milestone introduces a first-run bootstrap workflow and per-workspace trust model for `local-agent-host`.

The host should be installable once at user scope, then reusable across many repositories without requiring every repository to be pre-registered during installation. Repository access should instead be authorized on first use, similar to the "Trust this workspace?" flow used by developer tools.

The milestone separates three concerns that must not be conflated:

1. **User-level installation** — configure the host, main MCP client, provider, secrets and daemon runtime once.
2. **Workspace trust** — authorize a specific canonical repository root when it is first used.
3. **Capability elevation** — grant additional side-effect capabilities later, such as editing or running configured verification, without making read trust equivalent to permanent full access.

The current M2 read-only trust model remains authoritative until this milestone is implemented and qualified.

## 2. Goals

### G1. Provide an interactive bootstrap command

A freshly cloned host should support a single guided command:

```text
pnpm bootstrap
```

The bootstrap command should inspect the environment, ask only for missing or ambiguous choices, write user-local configuration safely, validate the resulting setup and print a concise readiness summary.

The expected first-run experience is conceptually:

```text
Local Agent Host Bootstrap

✓ Node runtime supported
✓ pnpm supported
✓ Git available

? Main coding agent / MCP client
  Cursor
  Claude Code
  Codex
  GitHub Copilot
  Generic MCP client

? Inference provider
  Ollama

? Provider endpoint
  http://127.0.0.1:11435

✓ Provider reachable

? Worker model
  qwen3:8b
  ...

✓ IPC credential generated
✓ User-level MCP integration configured
✓ Host state directory initialized
✓ Readiness checks passed

Local Agent Host is ready.
```

The exact UI library is an implementation detail. The workflow must remain scriptable and testable.

### G2. Install MCP integration at user scope

Bootstrap should configure the selected MCP client once at user level where the client supports it.

The generated client integration should contain only the information needed to start or connect to `local-agent-host`. It must not embed repository-specific trust decisions.

Client-specific setup belongs behind a small adapter boundary rather than leaking client conditionals throughout daemon/runtime code.

Conceptual structure:

```text
Bootstrap
  ├─ Cursor adapter
  ├─ Claude Code adapter
  ├─ Codex adapter
  ├─ GitHub Copilot adapter
  └─ Generic MCP instructions/adapter
          ↓
      MCP bridge
          ↓
      same daemon/runtime
```

A selected "main agent" affects installation/integration behavior only. It must not change task policy, repository trust rules, tool authority, provider semantics or durable task behavior.

### G3. Replace static pre-registration UX with first-use workspace trust

A user should not have to enumerate all repositories during bootstrap.

When a task first targets an untrusted workspace, the host should require an explicit trust decision before repository content is exposed to inference.

Conceptual prompt:

```text
Workspace
/Users/minh/projects/example

local-agent-host has not been authorized for this workspace.

[ Trust once ]
[ Always trust this workspace ]
[ Deny ]
```

The runtime may retain the existing internal repository registry abstraction, but its durable source should evolve from a manually maintained static mapping toward a trusted-workspace store populated through explicit authorization.

### G4. Scope trust by capability

Workspace trust must not mean "all future powers forever".

At minimum, the authorization model should distinguish:

```text
read
edit
verify/run-approved-commands
```

M2 needs only `read` authorization.

M3 can request elevation when an implementation task needs editing or approved verification commands. A workspace previously trusted for reading must still require the relevant additional grant before side effects are allowed.

### G5. Preserve a fail-closed security model

No repository path should become trusted because it appeared in model output or an arbitrary MCP request.

Trust must be a host/user decision tied to a canonical workspace identity.

## 3. Non-goals

This milestone does **not** add:

- repository editing tools;
- `implement_task`;
- `verify_task`;
- arbitrary shell execution;
- automatic test execution;
- automatic Git commit/push/merge/PR behavior;
- remote multi-user authorization;
- team/shared trust policies;
- a graphical desktop application;
- automatic model downloads;
- automatic firewall/network changes;
- automatic installation of unsupported third-party MCP clients;
- vector indexing or context compaction work from M2.5.

M2 remains read-only. M3 side effects still require their own implementation and safety gates.

## 4. Bootstrap command surface

### 4.1 Primary command

```text
pnpm bootstrap
```

Behavior:

1. detect the host platform and supported runtime versions;
2. locate or validate required executables;
3. identify existing user configuration;
4. ask for missing setup decisions;
5. configure the selected MCP client at user scope where supported;
6. configure inference provider details;
7. discover provider models when supported;
8. generate/store host IPC credentials safely;
9. initialize local state/config paths;
10. run readiness validation;
11. print a sanitized summary and next steps.

### 4.2 Reconfiguration

```text
pnpm bootstrap --reconfigure
```

Allows changing setup decisions such as:

- main MCP client;
- provider endpoint;
- worker model;
- client integration target;
- runtime preferences that are safe to change.

Reconfiguration must preserve unrelated trusted workspaces and durable task data unless the user explicitly requests reset/removal.

### 4.3 Non-interactive validation

```text
pnpm bootstrap --check
```

Runs configuration/readiness checks without prompting or mutating configuration.

This is suitable for troubleshooting and automated environments.

The existing `pnpm doctor` may reuse lower-level checks, but bootstrap and doctor have different product semantics:

- `bootstrap` installs/configures;
- `doctor` diagnoses an already configured environment.

## 5. User-local state

Bootstrap-generated host state should live outside the cloned source repository by default.

Suggested platform locations:

```text
macOS/Linux
~/.local-agent-host/

Windows
%LOCALAPPDATA%\local-agent-host\
```

Exact paths may follow platform conventions during implementation.

Conceptual layout:

```text
local-agent-host/
  config.json
  trusted-workspaces.json
  secrets / credential storage
  tasks.db
  runtime state
```

Requirements:

1. Re-cloning or upgrading the source repo must not erase user setup.
2. Secrets must not be committed with the source repository.
3. Printed reports must redact credentials.
4. User-local state should use restrictive file permissions where the platform supports them.
5. Schema versioning is required for durable configuration/trust files.

## 6. Main MCP client adapters

Suggested ownership:

```text
src/bootstrap/client-adapters/
```

Conceptual interface:

```ts
interface McpClientAdapter {
  readonly id: string;
  detect(): Promise<ClientDetection>;
  inspectUserConfig(): Promise<ClientConfigState>;
  installOrUpdate(input: ClientInstallInput): Promise<ClientInstallResult>;
  validate(): Promise<ClientValidationResult>;
}
```

Adapters should own client-specific paths and configuration formats.

Daemon, task services, explorer and repository policy must not depend on the selected client.

### Safe configuration mutation

If a client configuration file already exists:

- parse it using the appropriate format;
- update only the `local-agent-host` entry or equivalent;
- preserve unrelated user configuration;
- create a recoverable backup where appropriate;
- fail safely when the existing configuration cannot be parsed;
- never overwrite the whole configuration blindly.

When automatic installation is not supported reliably for a client, bootstrap should print exact manual instructions rather than guessing paths or formats.

## 7. Provider setup

M2 currently requires Ollama as the supported live explorer provider. Bootstrap should implement provider setup through an abstraction that can later support additional providers without changing workspace-trust semantics.

Suggested questions for Ollama:

```text
Provider endpoint
Authentication, if required
Worker model
Context/generation profile if explicitly configurable
```

Where supported, bootstrap should discover available models rather than force the user to type an exact model identifier.

Provider validation should distinguish:

```text
configured
reachable
credential_valid
model_available
```

No model should be downloaded automatically unless a later milestone explicitly adds that capability and obtains user confirmation.

## 8. Workspace identity

Trust decisions must use a host-derived canonical identity, not an arbitrary path string supplied by the model.

At authorization time, the host should derive at least:

- canonical real path;
- repository top-level path;
- Git repository validity;
- optional filesystem/repository identity metadata useful for detecting replacement;
- current trust grants.

The path must be normalized and symlinks resolved before durable trust is stored.

A workspace path that later resolves to a different repository identity should not silently inherit old trust when the host has reliable evidence of replacement.

The exact repository identity strategy should be documented during implementation. Avoid relying only on repository name or remote URL, because both may be absent or mutable.

## 9. Trust decisions

### 9.1 Trust once

`Trust once` grants the requested capability for the current trusted runtime/session only.

It must not create a durable workspace grant.

A daemon restart may require authorization again unless a more precise session design is explicitly implemented and tested.

### 9.2 Always trust this workspace

Persists the selected capability grant for the canonical workspace identity.

For M2, this means durable read authorization.

### 9.3 Deny

Rejects the attempted task without exposing repository content to the provider.

Deny should not become a permanent ban unless the user explicitly selects a future "always deny" feature.

### 9.4 Revocation

The milestone must provide a way to inspect and revoke durable trust grants, even if the first implementation is CLI-only.

Conceptual commands:

```text
pnpm host workspace list
pnpm host workspace revoke <workspace-id>
```

Exact command names may change during implementation.

## 10. Where the trust prompt lives

The authorization decision must remain human-controlled.

MCP/model output cannot itself approve trust.

Because stdio MCP does not guarantee a portable interactive permission UI across every client, implementation should define a host-owned authorization channel rather than assuming the model can ask and answer its own permission request.

Acceptable first implementation options include:

- an interactive host CLI authorization flow;
- a bootstrap/host process terminal prompt when a local interactive terminal is available;
- a small explicit `trust_workspace` management command initiated by the user after the MCP result reports `WORKSPACE_TRUST_REQUIRED`.

Client-native approval UI can be added later where reliably supported.

The task/MCP result should expose a bounded required-action object when authorization is missing, for example:

```json
{
  "code": "WORKSPACE_TRUST_REQUIRED",
  "workspaceDisplayPath": "/Users/minh/projects/example",
  "capability": "read"
}
```

It must not include a secret token that lets the model authorize itself.

## 11. Internal trust model

Conceptual schema:

```ts
type WorkspaceCapability = 'read' | 'edit' | 'verify';

type WorkspaceGrant = {
  schemaVersion: 1;
  workspaceId: string;
  canonicalRoot: string;
  grantedCapabilities: WorkspaceCapability[];
  createdAt: string;
  updatedAt: string;
  identity?: {
    gitDirFingerprint?: string;
    filesystemIdentity?: string;
  };
};
```

The exact persisted fields may differ, but requirements are:

- capability grants are explicit;
- grants are host-generated and host-validated;
- unknown fields fail validation;
- paths are canonicalized before lookup;
- `edit`/`verify` are not implied by `read`;
- model/tool requests cannot mutate trust state.

## 12. Repository discovery on first use

The MCP client should be able to indicate the current workspace candidate using a client/bridge-owned mechanism, but the host must validate it independently.

Potential sources include:

- bridge process working directory;
- explicit client-provided workspace metadata if a supported client exposes it reliably;
- user-selected path through a host management command.

Do not assume `process.cwd()` is always the intended workspace across every MCP client.

Implementation must qualify each supported main-agent adapter and document how it determines the candidate workspace.

If the host cannot determine the workspace unambiguously, it should return a required action instead of guessing.

## 13. Interaction with the existing RepoRegistry

The current registry remains useful as an internal boundary:

```text
trusted workspace
       ↓
resolved host-owned registration
       ↓
RepoRegistry / snapshot admission
       ↓
GitSnapshotTools
```

The architectural change is that users no longer need to maintain a static `repos.json` as the primary onboarding experience.

A durable trusted-workspace service can resolve an authorized workspace into the host-owned repository registration needed by snapshot admission.

`repoId` may remain an internal/task protocol identifier, but normal users should not need to invent repository IDs during bootstrap.

## 14. Capability elevation for M3

This milestone should establish the data model and flow, but M2 only exercises `read` trust.

Later M3 example:

```text
Workspace already trusted for:
✓ Read repository

Task requests:
○ Modify files
○ Run approved verification commands

Grant these capabilities?
[ Grant once ] [ Always grant for this workspace ] [ Deny ]
```

M3 policy may choose to make some grants task-scoped rather than workspace-persistent. This spec does not force permanent edit/verify grants; it only requires that the trust model can represent capability separation.

## 15. Bootstrap readiness checks

Bootstrap should validate enough to avoid finishing in an obviously unusable state.

### Required/fatal checks

Examples:

- supported Node runtime;
- writable user state directory;
- cryptographically generated IPC credential;
- valid host configuration schema;
- selected MCP integration configured or explicit manual instructions accepted;
- Git availability for repository-backed operation.

### Provider/readiness checks

Examples:

- endpoint syntax valid;
- provider reachable;
- credential accepted where applicable;
- selected model available;
- ripgrep status and fallback policy known.

Some provider/capability failures may result in a configured-but-degraded host rather than destroying setup. The summary must make the distinction clear.

## 16. Security requirements

1. Bootstrap must never commit generated secrets or user config into the source repo.
2. IPC tokens must use a cryptographically secure random source and satisfy the daemon length requirement.
3. Existing client config must not be blindly overwritten.
4. Workspace trust must be granted only through explicit human action.
5. Model output cannot grant, persist or elevate trust.
6. An untrusted workspace must not have repository contents sent to inference.
7. Workspace roots must be canonicalized and verified as Git roots before read access is granted.
8. Trust lookup must fail closed on malformed persisted data.
9. Revoked grants must take effect for newly admitted tasks.
10. Side-effect capabilities remain unavailable in M2 regardless of trust data.
11. Reports/logs must redact provider credentials and IPC secrets.
12. Bootstrap must not automatically weaken OS security, firewall settings or client trust controls.

## 17. Testing strategy

### Bootstrap tests

Use isolated temporary HOME/LOCALAPPDATA equivalents.

Test:

- fresh installation;
- re-running bootstrap idempotently;
- `--reconfigure` preserving unrelated config;
- `--check` performing no mutations;
- malformed existing client config;
- existing client config preservation;
- generated IPC credential quality/length;
- provider unreachable behavior;
- provider model discovery;
- sanitized summary output;
- macOS and Windows path handling.

### Workspace trust tests

Test:

- untrusted repository produces `WORKSPACE_TRUST_REQUIRED` before snapshot/model access;
- trust-once works during the intended session and is not persisted;
- always-trust persists read access;
- deny exposes no repository content to provider;
- symlink path resolves to the same canonical workspace;
- malformed/forged path cannot escape to another root;
- revoked workspace is blocked on subsequent admission;
- replacing/mismatching repository identity fails closed when identity evidence is available;
- read grant does not imply edit or verify;
- model/tool payload cannot mutate trust state.

### Regression tests

Existing M0/M1/M2 deterministic and quality checks must continue to pass after static repo configuration is adapted.

## 18. Acceptance criteria

This milestone is complete when:

1. A fresh clone can be configured through `pnpm bootstrap` without manually editing host environment files for the normal supported setup.
2. Bootstrap can configure at least the currently supported primary MCP client path and provides safe manual fallback for unsupported cases.
3. Bootstrap configures and validates the supported Ollama provider without downloading models automatically.
4. Host configuration/secrets live outside the source repository by default.
5. Re-running bootstrap is safe and does not destroy unrelated MCP-client configuration.
6. Repository enumeration is not required during bootstrap.
7. The first task against an untrusted repository is blocked before repository content reaches inference.
8. The user can choose trust-once, durable read trust or deny through a host-controlled authorization flow.
9. Durable workspace trust is keyed from a canonical host-derived workspace identity.
10. A read grant does not imply future edit/verify authority.
11. Durable trust grants can be inspected and revoked.
12. Existing M2 snapshot/path-scope/secret boundaries continue to apply after trust resolution.
13. Windows and macOS bootstrap/trust path behavior have deterministic coverage; live qualification is documented for available hosts.
14. Documentation explains bootstrap, reconfiguration, doctor/check behavior and first-use workspace trust.

## 19. Suggested implementation sequence

### A — Configuration foundation

- define user-state location abstraction;
- define versioned host configuration schema;
- move generated runtime secrets/config outside the source repo;
- preserve backwards-compatible development overrides where useful.

### B — Bootstrap core

- implement environment detection;
- implement interactive/non-interactive command parsing;
- generate IPC credential;
- configure provider;
- add readiness summary.

### C — MCP client adapters

- implement the first qualified client adapter;
- preserve existing user config safely;
- add generic/manual fallback;
- add reconfiguration and validation.

### D — Trusted workspace service

- canonical workspace identity;
- trust-once in-memory grants;
- durable read grants;
- revoke/list management;
- migration/compatibility path from static repository config for development.

### E — Admission integration

- determine candidate workspace from the qualified client/bridge integration;
- block admission before snapshot creation when read trust is missing;
- translate trusted workspace into existing repo/snapshot admission;
- publish bounded required-action response.

### F — Qualification

- deterministic bootstrap/trust tests;
- existing `pnpm check` and test suite;
- M2 MCP smoke;
- real-repository M2 acceptance pair;
- native Mac/Cursor first-use trust flow when the environment is available.

## 20. Relationship to M2.5 Context Architecture

Bootstrap/workspace trust and M2.5 solve different concerns:

```text
Host Bootstrap & Workspace Trust
  → how the host is installed and which repositories it is allowed to access

M2.5 Context Architecture
  → how an already authorized immutable snapshot is summarized and efficiently supplied to the model
```

Recommended order:

```text
Host bootstrap/trust foundation
        ↓
M2.5 RepoMap + Working Memory + Context Compaction
        ↓
M3 editing/worktree/verification capabilities
```

Implementation may overlap where practical, but authorization should be settled before M3 introduces side effects.
