# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.43] - 2026-04-06

### Fixed

- **`search_patterns` returns concerns and modules in model results**: The handler iterated all entries in `extractions.models` without filtering by type, causing ActiveSupport::Concern modules (e.g. `Orderable`, `Activateable`) to appear in search results for `scope`, `validates`, `enum`, etc. The handler now skips entries with `type: 'concern'`, `type: 'module'`, or `type: 'poro'` — only concrete model classes are searched
- **Controller extractor misses filters with inline Ruby comments**: A `before_action` or `skip_before_action` declaration followed by an inline comment (e.g. `skip_before_action :verify_authenticity_token # Skip CSRF`) failed to match the filter regex because the `$` end-of-line anchor could not match past the comment text. The extractor now strips inline Ruby comments from each line (same approach used by model extractor for callbacks) before running filter detection

## [1.0.42] - 2026-04-06

### Fixed

- **`get_schema` fails to parse schema-prefixed table names**: Tables defined with PostgreSQL schema prefixes (e.g. `create_table "public.login_permissions"`, `create_table "salesforce.account"`) were not matched by the `createTable` regex because `\w+` does not match dots. Changed to `[\w.]+` in `createTable`, `foreignKey`, and `checkConstraint` patterns. Affects any PostgreSQL database using multi-schema setups (e.g. Heroku Connect with `salesforce.*` tables)

## [1.0.41] - 2026-04-06

### Fixed

- **`get_domain_clusters` plural association names not resolved to model classes**: The clustering algorithm used `pathToClassName` to convert association names (e.g. `posts` from `has_many :posts`) to model class names, which produced `Posts` instead of `Post`. Replaced with `classify` from the inflector, which correctly singularizes the last word segment before PascalCase conversion. Fixes cluster fragmentation where `has_many` and `has_and_belongs_to_many` associations failed to pull related models into the same cluster
- **`get_domain_clusters` POROs and modules included in clustering**: Non-ActiveRecord classes (type `poro`) and modules (type `module`) in `app/models/` were included in domain clusters despite having no associations or database backing. The handler now excludes `poro` and `module` types from both cluster formation and the unassigned models count

## [1.0.40] - 2026-04-06

### Fixed

- **`get_controller` concern modules indexed as controllers**: Files in `app/controllers/concerns/` (e.g. `Authenticatable`, `Respondable`) were classified as category 2 (controllers) by the scanner, causing the indexer to add them to `extractions.controllers`. The scanner now classifies controller concern files as `design_patterns` (category 26) before the broad controller rule matches. Fixes false-positive controller discovery in 3 eval apps (sharp, quarter-turn, lf-api)
- **`get_controller` superclass with `::` prefix not detected**: Controller class declarations inheriting with a root-namespace prefix (e.g. `class UploaderController < ::Spree::Api::V2::BaseController`) failed to match the `classDeclaration` regex, resulting in `null` superclass and incorrect `api_controller` flag. The pattern now handles optional leading `::` on the superclass

## [1.0.39] - 2026-04-05

### Fixed

- **`get_factory_registry` trait-level attributes leak into factory attributes**: Attributes defined inside `trait` blocks (e.g. `trait :click_and_collect do; click_and_collect_allowed { true }; end`) were incorrectly included in the factory's top-level `attributes` list. The parser now tracks trait block depth and excludes attributes inside traits, matching the same guard already applied to `transient` blocks
- **`get_factory_registry` multi-line attribute block detection**: Attributes with block values spanning multiple lines (e.g. `body_markdown { "long text...\n..." }`) were not detected because the regex required both `{` and `}` on the same line. Now falls back to matching just the opening `{` for attribute detection

## [1.0.38] - 2026-04-05

### Fixed

- **`get_test_conventions` full-scan for subject, described_class, and let style detection**: The extractor previously sampled only the first 20 spec files to detect conventions, causing false negatives for `subject_usage`, `described_class_usage`, and incorrect `let_style` classification in projects with more than 20 spec files. Now scans all spec files for accurate convention detection. Fixes subject_usage FN in 3 apps, described_class FN in 2 apps, and let_style misclassification in 2 apps
- **`get_test_conventions` spec_counts missing categories**: Added 11 missing RSpec spec category directories (`helper_specs`, `feature_specs`, `system_specs`, `view_specs`, `routing_specs`, `worker_specs`, `lib_specs`, `integration_specs`, `decorator_specs`, `serializer_specs`, `presenter_specs`) and 5 Minitest directories (`helper_tests`, `system_tests`, `job_tests`, `mailer_tests`, `service_tests`) to the spec file classifier. Previously, files in these directories were reported as `other` instead of their correct category

## [1.0.37] - 2026-04-05

### Fixed

- **`get_model` enum `%w[]`, `%i[]`, and constant-reference syntax detection**: Enums declared with word-array syntax (`enum status: %w[draft published].freeze`), symbol-array syntax (`enum state: %i[pending active]`), or constant references (`enum status: STATUSES`) are now correctly extracted. Previously only `{ hash }` and `[ array ]` literals were detected. Fixes 6 enum false negatives in lf-api evaluation
- **`get_model` STI subclass namespace resolution**: Models in subdirectories that declare a root-level class inheriting from another model (STI pattern, e.g. `class Admin < User` in `app/models/users/admin.rb`) now preserve their declared class name instead of being incorrectly namespaced to `Users::Admin`. Path-based namespace inference is skipped when the superclass is not `ApplicationRecord` or `ActiveRecord::Base`. Fixes 3 entity resolution failures in lf-api evaluation

## [1.0.36] - 2026-04-05

### Fixed

- **`get_coverage_gaps` per-action request spec splitting pattern support**: Apps that split request specs into per-action files under a directory (e.g. `spec/requests/accounts/balance_spec.rb` instead of `spec/requests/accounts_spec.rb`) now correctly match their controllers. The test matcher adds a post-loop fallback that collects request spec directories and matches unmatched controllers by their underscore resource name. Fixes 5 `has_test` false negatives in the sharp-corporate evaluation

