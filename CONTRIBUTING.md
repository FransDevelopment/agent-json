# Contributing to agent.json

Thank you for your interest in contributing to the agent.json specification. This is an open standard, and community input is essential to making it useful across the entire agent ecosystem.

## How to Contribute

### Reporting Issues

If you find a bug in the validator, an inconsistency in the spec, or have a question about a field's behavior, [open an issue](../../issues). Include:

- A clear description of the problem
- The relevant section of the spec (if applicable)
- A minimal example manifest that demonstrates the issue

### Proposing Changes to the Specification

For changes to `SPECIFICATION.md` or `schema.json`:

1. **Open an issue first** to discuss your proposal before writing code. This helps avoid duplicate work and ensures alignment with the project's goals.
2. Fork the repository and create a branch for your change.
3. Update the relevant files (`SPECIFICATION.md`, `schema.json`, `validate.js`, and examples if applicable).
4. Ensure all existing tests pass: `npm test`
5. Add tests for any new validation logic.
6. Submit a pull request with a clear description of the change and its rationale.

### Adding Examples

New industry examples are welcome. Place them in the `examples/` directory and ensure they:

- Pass validation (`node validate.js examples/your-example.json`)
- Use generic domains (e.g., `service.example.com`)
- Use the placeholder payout address (`0x0000000000000000000000000000000000000000`)
- Demonstrate a realistic use case with well-written intent descriptions

### Proposing New Intent Patterns

If you think a common intent pattern should be documented (e.g., `subscribe_*`, `cancel_*`), open an issue with:

- The proposed intent name pattern
- Example use cases across multiple industries
- Suggested parameter conventions

## Design Principles

When proposing changes, keep these principles in mind:

- **Payment rail agnostic** — The spec does not mandate any specific payment provider.
- **Identity agnostic** — The spec supports multiple identity frameworks (DIDs, public keys, etc.).
- **Communication agnostic** — Intents can be executed via API endpoints, web automation, or other means.
- **Website agnostic** — Any domain can publish a manifest regardless of tech stack.
- **Progressive complexity** — Features should layer on top of the minimal spec (Tier 1 → 2 → 3) without breaking simpler implementations.
- **Open and decentralized** — No single entity controls the registry, discovery, or settlement.

## Code Style

- JavaScript follows standard Node.js conventions (no transpilation, no external dependencies).
- JSON files use 2-space indentation.
- Markdown follows standard GitHub-Flavored Markdown.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
