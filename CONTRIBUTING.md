# Contributing to agent.json

Thank you for your interest in contributing to the `agent.json` open standard. This protocol is community-driven, and we welcome contributions of all kinds — from typo fixes to specification proposals.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Contribute](#how-to-contribute)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Pull Request Process](#pull-request-process)
- [Specification Changes](#specification-changes)
- [Reporting Issues](#reporting-issues)
- [Design Principles](#design-principles)

## Code of Conduct

This project is committed to providing a welcoming and inclusive experience for everyone. Be respectful, constructive, and collaborative. We do not tolerate harassment, discrimination, or bad-faith participation.

## How to Contribute

### Types of contributions we're looking for

- **Bug fixes** — issues in the validator, schema, or test suite
- **New examples** — industry-specific manifests that demonstrate the spec
- **Specification clarifications** — wording improvements, better examples, or clearer field descriptions
- **Validator improvements** — better error messages, new validation rules, edge case coverage
- **Test coverage** — additional test cases for under-tested paths
- **New intent patterns** — common patterns (e.g., `subscribe_*`, `cancel_*`) with cross-industry examples
- **Specification proposals** — new fields, new features, or architectural changes (see [Specification Changes](#specification-changes))

### What we're not looking for

- Changes that break backwards compatibility with v1.0 manifests
- Vendor-specific features that belong in `extensions` rather than the core spec
- Changes that add runtime dependencies to the validator (it must remain zero-dependency)

## Development Setup

### Prerequisites

- Node.js 16 or later

### Getting started

```bash
git clone https://github.com/FransDevelopment/agent-json.git
cd agent-json
npm test
```

There are no dependencies to install. The validator and test suite use only Node.js built-in modules.

### Project structure

```
agent-json/
  SPECIFICATION.md    # The full specification (source of truth)
  schema.json         # JSON Schema (2020-12)
  validate.js         # Zero-dependency validator + CLI
  test.js             # Test suite (70+ tests)
  package.json        # npm package metadata
  examples/           # Example manifests
  LICENSE             # MIT license
```

## Making Changes

### Before you start

1. **Check existing issues and PRs** to avoid duplicate work.
2. **Open an issue first** for non-trivial changes — discuss the approach before writing code.
3. **For specification proposals**, see [Specification Changes](#specification-changes) below.

### Code guidelines

- **Zero dependencies.** The validator must not require any npm packages. It uses only Node.js built-in modules (`fs`, `path`, `https`, `http`, `assert`).
- **Consistent validation patterns.** Follow the existing patterns in `validate.js` — errors for invalid data, warnings for suspicious but valid data.
- **Test everything.** Every new validation rule needs at least one positive test (valid input passes) and one negative test (invalid input fails). Run `npm test` before submitting.
- **Schema parity.** Changes to validation logic in `validate.js` should be reflected in `schema.json`, and vice versa. They must agree on what is valid.
- **Specification parity.** Changes to the schema or validator must be reflected in `SPECIFICATION.md`. The spec is the source of truth — code implements the spec, not the other way around.

### Code style

- JavaScript follows standard Node.js conventions (no transpilation, no external dependencies)
- JSON files use 2-space indentation
- Markdown follows standard GitHub-Flavored Markdown

### Commit messages

Write clear, concise commit messages. Use the present tense ("Add x402 validation" not "Added x402 validation"). Reference issue numbers where applicable.

## Pull Request Process

1. **Fork the repository** and create your branch from `main`.
2. **Make your changes** following the guidelines above.
3. **Run the tests** with `npm test` and ensure all pass.
4. **Validate all examples** — the test suite does this automatically.
5. **Update documentation** if your change affects the spec, schema, or README.
6. **Open a pull request** with a clear title and description of what changed and why.

### PR review criteria

- Does it break backwards compatibility?
- Is it consistent across spec, schema, validator, and tests?
- Does it maintain the zero-dependency constraint?
- Are the test cases sufficient?
- Is the specification language clear and unambiguous?

## Specification Changes

The `agent.json` specification is an open standard. Changes to the spec have broad impact, so they follow a more deliberate process.

### Minor changes (clarifications, examples, typos)

Open a PR directly. These don't change the spec's semantics.

### Additive changes (new optional fields, new features)

1. **Open an issue** describing the proposed addition, the motivation, and example usage.
2. **Discuss** with maintainers and community. We'll evaluate fit, backwards compatibility, and whether it belongs in the core spec or in `extensions`.
3. **Draft** the spec text, schema changes, validator updates, and test cases.
4. **Open a PR** referencing the issue. All four artifacts (spec, schema, validator, tests) must be updated together.

### Breaking changes

Breaking changes require a major version bump (e.g., v1.x to v2.0) and are held to a high bar. Open an issue to start discussion well in advance.

### Adding an example manifest

Example manifests live in the `examples/` directory. Good examples:

- Represent a real industry or use case
- Use generic domains (e.g., `shop.example.com`, `api.example.com`)
- Use placeholder addresses (e.g., `0x0000000000000000000000000000000000000000`)
- Demonstrate specific spec features
- Include well-written intent descriptions (see [SPECIFICATION.md §6](./SPECIFICATION.md))
- Pass validation with zero errors and zero warnings

To add an example:

1. Create a new `.json` file in `examples/`
2. Ensure it passes: `npx agent-json-validate ./examples/your-example.json`
3. The test suite automatically validates all files in `examples/`

### Proposing new intent patterns

If you think a common intent pattern should be documented (e.g., `subscribe_*`, `cancel_*`), open an issue with:

- The proposed intent name pattern
- Example use cases across multiple industries
- Suggested parameter conventions

## Reporting Issues

### Bug reports

Include:
- What you expected to happen
- What actually happened
- Steps to reproduce (a minimal manifest that triggers the bug is ideal)
- Node.js version and OS

### Feature requests

Include:
- The use case — what problem does this solve?
- Example manifest showing the proposed syntax
- Why this belongs in the core spec rather than `extensions`

## Design Principles

When proposing changes, keep these principles in mind:

- **Payment rail agnostic** — The spec does not mandate any specific payment provider.
- **Identity agnostic** — The spec supports multiple identity frameworks (DIDs, public keys, etc.).
- **Communication agnostic** — Intents can be executed via API endpoints, web automation, or other means.
- **Website agnostic** — Any domain can publish a manifest regardless of tech stack.
- **Progressive complexity** — Features should layer on top of the minimal spec (Tier 1 → 2 → 3) without breaking simpler implementations.
- **Open and decentralized** — No single entity controls the registry, discovery, or settlement.
- **Backwards compatible** — New additions must not break existing v1.0 manifests.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