## [1.0.35] - 2026-04-05

### Fixed

- **`get_coverage_gaps` phantom entity elimination — exclude concerns and modules from gap reporting**: Model concerns (`type: 'concern'`) and modules (`type: 'module'`) are now skipped during gap iteration. Controller concerns (files under `app/controllers/concerns/`) are also excluded. These are not standalone entities and were creating false positive gap entries. Eliminates 11+ FPs across evaluated apps
- **`get_coverage_gaps` gap=0 entities excluded from output**: Entities at 100% coverage (gap=0) are no longer included in the gaps array. The `total_gaps` field now correctly reflects only entities with actual coverage gaps, not the total entity count. Fixes `total_gaps` metadata in 4/6 evaluated apps
- **`get_coverage_gaps` request spec namespace resolution for namespaced controllers**: The test matcher now uses `'requests'` as an alternative directory anchor (alongside `'controllers'`), so request specs at `spec/requests/admin/brands_spec.rb` correctly match `Admin::BrandsController`. Previously, all namespace information was lost for request specs because the path contains no `controllers` directory. Fixes 28+ `has_test` errors across evaluated apps
- **`get_coverage_gaps` multi-word CamelCase for namespace segments**: Directory path segments like `asset_reviews` are now properly converted to `AssetReviews` (split on `_`, capitalize each word) instead of `Asset_reviews`. Applies to both controller namespace and model namespace resolution
- **`get_coverage_gaps` namespace-aware model spec matching**: Model spec paths now incorporate directory structure to prefer namespaced matches. `spec/models/setups/contact_spec.rb` now matches `Setups::Contact` instead of incorrectly matching root `Contact`. The FQN from the spec path is tried first, with short-name fallback
- **`get_coverage_gaps` case-insensitive acronym matching for model test resolution**: `resolveModelName()` now includes a case-insensitive fallback for models with custom acronyms (e.g. `HTTPLog`, `SMSNotification`). `classify('http_log')` produces `HttpLog` which now correctly matches the `HTTPLog` model key

## [1.0.34] - 2026-04-04

### Fixed

- **`index_project` route_resources block-stack misalignment from `do` substring in resource names**: The route parser used `trimmed.includes('do')` to detect Ruby `do..end` blocks, which falsely matched resource names containing the substring `do` (e.g. `vendor_products`, `vendor_open_hours`, `documents`). These phantom pushes caused the namespace stack to desync, placing subsequent resources under incorrect namespaces. Replaced with word-boundary regex `/\bdo\s*$/` that only matches `do` as a standalone keyword at end-of-line. Fixes quarter-turn route_resources 30→32

## [1.0.33] - 2026-04-03

### Fixed

- **`index_project` route_resources dedup collision between namespaces and same-named resources**: `deduplicateResources()` now includes entry type in the dedup key, preventing `namespace :X` from merging with `resources :X` when both share the same name. Fixes mitchcap-portal losing `asset_reviews` and `metrics` resource declarations
- **`index_project` route_resources over-count from namespace entries**: `computeStatistics()` now filters `type: 'namespace'` entries from the `route_resources` count. Namespaces are structural groupings, not resource declarations. Fixes ellaslist 30→27 (=GT), lf-api 22→20
- **`index_project` total_files under-count — broader file scanning**: Scanner now indexes turbo stream ERB (`*.turbo_stream.erb`), plain ERB partials, `config/**/*.js` (webpack configs), `features/**/*.rb` (Cucumber), `vendor/assets/` and `vendor/javascript/` files, `swagger/**/*.yml` API docs, and `db/*.rb` catch-all files. Provider no longer skips entire `vendor/` directory — only `vendor/bundle/` and `vendor/cache/` are excluded. New classification rules for `app/overrides/` (design_patterns), `app/chewy/` (search). Recovers +116 files for quarter-turn, +42 for kollaras, +37 for mitchcap, +22 for lf-api

## [1.0.32] - 2026-04-03

### Fixed

- **`index_project` jobs under-count for mixin-only jobs without inheritance**: `extractJob()` now detects job classes that use `include Delayed::RecurringJob`, `include Delayed::Job`, `include Resque::Job`, or `include Sidekiq::Job` without inheriting from a superclass. Previously, classes without `<` inheritance syntax were silently dropped before mixin detection was reached. Fixes lf-api jobs 3→14 (+11) and quarter-turn jobs 2→3 (+1)

## [1.0.31] - 2026-04-03

### Fixed

- **`index_project` total_files under-count for apps with vendored lib/ engines**: Scanner now indexes non-Ruby files inside `lib/` directories — `.erb`, `.haml`, `.slim`, `.scss`, `.sass`, `.css`, `.js`, `.jsx`, `.ts`, `.tsx`, `.coffee`, `.yml`, `.yaml`, `.json`. Apps with vendored engines (e.g. `lib/store_connect_mini/`, `lib/hydrofoil_mini/`) now have their asset and view files counted. Recovers ~231 files for sharp-corporate, bringing `total_files` within the ±5% tolerance threshold
- **`index_project` total_files under-count for spec/test fixture files**: Scanner now indexes non-Ruby files in `spec/` and `test/` directories — `.json`, `.yml`, `.yaml`. Fixture files, VCR cassettes, and factory YAML are now counted. Recovers 35 files for sharp-corporate, 27 for lf-api, 28 for ellaslist
- **`index_project` jobs under-count for namespaced base classes**: `JOB_PATTERNS.classDeclaration` regex now captures the full namespaced superclass (e.g. `StoreConnect::ScheduledJobBase`) instead of truncating at the first `::` segment. Fixes detection of jobs inheriting from vendor engine base classes where the full name contains 'Job'

## [1.0.30] - 2026-04-03

### Fixed

