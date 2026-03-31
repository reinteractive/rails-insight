#!/usr/bin/env ruby
# frozen_string_literal: true

# RailsInsight — Runtime Introspection Script
#
# Boots the Rails app and collects model, controller, route, and database
# metadata as a single JSON object on $stdout.
#
# Diagnostic messages go to $stderr only.
# Each section has independent error handling so a failure in one section
# does not prevent the others from being collected.

require 'json'

begin
  require_relative File.join(Dir.pwd, 'config', 'environment')
rescue LoadError => e
  $stderr.puts "[railsinsight] Failed to load Rails environment: #{e.message}"
  $stdout.puts JSON.generate({ models: nil, controllers: nil, routes: nil, database: nil, errors: [e.message] })
  exit 1
rescue => e
  $stderr.puts "[railsinsight] Unexpected error booting Rails: #{e.message}"
  $stdout.puts JSON.generate({ models: nil, controllers: nil, routes: nil, database: nil, errors: [e.message] })
  exit 1
end

MAX_ASSOCIATIONS = 200
MAX_ROUTES = 500

errors = []

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
models = nil
begin
  ActiveRecord::Base.descendants
  models = {}

  ActiveRecord::Base.descendants.each do |klass|
    next if klass.abstract_class?
    next unless klass.name

    associations = []
    begin
      klass.reflect_on_all_associations.first(MAX_ASSOCIATIONS).each do |ref|
        assoc = {
          macro: ref.macro.to_s,
          name: ref.name.to_s,
          class_name: nil,
          foreign_key: nil,
          options: {},
          through: nil,
          polymorphic: ref.options[:polymorphic] == true,
        }

        begin
          assoc[:class_name] = ref.class_name
        rescue => _
          assoc[:class_name] = nil
        end

        begin
          assoc[:foreign_key] = ref.foreign_key.to_s if ref.respond_to?(:foreign_key) && ref.foreign_key
        rescue => _
          # ignore
        end

        if ref.options[:through]
          assoc[:through] = ref.options[:through].to_s
          assoc[:options] = { through: ref.options[:through].to_s }
        end

        non_default_opts = ref.options.reject { |k, _| [:through, :polymorphic].include?(k) }
        assoc[:options] = assoc[:options].merge(
          non_default_opts.transform_keys(&:to_s).transform_values { |v| v.respond_to?(:to_s) ? v.to_s : v }
        ) unless non_default_opts.empty?

        associations << assoc
      end
    rescue => e
      $stderr.puts "[railsinsight] Error reflecting associations for #{klass.name}: #{e.message}"
    end

    columns = []
    begin
      klass.columns.each do |col|
        columns << {
          name: col.name,
          sql_type: col.sql_type,
          type: col.type.to_s,
          null: col.null,
          default: col.default,
        }
      end
    rescue => e
      $stderr.puts "[railsinsight] Error reading columns for #{klass.name}: #{e.message}"
    end

    validators = []
    begin
      klass.validators.each do |v|
        entry = { kind: v.class.name.demodulize.sub('Validator', '').downcase, attributes: v.attributes.map(&:to_s) }
        entry[:options] = v.options.transform_keys(&:to_s) unless v.options.empty?
        validators << entry
      end
    rescue => e
      $stderr.puts "[railsinsight] Error reading validators for #{klass.name}: #{e.message}"
    end

    enums = {}
    begin
      if klass.respond_to?(:defined_enums)
        klass.defined_enums.each do |enum_name, mapping|
          values = mapping.keys
          value_map = mapping.transform_values { |v| v }
          enums[enum_name] = { values: values, value_map: value_map }
        end
      end
    rescue => e
      $stderr.puts "[railsinsight] Error reading enums for #{klass.name}: #{e.message}"
    end

    callbacks = []
    begin
      if klass.respond_to?(:_process_action_callbacks)
        klass._process_action_callbacks.each do |cb|
          callbacks << {
            kind: cb.kind.to_s,
            filter: cb.filter.to_s,
            options: {},
          }
        end
      end
    rescue => e
      $stderr.puts "[railsinsight] Error reading AR callbacks for #{klass.name}: #{e.message}"
    end

    devise_modules = nil
    begin
      if klass.respond_to?(:devise_modules)
        devise_modules = klass.devise_modules.map(&:to_s)
      end
    rescue => e
      $stderr.puts "[railsinsight] Error reading devise modules for #{klass.name}: #{e.message}"
    end

    models[klass.name] = {
      class_name: klass.name,
      table_name: klass.table_name,
      superclass: klass.superclass.name,
      abstract: false,
      associations: associations,
      columns: columns,
      validators: validators,
      enums: enums,
      callbacks: callbacks,
      devise_modules: devise_modules,
    }
  end
