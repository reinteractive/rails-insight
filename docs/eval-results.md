# RailsInsight Evaluation Results Tracker

**Target app:** ellaslist (Rails 6.1.4, Ruby 2.7.2)

This table tracks per-version evaluation scores so agents can see trends, verify improvements, and catch regressions across chat sessions.

## Overall Metrics

| Version    | Date           | Weighted F1 | Hallucinations | False Negatives | Halluc Rate | Tools ≥0.95 | Tools <0.80 |
| ---------- | -------------- | ----------- | -------------- | --------------- | ----------- | ----------- | ----------- |
| 1.0.21     | 2025-05-30     | 0.86        | 14             | 138             | 3.0%        | 4/17        | 3/17        |
| 1.0.22     | 2026-04-03     | 0.89        | 14             | 111             | 2.4%        | 4/17        | 3/17        |
| 1.0.23     | 2026-04-03     | 0.92        | 26             | 40              | 2.1%        | 10/17       | 1/17        |
| 1.0.24     | 2026-04-03     | 0.98        | 22             | 17              | 1.7%        | 14/17       | 0/17        |
| 1.0.25     | 2026-04-03     | 0.98        | 22             | 16              | 1.7%        | 15/17       | 0/17        |
| 1.0.27     | 2026-04-03     | 0.99        | 22             | 10              | 1.7%        | 16/17       | 0/17        |
| **1.0.28** | **2026-04-03** | **0.99**    | **22**         | **4**           | **1.7%**    | **17/17**   | **0/17**    |

## Per-Tool F1

| Tool                     | 1.0.21 | 1.0.22 | 1.0.23 | 1.0.24   | 1.0.25   | 1.0.27   | 1.0.28   | Delta (latest) |
| ------------------------ | ------ | ------ | ------ | -------- | -------- | -------- | -------- | -------------- |
| index_project            | 0.97   | 0.97   | 0.86   | 0.86     | **1.00** | 1.00     | 1.00     | —              |
| get_overview             | 0.89   | 0.89   | 0.80   | **1.00** | 1.00     | 1.00     | 1.00     | —              |
| get_model                | 0.88   | 0.98   | 0.99   | 0.99     | 0.99     | 0.99     | 0.99     | —              |
| get_controller           | 0.92   | 0.92   | 0.98   | 0.98     | 0.98     | 0.98     | 0.98     | —              |
| get_routes               | 0.81   | 0.81   | 0.84   | **0.99** | 0.99     | 0.99     | 0.99     | —              |
| get_schema               | 1.00   | 1.00   | 1.00   | 1.00     | 1.00     | 1.00     | 1.00     | —              |
| get_full_index           | 0.85   | 0.85   | 1.00   | 1.00     | 1.00     | 1.00     | 1.00     | —              |
| get_subgraph             | 0.71   | 0.71   | 0.99   | 0.99     | 0.99     | 0.99     | 0.99     | —              |
| search_patterns          | 0.78   | 0.78   | 0.99   | 0.99     | 0.99     | 0.99     | 0.99     | —              |
| get_deep_analysis        | 0.93   | 0.95   | 0.97   | **0.99** | 0.99     | 0.99     | 0.99     | —              |
| get_blast_radius         | 0.96   | 0.96   | 1.00   | 1.00     | 1.00     | 1.00     | 1.00     | —              |
| get_review_context       | 0.50   | 0.50   | 0.50   | **0.95** | 0.95     | 0.95     | 0.95     | —              |
| get_coverage_gaps        | 0.80   | 0.80   | 0.89   | 0.89     | 0.89     | **1.00** | 1.00     | —              |
| get_test_conventions     | 0.85   | 0.85   | 0.86   | 0.86     | 0.86     | 0.86     | **1.00** | **+0.14**      |
| get_domain_clusters      | 0.85   | 0.85   | 0.95   | 0.95     | 0.95     | 0.95     | 0.95     | —              |
| get_factory_registry     | 1.00   | 1.00   | 1.00   | 1.00     | 1.00     | 1.00     | 1.00     | —              |
| get_well_tested_examples | 0.90   | 0.90   | 1.00   | 1.00     | 1.00     | 1.00     | 1.00     | —              |

\*Note: v1.0.21/v1.0.22 scores were estimated from previous incomplete evals.
v1.0.23 scores are from the first full comprehensive eval run against ellaslist.
Apparent "regressions" in index_project and get_overview reflect more rigorous scoring, not code changes.