- **`index_project` models module-only regression**: Fixed over-aggressive module-only detection that excluded namespace-wrapped classes (`module X; class Y`) and POROs without inheritance. Now checks for any `class` keyword in the file (excluding `class << self`) before classifying as module-only. Recovers +16 models (jasper-portals), +10 (quarter-turn), +1 (sharp-corporate, ellaslist, lf-api)
- **`index_project` relationships through-association double-count**: `has_many :x, through: :y` no longer creates a synthetic `has_many` edge to the join model that inflates relationship statistics. The join edge now uses type `has_many_through_join` (still used for graph traversal but excluded from statistics). Eliminates ~40 false positives across 3 apps
- **`index_project` workers under-count for inherited workers**: Worker extraction now accepts classes that inherit from a base worker class (e.g., `class MyWorker < SidekiqWorker`) without requiring an explicit `include Sidekiq::Worker` statement. Fixes jasper-portals workers 1→9
- **`index_project` route_resources under-count**: `namespace` blocks now create their own resource entries (with `type: 'namespace'`), matching how route declarations are conventionally counted. Fixes under-counts in 6 of 8 evaluated apps
- **`index_project` jobs under-count for Delayed::RecurringJob**: Job detection now recognizes `include Delayed::RecurringJob`, `include Delayed::Job`, and `include Resque::Job` as job indicators, not just `ApplicationJob`/`ActiveJob::Base` inheritance. Fixes lf-api jobs 3→14
- **`index_project` jobs over-count from lib/ directory**: Jobs from `lib/` directories are no longer counted in the `jobs` statistic — only jobs from `app/` are included. Fixes sharp-corporate jobs 11→8

## [1.0.29] - 2026-04-03

### Fixed

- **`index_project` relationships over-count**: `statistics.relationships` now counts only model association declarations (`belongs_to`, `has_many`, `has_one`, `has_and_belongs_to_many`) instead of all graph edges (which included inheritance, concerns, schema FKs, convention pairs, routes, tests, helpers, and uploaders). Eliminates ~718 false positives across 8 evaluated apps
- **`index_project` jobs double-counting**: Excludes `ApplicationJob` (abstract base class) and `sidekiq_worker` entries from the jobs statistic. Sidekiq workers are already counted separately under `workers`
- **`index_project` mailers over-count**: Excludes `ApplicationMailer` (abstract base class) from the mailers statistic, consistent with how `ApplicationRecord` is handled for models
- **`index_project` controllers over-count**: Excludes concern files (`app/controllers/concerns/`) from the controllers statistic, consistent with how model concerns are excluded
- **`index_project` models over-count**: Detects module-only files (files with `module` but no `class` and no `ActiveSupport::Concern`) and marks them as `type: 'module'`, excluding them from the model count
- **`index_project` total_files under-count**: Expanded scanner globs to include `.css`, `.scss`, `.sass`, `.coffee`, `.json`, `.jsx`, `.tsx`, `.yaml`, `.rake` files and added `Rakefile`, `Capfile`, `config.ru` to specific files. Added classification rules for `app/assets/`, `app/javascript/`, config catch-all, and lib rake files

## [1.0.28] - 2026-04-03

### Fixed

- **`get_test_conventions` Minitest database strategy detection**: `detectDatabaseStrategy()` now checks `test/test_helper.rb` in addition to `spec/rails_helper.rb`, detecting `fixtures :all` and `use_transactional_fixtures = true` in Minitest projects
- **`get_test_conventions` Minitest auth helper detection**: `detectAuthHelper()` now checks `test/test_helper.rb` and `test/support/` in addition to RSpec paths, detecting Devise includes and custom auth helpers in Minitest projects

### Added

- **`fixtures_usage` field**: `get_test_conventions` now reports whether the project uses test fixtures (detects `fixtures :all` and `fixture_path` configuration)
- **`coverage_tool` field**: `get_test_conventions` now reports the coverage tool (detects `require 'simplecov'` in test helper files)
- **`test_helper_file` field**: `get_test_conventions` now reports the path to the primary test helper file (`spec/rails_helper.rb`, `spec/spec_helper.rb`, or `test/test_helper.rb`)

## [1.0.27] - 2026-04-03

### Fixed

- **`singularize` preserves double-s endings**: Added `/ss$/` → `'ss'` protection rule before catch-all `/s$/` in `SINGULAR_RULES`, matching Rails' ActiveSupport behavior. Without this, `classify('kids_class')` returns `'KidsClas'` instead of `'KidsClass'`, causing test-file matching failures for models like `Activities::KidsClass`

## [1.0.26] - 2026-04-03

### Fixed

- **`get_coverage_gaps` test-file-presence fallback**: When SimpleCov JSON is unavailable, the tool now detects test/spec file presence from the manifest and only reports entities without any test files as coverage gaps. Previously, every model and controller was reported as 100% uncovered when no SimpleCov data existed
- **Namespaced model → test file matching**: `resolveModelName` maps short test names (e.g. `activity_test.rb`) to fully-qualified model keys (e.g. `Activities::Activity`) via `::ClassName` suffix fallback
- **Admin controller → test file matching**: Controller test files under `test/controllers/admin/` are correctly matched to `Admin::*Controller` entities

### Added

- **`has_test` field on gap entries**: Every gap entry now includes `has_test: boolean` indicating whether a matching test/spec file exists, even when SimpleCov data is available

## [1.0.25] - 2026-04-03

### Fixed

- **`index_project` model count includes abstract classes**: `computeStatistics` no longer excludes abstract base classes (e.g. `ApplicationRecord`, `Wordpress::WpBase`) from the `models` count. These are real model classes that define shared associations, validations, and callbacks. Fixes `models: 69` → `models: 71` for ellaslist

### Added

- **Enriched `index_project` statistics**: `computeStatistics` now reports `jobs`, `mailers`, `channels`, and `route_resources` counts from already-extracted data

### Changed