rescue => e
  $stderr.puts "[railsinsight] Error collecting models: #{e.message}"
  errors << "models: #{e.message}"
  models = nil
end

# ---------------------------------------------------------------------------
# Controllers
# ---------------------------------------------------------------------------
controllers = nil
begin
  ActionController::Base.descendants
  controllers = {}

  ActionController::Base.descendants.each do |klass|
    next unless klass.name

    actions = []
    begin
      actions = klass.action_methods.to_a.sort
    rescue => e
      $stderr.puts "[railsinsight] Error reading actions for #{klass.name}: #{e.message}"
    end

    callbacks = []
    begin
      if klass.respond_to?(:_process_action_callbacks)
        klass._process_action_callbacks.each do |cb|
          callbacks << {
            kind: cb.kind.to_s,
            filter: cb.filter.to_s,
            options: (cb.options || {}).transform_keys(&:to_s),
            inherited: cb.filter.to_s.present? && !klass.instance_methods(false).include?(cb.filter),
          }
        end
      end
    rescue => e
      $stderr.puts "[railsinsight] Error reading callbacks for #{klass.name}: #{e.message}"
    end

    controllers[klass.name] = {
      class_name: klass.name,
      superclass: klass.superclass&.name,
      actions: actions,
      callbacks: callbacks,
    }
  end
rescue => e
  $stderr.puts "[railsinsight] Error collecting controllers: #{e.message}"
  errors << "controllers: #{e.message}"
  controllers = nil
end

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
routes = nil
begin
  routes = []
  count = 0

  Rails.application.routes.routes.each do |route|
    break if count >= MAX_ROUTES

    path_spec = route.path.spec.to_s
    next if path_spec.start_with?('/rails/')

    verb = route.verb.is_a?(String) ? route.verb : route.verb.source.gsub(/[\^$]/, '')
    defaults = route.defaults
    controller = defaults[:controller]
    action = defaults[:action]

    next unless controller && action

    routes << {
      verb: verb,
      path: path_spec,
      controller: controller,
      action: action,
      name: route.name,
      constraints: {},
      engine: nil,
    }
    count += 1
  end
rescue => e
  $stderr.puts "[railsinsight] Error collecting routes: #{e.message}"
  errors << "routes: #{e.message}"
  routes = nil
end

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
database = nil
begin
  conn = ActiveRecord::Base.connection

  adapter = conn.adapter_name

  database_version = nil
  begin
    database_version = conn.database_version.to_s if conn.respond_to?(:database_version)
  rescue => _
    database_version = nil
  end

  tables = conn.tables

  foreign_keys = []
  begin
    tables.each do |table|
      conn.foreign_keys(table).each do |fk|
        foreign_keys << {
          from_table: table,
          to_table: fk.to_table,
          column: fk.column,
          primary_key: fk.primary_key,
          name: fk.name,
        }
      end
    end
  rescue => e
    $stderr.puts "[railsinsight] Error collecting foreign keys: #{e.message}"
  end

  database = {
    adapter: adapter,
    database_version: database_version,
    tables: tables,
    foreign_keys: foreign_keys,
  }
rescue => e
  $stderr.puts "[railsinsight] Error collecting database metadata: #{e.message}"
  errors << "database: #{e.message}"
  database = nil
end

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
result = {
  models: models,
  controllers: controllers,
  routes: routes,
  database: database,
}
result[:errors] = errors unless errors.empty?

$stdout.puts JSON.generate(result)