## Per-Tool Hallucinations

| Tool                     | 1.0.21 | 1.0.22 | 1.0.23 | 1.0.24 | 1.0.25 | 1.0.27 | 1.0.28 | Delta (latest) |
| ------------------------ | ------ | ------ | ------ | ------ | ------ | ------ | ------ | -------------- |
| index_project            | 0      | 0      | 0      | 0      | 0      | 0      | 0      | —              |
| get_overview             | 0      | 0      | 0      | 0      | 0      | 0      | 0      | —              |
| get_model                | 0      | 0      | 3      | 3      | 3      | 3      | 3      | —              |
| get_controller           | 0      | 0      | 7      | 7      | 7      | 7      | 7      | —              |
| get_routes               | 6      | 6      | 6      | **2**  | 2      | 2      | 2      | —              |
| get_schema               | 0      | 0      | 0      | 0      | 0      | 0      | 0      | —              |
| get_full_index           | 0      | 0      | 0      | 0      | 0      | 0      | 0      | —              |
| get_subgraph             | 17     | 17     | 2      | 2      | 2      | 2      | 2      | —              |
| search_patterns          | 6      | 6      | 6      | 6      | 6      | 6      | 6      | —              |
| get_deep_analysis        | 2      | 0      | 2      | 2      | 2      | 2      | 2      | —              |
| get_blast_radius         | 0      | 0      | 0      | 0      | 0      | 0      | 0      | —              |
| get_review_context       | 0      | 0      | 0      | 0      | 0      | 0      | 0      | —              |
| get_coverage_gaps        | 0      | 0      | 0      | 0      | 0      | 0      | 0      | —              |
| get_test_conventions     | 0      | 0      | 0      | 0      | 0      | 0      | 0      | —              |
| get_domain_clusters      | 0      | 0      | 0      | 0      | 0      | 0      | 0      | —              |
| get_factory_registry     | 0      | 0      | 0      | 0      | 0      | 0      | 0      | —              |
| get_well_tested_examples | 0      | 0      | 0      | 0      | 0      | 0      | 0      | —              |

\*Note: v1.0.21/v1.0.22 hallucination counts were estimated.
v1.0.23 counts are measured precisely. New counts in get_model (3) and get_controller (7)
are minor: extra association/callback from concerns, extra actions from inheritance.
These are not NEW hallucinations — they existed before but weren't counted.

## get_model Enum Detail (Enumerize Focus)

| Model                | Enumerize GT | 1.0.21 Found | 1.0.21 Status | 1.0.22 Found | 1.0.22 Status         |
| -------------------- | ------------ | ------------ | ------------- | ------------ | --------------------- |
| Activity             | 9            | 0            | MISSED        | 9            | **OK**                |
| AdminUser            | 1            | 0            | MISSED        | 1            | **OK**                |
| Member               | 1            | 0            | MISSED        | 1            | **OK**                |
| Article              | 3            | 0            | MISSED        | 3            | **OK**                |
| Location             | 1            | 0            | MISSED        | 1            | **OK**                |
| Event                | 1            | 0            | MISSED        | 1            | **OK**                |
| Review               | 1            | 0            | MISSED        | 1            | **OK**                |
| Travel               | 2            | 0            | MISSED        | 2            | **OK**                |
| UnplugAndPlay        | 1            | 0            | MISSED        | 1            | **OK**                |
| ContactMessage       | 1            | 0            | MISSED        | 1            | **OK**                |
| MemberSignup         | 1            | 0            | MISSED        | 1            | **OK**                |
| FeaturedBlock        | 3            | 0            | MISSED        | 3            | **OK**                |
| FeaturedBlockContent | 1            | 0            | MISSED        | 1            | **OK**                |
| ContentGroupItem     | 1            | 0            | MISSED        | 1            | **OK**                |
| **Total**            | **27**       | **0**        | **FN=27**     | **27**       | **TP=27, FN=0, FP=0** |

## Previous Fix Verification (v1.0.22)

## search_patterns Scope Detail (v1.0.23 Fix)

| Metric          | Before (v1.0.22) | After (v1.0.23) |
| --------------- | ---------------- | --------------- |
| scope TP        | 47               | 47              |
| scope FP        | 5                | 0               |
| scope FN        | 0                | 0               |
| scope Precision | 0.904            | 1.000           |
| scope Recall    | 1.000            | 1.000           |
| scope F1        | 0.950            | 1.000           |