- **Removed redundant statistics fields**: `models_in_manifest` (duplicate of `models_file_count`) and `controllers_all` (duplicate of `controllers`) are no longer returned in `index_project` statistics

## [1.0.24] - 2026-04-03

### Fixed

- **Route resource deduplication**: `get_routes` now merges duplicate `resources` entries that share the same name and namespace. When `draw_routes` includes sub-route files declaring the same resource multiple times (e.g. `resources :businesses, only: [:show]` and `resources :businesses, only: [:index]`), actions, member routes, and collection routes are unioned into a single entry instead of producing duplicates
- **CanCanCan roles preserved when rolify coexists**: When both `cancancan` and `rolify` gems are present, role names extracted from `has_role?(:xxx)` calls in the ability class are no longer overwritten by the rolify model detection pass. `get_overview` and `get_deep_analysis` now correctly report roles like `["admin", "editor", "sales", ...]` instead of an empty array
- **Scanner classifies `*_ability.rb` files as authorization**: Files like `app/models/admin_ability.rb` are now classified as category 9 (authorization) instead of category 1 (models), matching the existing treatment of `ability.rb`
- **`abilityClass` pattern widened**: The CanCanCan ability class detection regex now matches `class AdminAbility`, `class UserAbility`, etc. in addition to `class Ability`
- **Blast radius fuzzy file resolution**: `get_review_context` and `get_blast_radius` now resolve files by basename when the exact path is not in the file entity map. Files referenced with an incorrect directory (e.g. `app/models/user.rb` when the model lives at `app/models/accounts/user.rb`) are matched via basename and reported with a resolution warning instead of silently returning zero entities

## [1.0.23] - 2026-04-03

### Fixed

- **search_patterns category routing**: Category keywords (`scope`, `validates`, `devise`, `enum`, `delegate`, `has_secure_password`) are now routed directly to their dedicated extraction sections via a `CATEGORY_ONLY` guard, preventing false positives from substring matching in callbacks, validations, and concerns

## [1.0.22] - 2026-04-03

### Fixed

- **Enumerize inline comment stripping**: Enumerize declarations containing inline Ruby comments (e.g. `enumerize :field, in: [:a, :b#, :c #:d]`) now correctly strip commented-out values before parsing. Previously, values after `#` comment markers were captured as dirty entries (e.g. `"monthly_by_date#"`, `"#:none"`), producing incorrect enum value lists for models like Activity's `recurrance_type` and `recurrance_onstring`

## [1.0.19] - 2026-04-03

### Fixed

- **Callback type regex alternation ordering**: `after_save_commit`, `after_create_commit`, `after_update_commit`, and `after_destroy_commit` callbacks are now correctly detected — the `_commit` compound variants are matched before their shorter prefixes in the regex alternation (ISSUE-04, ISSUE-15)
- **Multi-method callback expansion**: Callbacks like `after_save_commit :method_a, :method_b` now correctly expand into separate entries per method, as a downstream fix of the regex ordering (ISSUE-15)
- **Enumerize gem detection**: `enumerize :field, in: [:val1, :val2]` declarations are now captured in the model's `enums` field with `syntax: "enumerize"`, supporting symbol, string, and `%w[]` array styles (ISSUE-02)
- **Rolify macro association synthesis**: The `rolify` macro now generates a synthetic `has_and_belongs_to_many` association tagged with `rolify: true`, making rolify-managed relationships visible in model output (ISSUE-03)
- **Model name collision disambiguation**: When two model files produce the same class name key (e.g. `Page` from `app/models/page.rb` and `app/models/wordpress/page.rb`), the second model is now namespaced from its directory path (`Wordpress::Page`) instead of silently overwriting the first (ISSUE-01)
- **Proactive directory-based namespace detection**: Models and controllers in subdirectories (e.g. `app/models/wordpress/page.rb`) now derive their namespace from the directory structure _before_ any collision occurs. `pathToFullClassName` converts `app/models/ckeditor/asset.rb` → `Ckeditor::Asset` regardless of whether a conflicting `Asset` exists. Concerns in `app/models/concerns/` are excluded from namespace prefixing (ISSUE-01, ISSUE-02)
- **Non-AR model classification**: Classes in `app/models/` with no ActiveRecord superclass (e.g. `AdminAbility`, POROs) are now classified as `type: "poro"` with `non_ar: true`, preventing them from appearing as regular AR models in graph queries and `model_list` output (ISSUE-09)
- **STI subclass column resolution**: `get_model` for STI subclasses (e.g. `Venue`, `Event` inheriting from `Activity`) now falls back to the parent model's table for column data, with an `sti_table` annotation noting the shared table (ISSUE-11)
- **`search_patterns` expanded coverage**: The `search_patterns` tool now searches validations, scopes, enums (including enumerize), devise modules, delegations, custom validators, and `has_secure_password` — previously only associations, callbacks, and concerns were searched (ISSUE-07)
- **Authorization role extraction from `has_role?`**: Role names are now extracted from `has_role?(:symbol)` and `has_role?('string')` calls in CanCanCan ability files. A new `abilities_by_role` field groups abilities under each role key. `get_overview` now falls back to ability-class roles when no enum-based role definition exists (ISSUE-05)
- **Mailer classes in relationship graph**: Mailer classes are now registered as graph nodes with inheritance edges (e.g. `ContactMailer → ApplicationMailer`), fixing empty `get_subgraph({ skill: "email" })` results (ISSUE-06, ISSUE-18)
- **Authentication subgraph filtering**: `get_subgraph({ skill: "authentication" })` now post-filters BFS results to exclude non-auth entities (e.g. `Activity`, `Event`) that leaked in via high-connectivity association edges (ISSUE-13)
- **`model_list` superclass accuracy**: `get_deep_analysis({ category: "model_list" })` now returns `superclass: null` for classes without ActiveRecord inheritance (e.g. `AdminAbility`, `Sluggable`) instead of fabricating `ApplicationRecord`. A new `type` field distinguishes models from concerns (ISSUE-08, ISSUE-10)
- **Block callback labelling**: Block-style callbacks (`before_save { ... }`) now report `method: "[block]"` instead of `method: null` (ISSUE-09)
- **Factory detection without Gemfile entry**: `factory_tool` and `factories` fields now detect FactoryBot/Fabrication by scanning factory files when the gem is a transitive dependency not listed directly in the Gemfile (ISSUE-12)
- **Token budget enforcement in `review_context`**: `buildReviewContext` now includes a final trim pass that drops lowest-risk entities when the total output exceeds the token budget, with a 200-token safety margin for JSON structure overhead (ISSUE-14)
- **Blast radius seed count in summary**: `computeBlastRadius` now counts seed (directly changed) entities as CRITICAL in `summary.CRITICAL` and `summary.total`, giving accurate severity totals that include the changed files themselves (ISSUE-16)
- **Factory attribute deduplication**: Factory attributes are now deduplicated before storage, preventing duplicates caused by trait overrides (ISSUE-16)
- **HTTP method on member/collection routes**: Member and collection routes are now stored as `{ action, method }` objects instead of bare strings, disambiguating routes like `PUT :restore` and `POST :restore` (ISSUE-17)
- **Default production `cache_store` reporting**: When `production.rb` has no uncommented `config.cache_store` line, the caching extractor now reports `file_store (Rails default — not explicitly configured)` instead of omitting the entry (ISSUE-11)
- **`controllers_all` statistic**: `computeStatistics` now includes `controllers_all` alongside `controllers`, giving consumers the total extracted controller count including those categorised under authentication (ISSUE-13)

