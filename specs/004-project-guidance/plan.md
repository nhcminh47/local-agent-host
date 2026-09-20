# Implementation Plan: Project Guidance and Memory

**Date**: 2026-09-20 | **Spec**: [spec.md](spec.md)

## Summary

Create a concise project entry guide, linked current architecture and Spec Kit workflow, and indexed memories with a template and dated change records.

## Technical Context

Markdown-only change. Sources: current guidance, source map, milestone evidence, installed Spec Kit 0.14.2 templates/guidance and targeted runtime/service modules. No dependencies or runtime behavior change.

## Constitution Check

No tracked Spec Kit constitution exists. Preserve existing capability, credential, process, toolchain and evidence constraints. Clarify that M2 restrictions govern product-exposed tools, not authorized maintenance or developer regression tests.

## Project Structure

- `AGENTS.md`: overview, design, reading map, coding/folder rules and workflow summary.
- `docs/architecture.md`: implemented topology, ownership, flow, boundaries and deferred features.
- `docs/development-workflow.md`: Spec Kit phases, setup, verification and completion.
- `docs/memories/README.md` and `TEMPLATE.md`: index and reusable change-record format.
- Dated memories for source restructuring and this guidance task.
- `README.md`: links to the entry documents.

## Validation

Check local Markdown links, required sections, current source-path references, constraint preservation, Spec Kit prerequisites and diff whitespace. No runtime tests for a documentation-only change; historical checks remain explicitly labelled.

## Complexity Tracking

Use the ignored Spec Kit scaffolding already available. Do not install a root framework, create branches or replace existing specifications.
