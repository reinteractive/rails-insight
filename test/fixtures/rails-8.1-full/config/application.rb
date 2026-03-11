require_relative "boot"

require "rails/all"

# Require the gems listed in Gemfile, including any gems
# you've limited to :test, :development, or :production.
Bundler.require(*Rails.groups)

module TestApp
  class Application < Rails::Application
    # Initialize configuration defaults for originally generated Rails version.
    config.load_defaults 8.1

    # Please, add to the whitelist of allowed locales available for the application.
    # config.i18n.available_locales = [:en]

    # Set Time.zone default to the specified zone and make Active Record auto-convert to this zone.
    config.time_zone = "UTC"

    # Use solid_queue as the Active Job queue adapter
    config.active_job.queue_adapter = :solid_queue

    # Don't generate system test files.
    config.generators.system_tests = nil

    # Use RSpec for testing
    config.generators do |g|
      g.test_framework :rspec,
        fixtures: true,
        view_specs: false,
        helper_specs: false,
        routing_specs: false,
        request_specs: true,
        controller_specs: false
      g.fixture_replacement :factory_bot, dir: "spec/factories"
    end
  end
end
