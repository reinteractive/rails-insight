import { describe, it, expect } from 'vitest'
import { classifySpecFile } from '../../src/core/scanner.js'

describe('classifySpecFile — additional directories', () => {
  it('classifies helper specs', () => {
    expect(classifySpecFile('spec/helpers/application_helper_spec.rb')).toBe('helper_specs')
  })

  it('classifies feature specs', () => {
    expect(classifySpecFile('spec/features/user_signs_in_spec.rb')).toBe('feature_specs')
  })

  it('classifies system specs', () => {
    expect(classifySpecFile('spec/system/dashboard_spec.rb')).toBe('system_specs')
  })

  it('classifies view specs', () => {
    expect(classifySpecFile('spec/views/users/show_spec.rb')).toBe('view_specs')
  })

  it('classifies routing specs', () => {
    expect(classifySpecFile('spec/routing/posts_routing_spec.rb')).toBe('routing_specs')
  })

  it('classifies worker specs', () => {
    expect(classifySpecFile('spec/workers/import_worker_spec.rb')).toBe('worker_specs')
  })

  it('classifies lib specs', () => {
    expect(classifySpecFile('spec/lib/csv_parser_spec.rb')).toBe('lib_specs')
  })

  it('classifies integration specs', () => {
    expect(classifySpecFile('spec/integration/checkout_spec.rb')).toBe('integration_specs')
  })

  it('classifies decorator specs', () => {
    expect(classifySpecFile('spec/decorators/user_decorator_spec.rb')).toBe('decorator_specs')
  })

  it('classifies serializer specs', () => {
    expect(classifySpecFile('spec/serializers/user_serializer_spec.rb')).toBe('serializer_specs')
  })

  it('classifies presenter specs', () => {
    expect(classifySpecFile('spec/presenters/dashboard_presenter_spec.rb')).toBe('presenter_specs')
  })

  // Minitest directories
  it('classifies test/helpers', () => {
    expect(classifySpecFile('test/helpers/application_helper_test.rb')).toBe('helper_tests')
  })

  it('classifies test/system', () => {
    expect(classifySpecFile('test/system/dashboard_test.rb')).toBe('system_tests')
  })

  it('classifies test/jobs', () => {
    expect(classifySpecFile('test/jobs/import_job_test.rb')).toBe('job_tests')
  })

  it('classifies test/mailers', () => {
    expect(classifySpecFile('test/mailers/welcome_mailer_test.rb')).toBe('mailer_tests')
  })

  it('classifies test/services', () => {
    expect(classifySpecFile('test/services/payment_service_test.rb')).toBe('service_tests')
  })
})