## [1.0.18] - 2026-03-31

### Added

- **Hybrid runtime introspection**: `buildIndex` now optionally executes `src/introspection/introspect.rb` via `bundle exec ruby` to collect live Rails association, callback, route, and database metadata. Runtime data is merged on top of regex extraction results — runtime wins on facts (associations, columns, enums, callbacks), regex wins on structure (scopes, line ranges, strong params)
- **Metaprogrammed association detection**: Associations defined via `define_method`, dynamic `has_many`, or other metaprogramming patterns are now visible in `get_model` output (previously invisible to regex extraction)
- **Inherited controller callback detection**: Before/after action callbacks inherited from `ApplicationController` or other base controllers are now reported in `get_controller` output with `inherited: true`
- **Engine route surfacing**: Routes from mounted engines (Devise, ActiveAdmin, etc.) now appear in the merged route data under `engine_routes`
- **Runtime graph edges**: `buildGraph` uses runtime-resolved `class_name` values for accurate association edges, adds `inherited_dependency` edges from inherited callbacks (e.g. `authenticate_user!` → `User`), and includes runtime-only models as graph nodes
- **`--no-introspection` CLI flag**: Pass `--no-introspection` to skip the Ruby introspection step and run in regex-only mode
- **Introspection metadata in `get_overview`**: The overview now reports `introspection.available`, `models_introspected`, `controllers_introspected`, `routes_introspected`, and `duration_ms`

## [1.0.17] - 2026-03-31

### Fixed

- **Module-wrapped class FQN resolution**: New `ruby-class-resolver` utility resolves fully-qualified class names from outer `module` wrapping (e.g. `module Admin; class UserPresenter`→`Admin::UserPresenter`) for models and components; FQN is now used as the indexer hash key, preventing duplicate/mis-keyed entries for namespaced classes
- **Sidekiq native worker extraction**: Workers under `app/workers/` and `app/sidekiq/` using `sidekiq_options` are now extracted with class, queue, and retry values as `type: 'sidekiq_worker'`, distinct from ActiveJob workers, and are excluded from the ActiveJob scan to prevent double-counting
- **Sidekiq Cron job detection**: Scheduled jobs declared via `Sidekiq::Cron::Job.create` in config initializers are extracted and included in the `jobs` list
- **OmniAuth provider symbols excluded from Devise modules**: Provider symbols after `:omniauthable` (e.g. `:omniauthable, omniauth_providers: [:google]`) were incorrectly included as Devise module names; only the strategy symbol is now captured
- **Multi-DB false positive on YAML anchors**: `database.yml` files using the `&default` anchor and `<<:` merge key pattern no longer trigger multi-database detection unless a real `adapter:` key is present in a non-default section
- **Component sidecar FQN from module wrapping**: ViewComponent classes wrapped in outer modules now resolve to their correct FQN; `extractComponent` uses `resolveFullyQualifiedName` instead of path-derived names
- **View component render counting**: `Search::Component.new(...)` call syntax, `with_collection` renders, and `.turbo_stream.erb` files are now counted in view render tallies
- **Config extractor accuracy**: Miscellaneous improvements to YAML anchor/merge key handling in multi-database detection

## [1.0.16] - 2026-03-31

### Fixed

- **Rolify via schema detection**: Authorization extractor no longer uses a hardcoded `Role = domain-model` heuristic; the `roles` model is now detected by scanning schema for the `rolify` macro declaration on the model itself
- **Component count includes nested sidecar directories**: `get_overview` component count now includes components living in subdirectories of `app/components/` (e.g. `app/components/admin/`)
- **Controller namespace from module wrapping**: Controllers declared inside outer `module` wrappers (e.g. `module Backend; class UsersController`) now extract the correct namespaced class name (`Backend::UsersController`)
- **Multi-DB detection requires `adapter:` key**: A nested database YAML block without an explicit `adapter:` key no longer triggers multi-database detection, reducing false positives from YAML-anchor patterns
- **`resources only: []` yields zero actions**: A `resources` call with an empty `:only` or `:except` array now correctly produces zero route entries rather than all 7 CRUD actions (regression introduced in v1.0.12)
- **Email subgraph seeding from name heuristics**: `get_subgraph` email skill now seeds the BFS traversal from any model or controller whose class name contains `email`, `mail`, or `notification`, improving coverage in apps without a clear mailer hierarchy
- **`after_save_commit` / `after_create_commit` / `after_destroy_commit` callbacks**: Rails transactional callback aliases are now extracted alongside `after_commit`
- **Multi-line filter options with bracket continuation**: `before_action :foo, only: %i[
  index show
]` spanning multiple lines is now parsed correctly
- **Convention pair controller preference**: When matching a resource route to a convention pair, the un-namespaced controller name is now preferred over its namespaced alias, reducing duplicate entries
- **Multi-method callback expansion**: Callbacks like `after_save_commit :method_a, :method_b` are now expanded into separate entries per method

