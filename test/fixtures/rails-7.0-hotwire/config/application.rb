require_relative "boot"

require "rails/all"

Bundler.require(*Rails.groups)

module HotwireApp
  class Application < Rails::Application
    config.load_defaults 7.0

    config.active_job.queue_adapter = :sidekiq

    config.time_zone = "UTC"
  end
end