False positives eliminated:

- Activity, Article: `set_site_scope_flags` callback method matched "scope" substring (2 FP)
- FeaturedBlock (×2), Rating: validation rules containing `:scope => :state` (3 FP)

Fix: `CATEGORY_ONLY` pattern set routes category keywords (`scope`, `validates`, `devise`, `enum`, `delegate`, `has_secure_password`) to their dedicated extraction sections, skipping generic substring matching in callbacks/concerns/validation-rules.

## Previous Fix Verification (v1.0.22)

| Fix                       | v1.0.21             | v1.0.22     | Status            |
| ------------------------- | ------------------- | ----------- | ----------------- |
| AdminAbility superclass   | null (in get_model) | null        | **Still correct** |
| AdminAbility type         | poro                | poro        | **Still correct** |
| AdminAbility non_ar       | true                | true        | **Still correct** |
| Sluggable superclass      | null                | null        | **Still correct** |
| Sluggable type            | concern             | concern     | **Still correct** |
| testing.factories         | true                | true        | **Still correct** |
| Auth strategy: devise     | devise              | devise      | **Still correct** |
| Devise models: 2          | 2                   | 2           | **Still correct** |
| Authz: cancancan          | cancancan           | cancancan   | **Still correct** |
| Authz roles extracted     | 6 roles             | 6 roles     | **Still correct** |
| Schema tables: 46         | 46                  | 46          | **Still correct** |
| Controllers: 57           | 57                  | 57          | **Still correct** |
| Jobs adapter: delayed_job | delayed_job         | delayed_job | **Still correct** |
| Email mailers: 3          | 3                   | 3           | **Still correct** |
| Factory registry: 5       | 5                   | 5           | **Still correct** |

## Known Remaining Issues (v1.0.23 eval)

| Issue                                                         | Tool                             | Severity | F1 Impact | Status            |
| ------------------------------------------------------------- | -------------------------------- | -------- | --------- | ----------------- |
| get_review_context ignores token_budget, 0 for unmapped files | get_review_context               | CRITICAL | F1=0.50   | **Fixed v1.0.24** |
| Route deduplication from drawn sub-routes (~6 FP)             | get_routes                       | HIGH     | F1=0.84   | **Fixed v1.0.24** |
| cancancan roles not extracted from AdminAbility               | get_overview + get_deep_analysis | HIGH     | -6 FN     | **Fixed v1.0.24** |
| test_conventions.framework returns undefined                  | get_test_conventions             | MEDIUM   | F1=0.86   | Open              |
| dependencies.ruby_version returns null                        | get_deep_analysis                | LOW      | -1 FN     | Open              |
| Database subgraph includes ActiveRecord::Base, Rails          | get_subgraph                     | LOW      | -2 FP     | Open              |
| Interpolated route namespace #{city} literal                  | get_routes                       | LOW      | -1 FP     | Open              |

## Change Log

| Version | Changes                                                                                                                                        | Expected Impact                                                                                   | Actual Impact                                                                                                                                                                                                        |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0.22  | Strip inline Ruby comments from enumerize value arrays                                                                                         | Fix dirty values in enumerize arrays                                                              | **get_model F1: 0.88→0.98 (+0.10). 27 FN eliminated. 0 dirty values. 0 regressions.**                                                                                                                                |
| 1.0.23  | search_patterns: add CATEGORY_ONLY guard to prevent scope/validates/devise FPs in callbacks/validations/concerns                               | Eliminate 5 scope FPs, properly route category keywords to dedicated sections                     | **Full eval: Weighted F1 0.86→0.92. search_patterns F1 0.78→0.99. get_model F1 0.99. 10/17 tools ≥0.95. 1/17 tool <0.80.**                                                                                           |
| 1.0.24  | Route dedup + cancancan roles + blast radius fuzzy resolution                                                                                  | Fix 3 priority issues: routes F1 0.84→0.95+, overview F1 0.80→0.95+, review_context F1 0.50→0.90+ | **Weighted F1 0.92→0.98. get_routes F1 0.84→0.99. get_overview F1 0.80→1.00. get_review_context F1 0.50→0.95. get_deep_analysis F1 0.97→0.99. 14/17 tools ≥0.95. 0/17 tools <0.80. Hallucinations 26→22. FN 40→17.** |
| 1.0.25  | index_project: include abstract models in count, add jobs/mailers/channels/route_resources stats, fix jobs count path, remove redundant fields | Fix index_project F1 0.86→1.00                                                                    | **index_project F1 0.86→1.00. Weighted F1 0.98 (unchanged rounding). 15/17 tools ≥0.95. FN 17→16. 0 regressions.**                                                                                                   |

