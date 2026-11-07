# Changelog

## 1.1.0 — 2026-11-07

### Added

- Adaptive single-line quota indicators, right-aligned beside Session statistics, without strip borders or an extra background.
- A compact `+N` disclosure for providers that do not fit. Provider ordering remains stable.
- Overflow priority for known zero remaining quota or balances below configurable per-currency thresholds. Defaults are USD 1 and CNY 7, manual approximate equivalents rather than live exchange rates.
- Settings UI and the existing `quota_status` settings operation share the same validated threshold map. Empty maps disable balance-based deprioritization; existing profiles receive defaults when the field is absent.
- Bounded anonymous layout diagnostics in `quota_status` read/refresh: up to eight in-memory samples, with no account names, identifiers, paths or credentials.

### Improved

- Dock sizing accounts for DSH's public `data-slot` outlet wrapper and sidebar/container changes. A measured nonzero intrinsic basis prevents collapse into an all-hidden strip.
- The last provider or `+N` stays next to Session statistics; spare width is kept to the left of the indicators.
- Reset countdowns live in compact details rather than changing the inline strip width.
- Settings saves are serialized against snapshot loading, preventing older results from replacing newly saved preferences.
- Unknown, failed and stale metrics are never treated as zero balances or exhausted quotas. Independent currencies are not summed.
- Keyboard focus recovery, per-opener expanded state, font readiness, fractional widths and floating-surface dismissal during layout changes are preserved.

### Verification

- 80 unit, security, layout-contract, geometry, diagnostics and documentation tests pass; JavaScript syntax and package distribution checks pass.
- Running-client measurements confirmed adaptive visibility, and the final Desktop placement was accepted through user review.
- This is not a claim of automated multi-monitor or light/dark-theme visual coverage. Documentation illustrations remain synthetic and predate adaptive overflow.
- No new external runtime dependencies, install scripts or paid LLM requests.

### Install

```text
github:pnpwin/dsh-quota#v1.1.0
```

Use the full release commit SHA instead of the tag for immutable pinning. Replace the previous bundle rather than activating local and GitHub copies together. Existing profile preferences are preserved by the normal DSH configuration layer; follow Plugin Manager's activation or restart instructions.