## [1.0.15] - 2026-03-31

### Fixed

- **Route `:only`/`:except` filtering (CRITICAL)**: `resources` and `resource` declarations now correctly filter actions when `:only` or `:except` use hash rocket syntax (`:only => [...]`) or `%i[]` percent-array syntax. Previously all 7 CRUD actions were reported regardless of constraints, causing 50 hallucinated actions in evaluation
- **`model_table_map` phantom tables**: `get_schema` now excludes abstract base classes, STI subclasses (which share a parent table), `ApplicationRecord`, and `*Ability` classes (CanCan). Only models whose table name actually appears in `db/schema.rb` are included
- **Phantom graph nodes from `class_name:` override**: `extractClassName` in the graph builder now handles hash rocket syntax (`:class_name => 'User'`) and unquoted class names (`class_name: AdminUser`), preventing phantom alias nodes from being created alongside the correct target node
- **Devise features deduplication**: `get_overview` `authentication.features` array is now deduplicated via `Set` when multiple Devise models share modules (e.g. `database_authenticatable`). A new `features_by_model` field provides the full per-model breakdown
- **Authorization `roles.model` from rolify**: The authorization extractor now detects the model with `rolify` by reading its class declaration directly, rather than inferring from the CanCan ability initializer parameter. This fixes cases where `AdminUser` was misreported as `User`
- **Conditional `cache_store` detection**: When an environment config contains multiple `config.cache_store =` assignments (e.g. in an `if/else` caching toggle), the extractor now reports all values with a `conditional` note instead of silently picking the first match
- **Non-standard view directories**: `extractViews` now detects additional view directories alongside `app/views/` (e.g. `app/views_mobile/`, `app/views_shared/`) by calling `provider.listDir('app')` and scanning any `views_*` siblings. Results are reported in `additional_view_directories`
- **Blast radius file path for convention-pair entities**: `buildReverseEntityFileMap` now prefers source files (`app/controllers/`, `app/models/`, `app/jobs/`, `app/mailers/`, `app/services/`) over view templates when multiple files map to the same entity, fixing cases where a controller entity resolved to a view path

## [1.0.14] - 2026-03-30

### Fixed

- **Anonymous block callbacks**: Detect `before_save { ... }` and `before_create do...end` block-style callbacks in models (previously only named method callbacks were captured)
- **Multi-attribute old-style validators**: `validates_presence_of :name, :body` now correctly captures all attributes, not just the first
- **Devise scope-directory controllers**: Path-based detection for custom Devise controllers in scope directories (e.g. `app/controllers/admin_users/sessions_controller.rb`), increasing detection from 4 to 12
- **HAML fragment caching**: HAML `- cache key do` syntax is now counted alongside ERB `<% cache key do %>` fragment cache calls
- **Rails.cache operation counting**: Add `rails_cache_ops_count` for `.read`, `.write`, `.delete`, `.delete_matched`, `.exist?` calls (previously only `.fetch` was counted)
- **Paperclip image processing**: Paperclip gem is now reported as an image processing library with `imagemagick` backend
- **Minitest test edges in blast radius graph**: `_test.rb` files now create `tests` edges in the relationship graph (previously only `_spec.rb` RSpec files did)
- **Custom rate limiting detection**: Heuristic scan for `before_action :check_rate_limit`, `class RateLimiter`, and similar patterns in controllers
- **Auth subgraph relevance filter**: Authentication subgraph BFS expansion now excludes `inherits` edges, preventing unrelated legacy models from ranking above actual auth models
- **Mailer superclass full namespace**: `ActionMailer::Base` and `Devise::Mailer` are now captured in full instead of being truncated to the first component
- **Model count visibility**: `statistics.models_file_count` added to expose the manifest file count alongside the extracted model count, making any extraction gap visible to AI agents
- **Text-format template glob coverage**: Scanner now includes `.text.erb`, `.text.haml`, `.text.slim`, `.js.erb`, and `.xml.erb` templates, fixing undercounted view totals

## [1.0.13] - 2026-03-30

### Fixed

- **Version detector comment stripping**: Comments in `config/application.rb` and `config/environment.rb` were matched against Rails version patterns; comments are now stripped before detection, eliminating version misidentification from commented-out config
- **Devise sub-controller discovery**: Auth extractor now includes Devise sub-controllers from auth-classified scanner entries (e.g. `app/controllers/users/sessions_controller.rb`), not just from path pattern matching
- **`validates_presence_of` old-style validator**: Multi-attribute declarations (`validates_presence_of :name, :email`) are now correctly extracted (previously only the first attribute was captured)
- **FriendlyId excluded from `extends` array**: FriendlyId was incorrectly reported as a model extension; it is now excluded from the `extends` list
- **Gemfile and `database.yml.example` fallback**: Adapter detection falls back to `Gemfile` gem inference (`pg`, `mysql2`, `sqlite3`) and `database.yml.example` when `database.yml` is absent or incomplete
- **CanCan `Ability` class scan covers all model files**: `can`/`cannot` rule extraction now scans every model file for a `CanCan::Ability` class declaration, not just the first match
- **Hash-rocket root route syntax**: `root :to => 'pages#home'` is now parsed alongside the modern `root to:` syntax
- **Minitest files in well-tested examples**: `get_well_tested_examples` now includes `_test.rb` Minitest files alongside `_spec.rb` RSpec files
- **Multi-method `before_action` expansion**: `before_action :authenticate_user!, :set_locale` expands into separate filter entries per method
- **`models_in_manifest` count**: `get_overview` now reports `statistics.models_in_manifest` (file count) alongside the extracted model count, making any extraction gap visible to AI agents