## v1.0.24 Fix Verification

### Route Deduplication

| Metric            | v1.0.23         | v1.0.24      |
| ----------------- | --------------- | ------------ |
| Resources         | 30 (with dupes) | 27 (deduped) |
| Duplicate entries | 6               | 0            |
| Route FP          | 6               | 2            |
| Route FN          | 11              | 0            |
| get_routes F1     | 0.84            | **0.99**     |

Remaining FP: `#{city}/articles` (interpolated namespace literal, 1 resource + 1 action).

### CanCanCan Roles (rolify coexistence)

| Metric                              | v1.0.23    | v1.0.24                                                        |
| ----------------------------------- | ---------- | -------------------------------------------------------------- |
| authorization.roles.roles           | [] (empty) | ["admin","editor","sales","producer","contributer","explorer"] |
| get_overview roles                  | 0/6        | 6/6                                                            |
| get_deep_analysis abilities_by_role | 0 groups   | 6 groups                                                       |
| get_overview F1                     | 0.80       | **1.00**                                                       |

Root cause: rolify model detection overwrote `result.roles` discarding cancancan's `has_role?` extracted role names. Fixed by preserving existing `roles` array during merge.

### Blast Radius Fuzzy Resolution

| Metric                       | v1.0.23         | v1.0.24                                         |
| ---------------------------- | --------------- | ----------------------------------------------- |
| user.rb (non-existent) seeds | 0               | 1 (Wordpress::User)                             |
| user.rb entities             | 0               | 26                                              |
| Warning                      | "Unmapped file" | "Resolved → wordpress/user.rb (basename match)" |
| activity.rb (valid) entities | 36              | 36                                              |
| Budget 2000/4000/8000        | 23/36/36        | 23/36/36                                        |
| get_review_context F1        | 0.50            | **0.95**                                        |

Fuzzy resolution matches by basename when exact path fails. Score is 0.95 (not 1.00) because basename matching user.rb→wordpress/user.rb is imprecise.

## Priority Fix Queue (by Weighted F1 Impact)

Updated after v1.0.24 eval. Top 3 issues from v1.0.23 are now fixed.

| Rank  | Fix                                                           | Tool(s)                             | Current F1     | Target F1      | Δ Weighted F1 | Status                            |
| ----- | ------------------------------------------------------------- | ----------------------------------- | -------------- | -------------- | ------------- | --------------------------------- |
| ~~1~~ | ~~Fix get_review_context token budget + file mapping~~        | ~~get_review_context~~              | ~~0.50~~       | ~~0.90~~       | ~~+0.027~~    | **Fixed v1.0.24** (F1=0.95)       |
| ~~2~~ | ~~Fix route deduplication from drawn sub-routes~~             | ~~get_routes~~                      | ~~0.84~~       | ~~0.95~~       | ~~+0.011~~    | **Fixed v1.0.24** (F1=0.99)       |
| ~~3~~ | ~~Extract cancancan roles from AdminAbility~~                 | ~~get_overview, get_deep_analysis~~ | ~~0.80, 0.97~~ | ~~0.95, 0.99~~ | ~~+0.011~~    | **Fixed v1.0.24** (F1=1.00, 0.99) |
| ~~4~~ | ~~Fix index_project model count (abstract classes excluded)~~ | ~~index_project~~                   | ~~0.86~~       | ~~1.00~~       | ~~+0.004~~    | **Fixed v1.0.25** (F1=1.00)       |
| 1     | Fix test_conventions.framework = undefined                    | get_test_conventions                | 0.86           | 1.00           | **+0.005**    | Open                              |
| 2     | Fix dependencies.ruby_version = null                          | get_deep_analysis                   | 0.99           | 1.00           | **+0.001**    | Open                              |
| 3     | Filter framework classes from database subgraph               | get_subgraph                        | 0.99           | 1.00           | **+0.001**    | Open                              |
| 4     | Resolve interpolated #{city} route namespace                  | get_routes                          | 0.99           | 1.00           | **<0.001**    | Open                              |

**Scorecard files:** `ellaslist1-ellaslist-core-844dcf9968be/railsinsight-eval-scorecard.md` and `railsinsight-eval-issues.md`
