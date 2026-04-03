# RailsInsight Evaluation Results Tracker

**Target app:** ellaslist (Rails 6.1.4, Ruby 2.7.2)

This table tracks per-version evaluation scores so agents can see trends, verify improvements, and catch regressions across chat sessions.

## Overall Metrics

| Version | Date | Weighted F1 | Hallucinations | False Negatives | Halluc Rate | Tools ≥0.95 | Tools <0.80 |
|---------|------|-------------|----------------|-----------------|-------------|-------------|-------------|
| 1.0.21 | 2025-05-30 | 0.86 | 14 | 138 | 3.0% | 4/17 | 3/17 |
| 1.0.22 | 2026-04-03 | 0.89 | 14 | 111 | 2.4% | 4/17 | 3/17 |

## Per-Tool F1

| Tool | 1.0.21 | 1.0.22 | Delta |
|------|--------|--------|-------|
| index_project | 0.97 | 0.97 | — |
| get_overview | 0.89 | 0.89 | — |
| get_model | 0.88 | 0.98 | **+0.10** |
| get_controller | 0.92 | 0.92 | — |
| get_routes | 0.81 | 0.81 | — |
| get_schema | 1.00 | 1.00 | — |
| get_full_index | 0.85 | 0.85 | — |
| get_subgraph | 0.71 | 0.71 | — |
| search_patterns | 0.78 | 0.78 | — |
| get_deep_analysis | 0.93 | 0.95 | **+0.02** |
| get_blast_radius | 0.96 | 0.96 | — |
| get_review_context | 0.50 | 0.50 | — |
| get_coverage_gaps | 0.80 | 0.80 | — |
| get_test_conventions | 0.85 | 0.85 | — |
| get_domain_clusters | 0.85 | 0.85 | — |
| get_factory_registry | 1.00 | 1.00 | — |
| get_well_tested_examples | 0.90 | 0.90 | — |

## Per-Tool Hallucinations

| Tool | 1.0.21 | 1.0.22 | Delta |
|------|--------|--------|-------|
| index_project | 0 | 0 | — |
| get_overview | 0 | 0 | — |
| get_model | 0 | 0 | — |
| get_controller | 0 | 0 | — |
| get_routes | 6 | 6 | — |
| get_schema | 0 | 0 | — |
| get_full_index | 0 | 0 | — |
| get_subgraph | 17 | 17 | — |
| search_patterns | 6 | 6 | — |
| get_deep_analysis | 2 | 0 | **-2** |
| get_blast_radius | 0 | 0 | — |
| get_review_context | 0 | 0 | — |
| get_coverage_gaps | 0 | 0 | — |
| get_test_conventions | 0 | 0 | — |
| get_domain_clusters | 0 | 0 | — |
| get_factory_registry | 0 | 0 | — |
| get_well_tested_examples | 0 | 0 | — |

## get_model Enum Detail (Enumerize Focus)

| Model | Enumerize GT | 1.0.21 Found | 1.0.21 Status | 1.0.22 Found | 1.0.22 Status |
|-------|-------------|--------------|---------------|--------------|---------------|
| Activity | 9 | 0 | MISSED | 9 | **OK** |
| AdminUser | 1 | 0 | MISSED | 1 | **OK** |
| Member | 1 | 0 | MISSED | 1 | **OK** |
| Article | 3 | 0 | MISSED | 3 | **OK** |
| Location | 1 | 0 | MISSED | 1 | **OK** |
| Event | 1 | 0 | MISSED | 1 | **OK** |
| Review | 1 | 0 | MISSED | 1 | **OK** |
| Travel | 2 | 0 | MISSED | 2 | **OK** |
| UnplugAndPlay | 1 | 0 | MISSED | 1 | **OK** |
| ContactMessage | 1 | 0 | MISSED | 1 | **OK** |
| MemberSignup | 1 | 0 | MISSED | 1 | **OK** |
| FeaturedBlock | 3 | 0 | MISSED | 3 | **OK** |
| FeaturedBlockContent | 1 | 0 | MISSED | 1 | **OK** |
| ContentGroupItem | 1 | 0 | MISSED | 1 | **OK** |
| **Total** | **27** | **0** | **FN=27** | **27** | **TP=27, FN=0, FP=0** |

## Previous Fix Verification (v1.0.22)

| Fix | v1.0.21 | v1.0.22 | Status |
|-----|---------|---------|--------|
| AdminAbility superclass | null (in get_model) | null | **Still correct** |
| AdminAbility type | poro | poro | **Still correct** |
| AdminAbility non_ar | true | true | **Still correct** |
| Sluggable superclass | null | null | **Still correct** |
| Sluggable type | concern | concern | **Still correct** |
| testing.factories | true | true | **Still correct** |
| Auth strategy: devise | devise | devise | **Still correct** |
| Devise models: 2 | 2 | 2 | **Still correct** |
| Authz: cancancan | cancancan | cancancan | **Still correct** |
| Authz roles extracted | 6 roles | 6 roles | **Still correct** |
| Schema tables: 46 | 46 | 46 | **Still correct** |
| Controllers: 57 | 57 | 57 | **Still correct** |
| Jobs adapter: delayed_job | delayed_job | delayed_job | **Still correct** |
| Email mailers: 3 | 3 | 3 | **Still correct** |
| Factory registry: 5 | 5 | 5 | **Still correct** |

## Known Remaining Issues (not addressed in v1.0.22)

| Issue | Tool | Severity | Status |
|-------|------|----------|--------|
| Email subgraph returns 0 entities (mailers not in graph) | get_subgraph | HIGH | Open |
| Auth subgraph includes unrelated models (17 FP) | get_subgraph | MEDIUM | Open |
| search_patterns: validates returns 0, scope returns wrong | search_patterns | CRITICAL | Open |
| get_review_context ignores token_budget | get_review_context | HIGH | Open |
| Route deduplication (events×3, businesses×2) | get_routes | MEDIUM | Open |
| Interpolated route namespace #{city} rendered literally | get_routes | MEDIUM | Open |
| test_conventions.factory_tool returns undefined | get_test_conventions | LOW | Open |
| dependencies.ruby_version returns undefined | get_deep_analysis | LOW | Open |

## Change Log

| Version | Changes | Expected Impact | Actual Impact |
|---------|---------|-----------------|---------------|
| 1.0.22 | Strip inline Ruby comments from enumerize value arrays | Fix dirty values in enumerize arrays | **get_model F1: 0.88→0.98 (+0.10). 27 FN eliminated. 0 dirty values. 0 regressions.** |