## [1.0.12] - 2026-03-30

### Fixed

- **Stale index cache invalidation**: Force-re-index now correctly clears the cached index before rebuilding
- **Secret exposure prevention**: Credentials and secret values are redacted from `get_full_index` and `get_overview` output
- **Gemfile comment exclusion**: Commented-out gem lines are no longer matched by the Gemfile extractor
- **Config comment exclusion**: Commented-out config lines are excluded from all config extractors
- **Devise module detection**: All Devise strategy modules are extracted per model rather than aggregated globally
- **`[object Object]` serialization bug**: Several tool responses were serializing nested objects as `[object Object]`; proper JSON traversal is now used throughout
- **Controller namespace extraction**: Namespace-prefixed controller names (`Admin::UsersController`) are detected from file path and class declaration
- **`test_framework` field in `get_overview`**: Test framework is now always reported in the overview response
- **`search_patterns` handler fixes**: `cb.name` corrected to `cb.method` for callback matching; stale `ctrl.before_actions` reference replaced with `ctrl.filters || []`
- **Policy method extraction**: Pundit policy methods are fully extracted including query methods (`show?`, `update?`, etc.)
- **Subgraph seeding improvements**: BFS traversal now seeds correctly from authentication and database subgraph roots
- **`devise_for`, `draw`, and nested route parsing**: `devise_for :users`, `draw :admin`, and deeply nested `resources` blocks are now parsed correctly
- **Cache scan completeness**: Fragment cache detection covers all ERB and HAML patterns
- **ActiveStorage attachment detection**: `has_one_attached` and `has_many_attached` declarations are extracted from all model files
- **Blast radius accuracy**: Impact analysis correctly traverses reverse adjacency for indirect file changes
- **`get_overview` custom patterns**: User-declared conventions from `claude.md` are reflected in the overview
- **Model count accuracy**: Model counts match the number of extracted models, not scanner file count
- **CanCan detection from `Ability` class**: `CanCan::Ability` subclass is detected from any model file
- **Turbo Stream broadcast extraction**: `broadcast_to`, `broadcast_append_to`, `broadcast_prepend_to` in models are captured
- **`cable.yml` adapter detection**: ActionCable adapter is extracted from `cable.yml` (Redis, Async, PostgreSQL)
- **Model callback completeness**: All `before_*`, `after_*`, `around_*` callback forms including blocks and multi-method variants are extracted
- **Form helper counting**: `form_with`, `form_for`, `form_tag` calls are tallied in the views extractor
- **HAML template support**: HAML views are scanned for partials, cache blocks, and form helpers
- **Asset pipeline variant detection**: Sprockets, Propshaft, Webpacker, import maps, and Vite are all identified
- **Test identifier extraction**: Spec and test file identifiers include `describe`/`context` block labels
- **`validates_with` extraction**: Custom validator classes referenced via `validates_with` are captured
- **`stream_from` channel detection**: `stream_from` and `stream_for` in ActionCable channels are extracted
- **Paperclip attachment detection**: Paperclip `has_attached_file` is extracted as an attachment alongside ActiveStorage
- **`use_transactional_fixtures` detection**: Test suite transaction strategy is exported in test conventions
- **Layout detection**: Controller `layout` declarations (including conditional procs) are extracted
- **Spec style accuracy**: RSpec vs Minitest detection consolidated into shared `detectSpecStyle` utility
- **Ruby version detection**: `.ruby-version` file is read as the primary Ruby version source
- **JWT detection**: JWT usage is identified in auth extractor via Gemfile and controller patterns
- **Rescue handler extraction**: `rescue_from` declarations in controllers are extracted with handler method names
- **CarrierWave storage backend**: CarrierWave uploaders report storage backend (`file`, `fog`, `cloudinary`, etc.)

## [1.0.11] - 2026-03-27

### Changed

- README updates

## [1.0.10] - 2026-03-27

### Fixed

- Update Claude Code and Cursor integration examples to use direct `node` path instead of `npx` (avoids PATH resolution issues on macOS with Homebrew)
- Add `-p .` flag to set project root explicitly
- Add `npm root -g` instructions to help users find the correct path

## [1.0.9] - 2026-03-26

### Fixed

- Update VS Code `mcp.json` example to use direct `node` path instead of `npx` to avoid `npx` resolving to a different Node.js installation than expected
- Fix corrupted README heading

## [1.0.8] - 2026-03-26

### Fixed

- Resume `process.stdin` after connecting the stdio transport so Node.js doesn't exit when the event loop goes idle
- Yield to the event loop (via `setImmediate`) between connecting the transport and running `buildIndex`, so the MCP SDK can process VS Code's initialize handshake before the synchronous file-scanning pipeline blocks the thread

## [1.0.7] - 2026-03-26

### Fixed

- Connect MCP stdio transport before building the index so VS Code's initialization handshake completes immediately instead of timing out
- Correct package name in VS Code `mcp.json` documentation (`@reinteractive/rails-insight`, not `railsinsight`)
- Add required `"type": "stdio"` field to VS Code MCP config example
- Add `-y` flag to all `npx` invocations to skip interactive install prompts

## [0.3.0] - 2026-03-20

### Added

