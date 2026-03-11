require_relative "boot"

require "rails/all"

Bundler.require(*Rails.groups)

module ClassicApp
  class Application < Rails::Application
    config.load_defaults 6.1

    config.active_job.queue_adapter = :sidekiq

    config.time_zone = "UTC"
    config.eager_load_paths << Rails.root.join("lib")
  end
end
