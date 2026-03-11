# Project Instructions

## Stack

- Ruby 3.2.2
- Rails 7.1
- PostgreSQL 15
- Redis for caching and Sidekiq
- Hotwire (Turbo + Stimulus)
- Tailwind CSS
- Import maps

## Gems

- devise for authentication
- pundit for authorization
- pagy for pagination
- searchkick for search
- sidekiq for background jobs
- factory_bot for test factories

## Conventions

- Always use service objects for business logic
- Prefer form objects for complex validations
- Use query objects for complex database queries
- Never put business logic in controllers
- Use concerns for shared model behavior
- Prefer `has_secure_password` over custom solutions for simple auth

## Testing

- RSpec for all tests
- Factory Bot for test data
- Capybara + Selenium for system tests
- Aim for 90% code coverage
- Write request specs for all API endpoints

## Deployment

- Deploy with Kamal 2
- Docker containers
- GitHub Actions CI/CD pipeline
- Staging environment mirrors production