- `src/utils/inflector.js` — Ruby-compatible inflector with pluralize, singularize, classify, tableize, and underscore
- `src/utils/spec-style-detector.js` — Shared spec-style detection utility (RSpec vs Minitest)
- Scanner rule for `app/workers/*.rb` and `app/sidekiq/*.rb` → category 10 (jobs) with `workerType: 'sidekiq_native'` flag
- Scanner rule for `app/helpers/*.rb` → category 7 (views)
- Scanner rule for `app/validators/*.rb` → category 26 (design_patterns)
- Scanner rule for `app/uploaders/*.rb` → category 12 (storage)
- Scanner rule for `app/notifiers/*.rb` → category 40 (notifications)
- Glob expansion for `app/**/*.json.erb` capturing Rails 8 PWA manifest templates
- `pwaFile: true` flag on entries under `app/views/pwa/`
- `json_erb` file type detection
- `src/extractors/worker.js` — Sidekiq native worker extractor (class, queue, retry, perform args)
- `src/extractors/helper.js` — Helper extractor (module name, public methods, controller association by convention)
- `src/extractors/uploader.js` — CarrierWave and Shrine uploader extractor with `detectMountedUploaders` cross-reference
- `src/core/patterns/worker.js`, `helper.js`, `uploader.js` — domain-specific regex pattern files
- Two new graph edge types: `helps_view` (weight 0.5, helper → controller) and `manages_upload` (weight 1.0, model → uploader)
- Worker, helper, and uploader nodes and relationships in `buildGraph`
- `helpers`, `workers`, and `uploaders` extraction containers in indexer
- `pwa: { detected: boolean }` field in index output
- `helpers`, `workers`, `uploaders` counts in `computeStatistics`
- Helper and worker file-to-entity mappings in `buildFileEntityMap`
- `workers`, `helpers`, `uploaders`, and `pwa` sections in `get_overview` tool response
- Forward adjacency now stores `{ to, weight, type }` objects for typed edge traversal
- O(out-degree) `_enqueueNeighbours` in graph BFS replacing full-edge scan
- `class_name:` override support in model associations for graph edge targets
- `through:` and `polymorphic:` association handling in graph builder
- Expanded `fileEntityMap` to cover jobs, mailers, policies, services, channels, and migrations
- `tests` edge type excluded from blast-radius BFS to prevent test fan-out
- Method-level `method_line_ranges` with depth-tracking for nested `def`/`end` blocks in model extractor
- Coverage-path conventions for Minitest and RSpec via `deriveTestCoverageMapping`
- Shared `detectSpecStyle` in test-conventions extractor (delegates to `spec-style-detector`)
- `description` field in `list_tools` output for every registered tool
- Namespace-aware view-to-controller mapping via `deriveControllerClassName`
- `safeExtract` error boundary wrapping for all extractors in the indexer
- `extraction_errors` array in index output capturing extractor failures with file path, error name, and message
- `isError` flag on scan entries for files that fail to read
- `timeoutMs` option in local filesystem provider with per-file read timeout support
- Model-level `strict_loading` detection (`self.strict_loading_by_default = true`)
- Association-level `strict_loading: true` extraction
- Enum `validate: true` option detection (modern and legacy hash syntax)
- `turbo_refreshes_with` (method and scroll) extraction in model extractor
- `generates_token_for` extraction in auth extractor with security features cross-reference
- STI (Single Table Inheritance) detection post-pass in indexer: `sti_base`, `sti_subclasses`, `sti_parent`
- Content-aware token estimation: prose (4.0), JSON (3.0), and code (3.5) chars-per-token ratios
- YAML anchor (`&`), alias (`*`), and merge key (`<<:`) support in YAML parser
- Composite primary key detection in schema extractor (`primary_key: [:col1, :col2]`)
- Route nesting tracking with `nested_relationships` array and `parent_resource` fields
- `extraction_errors` count and details in `get_overview` tool response
- Circular symlink protection in local filesystem provider glob via visited-set tracking

### Fixed

- `search_patterns` handler: `cb.name` → `cb.method` for callback matching
- `search_patterns` handler: removed dead `ctrl.before_actions` reference, now uses `ctrl.filters || []`
- Factory registry extractor: skip `FactoryBot.define do` wrapper line to avoid false depth tracking
- Graph `classify` for controller/request spec names no longer singularizes (preserves `UsersController`)

### Changed

- Graph adjacency internals refactored from flat edge list to forward/reverse adjacency maps
- Blast radius uses `index.graph` directly instead of rebuilding graph
- `normalizes` extraction returns `Array<{ attribute, expression }>` instead of `string[]`
- Token estimation uses content-detection heuristics instead of flat 4.0 ratio

## [0.2.1] - 2026-03-19

### Fixed

- Path traversal protection in local filesystem provider
- Git ref validation to prevent command injection in blast radius tools
- Dependency vulnerability in `hono` (prototype pollution)

### Changed

- Server version now read dynamically from `package.json`
- Package published to public npm registry instead of GitHub Packages
- README rewritten for public release

## [0.2.0] - 2026-03-18

### Added

- Blast radius analysis: `get_blast_radius` and `get_review_context` MCP tools
- Git diff detection with automatic changed-file discovery
- Reverse adjacency map and BFS traversal in relationship graph
- Risk classification (CRITICAL / HIGH / MEDIUM / LOW) for impacted entities
- File-to-entity mapping for blast radius seed resolution

## [0.1.0] - 2026-03-01

### Added

- Initial release as MCP server over stdio
- 56-category file classification via path-based scanning
- 19 deep extractors: models, controllers, routes, schema, components, Stimulus, auth, authorization, jobs, email, storage, caching, realtime, API, views, config, tier 2, tier 3, test conventions
- Directed weighted graph with 22 edge types and Personalized PageRank
- Convention drift detection from `claude.md` / `CLAUDE.md`
- Token-budget-aware JSON formatting
- Rails 6.0–8.1+ version support
- 10 MCP tools: `index_project`, `get_overview`, `get_full_index`, `get_model`, `get_controller`, `get_routes`, `get_schema`, `get_subgraph`, `search_patterns`, `get_deep_analysis`
