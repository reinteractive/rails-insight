require "active_support/core_ext/integer/time"

Rails.application.configure do
  config.enable_reloading = false
  config.eager_load = true
  config.consider_all_requests_local = false
  config.action_controller.perform_caching = true

  # Cache store
  config.cache_store = :solid_cache_store

  # Active Job
  config.active_job.queue_adapter = :solid_queue

  # Active Storage
  config.active_storage.service = :amazon

  # Force SSL
  config.force_ssl = true
  config.assume_ssl = true

  # Logging
  config.log_tags = [:request_id]
  config.logger = ActiveSupport::TaggedLogging.logger(STDOUT)
  config.log_level = ENV.fetch("RAILS_LOG_LEVEL", "info")

  # Action Mailer
  config.action_mailer.perform_caching = false
  config.action_mailer.default_url_options = { host: "testapp.com" }

  # i18n
  config.i18n.fallbacks = true

  # Active Support
  config.active_support.report_deprecations = false

  # Active Record
  config.active_record.dump_schema_after_migration = false
end
