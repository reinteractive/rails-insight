import { describe, it, expect } from 'vitest'
import {
  JOB_PATTERNS,
  EMAIL_PATTERNS,
  STORAGE_PATTERNS,
  CACHING_PATTERNS,
  REALTIME_PATTERNS,
  API_PATTERNS,
  VIEW_PATTERNS,
  GEMFILE_PATTERNS,
  CONFIG_PATTERNS,
} from '../../src/core/patterns.js'

// ── JOB_PATTERNS ──────────────────────────────────────────────────────
describe('JOB_PATTERNS', () => {
  it('matches ApplicationJob subclass', () => {
    expect('class ImportJob < ApplicationJob').toMatch(
      JOB_PATTERNS.classDeclaration,
    )
  })
  it('matches queue_as', () => {
    expect('  queue_as :default').toMatch(JOB_PATTERNS.queueAs)
  })
  it('matches retry_on', () => {
    expect(
      '  retry_on ActiveJob::DeserializationError, wait: 5.seconds',
    ).toMatch(JOB_PATTERNS.retryOn)
  })
  it('matches discard_on', () => {
    expect('  discard_on CustomError').toMatch(JOB_PATTERNS.discardOn)
  })
  it('matches perform_later', () => {
    expect('  ImportJob.perform_later(user)').toMatch(JOB_PATTERNS.performLater)
  })
  it('matches sidekiq options', () => {
    expect('  sidekiq_options queue: :critical, retry: 5').toMatch(
      JOB_PATTERNS.sidekiqOptions,
    )
  })
})

// ── EMAIL_PATTERNS ────────────────────────────────────────────────────
describe('EMAIL_PATTERNS', () => {
  it('matches ApplicationMailer subclass', () => {
    expect('class UserMailer < ApplicationMailer').toMatch(
      EMAIL_PATTERNS.mailerClass,
    )
  })
  it('matches mail() call', () => {
    expect('    mail(to: @user.email, subject: "Welcome")').toMatch(
      EMAIL_PATTERNS.mailCall,
    )
  })
  it('matches default from', () => {
    expect('  default from: "no-reply@example.com"').toMatch(
      EMAIL_PATTERNS.defaultFrom,
    )
  })
  it('matches layout declaration', () => {
    expect('  layout "mailer"').toMatch(EMAIL_PATTERNS.mailerLayout)
  })
  it('matches deliver_now', () => {
    expect('  UserMailer.welcome_email(@user).deliver_now').toMatch(
      EMAIL_PATTERNS.deliverNow,
    )
  })
  it('matches deliver_later', () => {
    expect('  UserMailer.welcome_email(@user).deliver_later').toMatch(
      EMAIL_PATTERNS.deliverLater,
    )
  })
  it('matches attachments', () => {
    expect('    attachments["file.pdf"] = File.read("/path")').toMatch(
      EMAIL_PATTERNS.attachments,
    )
  })
})

// ── STORAGE_PATTERNS ──────────────────────────────────────────────────
describe('STORAGE_PATTERNS', () => {
  it('matches has_one_attached', () => {
    expect('  has_one_attached :avatar').toMatch(
      STORAGE_PATTERNS.hasOneAttached,
    )
  })
  it('matches has_many_attached', () => {
    expect('  has_many_attached :images').toMatch(
      STORAGE_PATTERNS.hasManyAttached,
    )
  })
  it('matches variant call', () => {
    expect('  image.variant(resize_to_limit: [100, 100])').toMatch(
      STORAGE_PATTERNS.variant,
    )
  })
  it('matches service declaration', () => {
    expect('amazon:\n  service: S3').toMatch(STORAGE_PATTERNS.storageService)
  })
  it('matches purge', () => {
    expect('  @user.avatar.purge_later').toMatch(STORAGE_PATTERNS.purge)
  })
})

// ── CACHING_PATTERNS ──────────────────────────────────────────────────
describe('CACHING_PATTERNS', () => {
  it('matches Rails.cache', () => {
    expect('  Rails.cache.fetch("key") { value }').toMatch(
      CACHING_PATTERNS.railsCache,
    )
  })
  it('matches fragment cache', () => {
    expect('  <% cache @product do %>').toMatch(CACHING_PATTERNS.fragmentCache)
  })
  it('matches expires_in', () => {
    expect('  expires_in 1.hour, public: true').toMatch(
      CACHING_PATTERNS.expiresIn,
    )
  })
  it('matches russian doll', () => {
    expect('  <% cache [current_user, @post] do %>').toMatch(
      CACHING_PATTERNS.russianDoll,
    )
  })
  it('matches cache_key', () => {
    expect('  def cache_key').toMatch(CACHING_PATTERNS.cacheKey)
  })
  it('matches cache store config', () => {
    expect('  config.cache_store = :redis_cache_store').toMatch(
      CACHING_PATTERNS.cacheStore,
    )
  })
  it('matches caches_action', () => {
    expect('  caches_action :index').toMatch(CACHING_PATTERNS.cachesAction)
  })
})

// ── REALTIME_PATTERNS ─────────────────────────────────────────────────
describe('REALTIME_PATTERNS', () => {
  it('matches ApplicationCable::Channel subclass', () => {
    expect('class ChatChannel < ApplicationCable::Channel').toMatch(
      REALTIME_PATTERNS.channelClass,
    )
  })
  it('matches stream_from', () => {
    expect('  stream_from "chat_#{params[:room]}"').toMatch(
      REALTIME_PATTERNS.streamFrom,
    )
  })
  it('matches stream_for', () => {
    expect('  stream_for user').toMatch(REALTIME_PATTERNS.streamFor)
  })
  it('matches broadcast call', () => {
    expect(
      '  ActionCable.server.broadcast("chat_room", message: "hello")',
    ).toMatch(REALTIME_PATTERNS.broadcast)
  })
  it('matches Turbo::StreamsChannel', () => {
    expect(
      '  Turbo::StreamsChannel.broadcast_append_to(post, target: "comments")',
    ).toMatch(REALTIME_PATTERNS.turboStream)
  })
  it('matches broadcasts_to', () => {
    expect('  broadcasts_to :room').toMatch(REALTIME_PATTERNS.broadcastsTo)
  })
})

// ── API_PATTERNS ──────────────────────────────────────────────────────
describe('API_PATTERNS', () => {
  it('matches render json', () => {
    expect('  render json: @users').toMatch(API_PATTERNS.renderJson)
  })
  it('matches respond_to block', () => {
    expect('  respond_to do |format|').toMatch(API_PATTERNS.respondTo)
  })
  it('matches jbuilder template', () => {
    expect('json.extract! @user, :id, :name, :email').toMatch(
      API_PATTERNS.jbuilder,
    )
  })
  it('matches serializer class', () => {
    expect('class UserSerializer < ActiveModel::Serializer').toMatch(
      API_PATTERNS.serializerClass,
    )
  })
  it('matches api namespace', () => {
    expect('  namespace :api do').toMatch(API_PATTERNS.apiNamespace)
  })
  it('matches api versioning', () => {
    expect('  namespace :v1 do').toMatch(API_PATTERNS.apiVersion)
  })
  it('matches skip_before_action :verify_authenticity_token', () => {
    expect('  skip_before_action :verify_authenticity_token').toMatch(
      API_PATTERNS.skipCsrf,
    )
  })
  it('matches grape API class', () => {
    expect('class API < Grape::API').toMatch(API_PATTERNS.grapeApi)
  })
  it('matches graphql field', () => {
    expect('  field :name, String, null: false').toMatch(
      API_PATTERNS.graphqlField,
    )
  })
})

// ── VIEW_PATTERNS ─────────────────────────────────────────────────────
describe('VIEW_PATTERNS', () => {
  it('matches render partial', () => {
    expect("  render partial: 'shared/header'").toMatch(
      VIEW_PATTERNS.partialRender,
    )
  })
  it('matches render inline partial', () => {
    expect("  render 'shared/header'").toMatch(VIEW_PATTERNS.partialRender)
  })
  it('matches yield', () => {
    expect('  <%= yield :sidebar %>').toMatch(VIEW_PATTERNS.yieldContent)
  })
  it('matches content_for', () => {
    expect('  <% content_for :sidebar do %>').toMatch(VIEW_PATTERNS.contentFor)
  })
  it('matches helper method', () => {
    expect('  helper_method :current_user').toMatch(VIEW_PATTERNS.helperMethod)
  })
  it('matches turbo_frame_tag', () => {
    expect('  turbo_frame_tag "messages"').toMatch(VIEW_PATTERNS.turboFrame)
  })
  it('matches HTML turbo-frame tag', () => {
    expect('<turbo-frame id="messages">').toMatch(VIEW_PATTERNS.turboFrame)
  })
  it('matches turbo_stream tag', () => {
    expect('  turbo_stream.append "messages"').toMatch(
      VIEW_PATTERNS.turboStreamTag,
    )
  })
})

// ── GEMFILE_PATTERNS ──────────────────────────────────────────────────
describe('GEMFILE_PATTERNS', () => {
  it('matches gem line', () => {
    const m = "gem 'rails', '~> 7.1'".match(GEMFILE_PATTERNS.gem)
    expect(m).toBeTruthy()
  })
  it('matches source', () => {
    expect("source 'https://rubygems.org'").toMatch(GEMFILE_PATTERNS.source)
  })
  it('matches ruby version', () => {
    expect("ruby '3.2.2'").toMatch(GEMFILE_PATTERNS.ruby)
  })
  it('matches group block', () => {
    expect('group :development, :test do').toMatch(GEMFILE_PATTERNS.group)
  })
})

// ── CONFIG_PATTERNS ───────────────────────────────────────────────────
describe('CONFIG_PATTERNS', () => {
  it('matches Rails.application.configure', () => {
    expect('Rails.application.configure do').toMatch(
      CONFIG_PATTERNS.railsConfigure,
    )
  })
  it('matches config.setting assignment', () => {
    expect('  config.eager_load = true').toMatch(CONFIG_PATTERNS.configSetting)
  })
  it('matches initializer block', () => {
    expect("  initializer 'my_engine.add_middleware' do").toMatch(
      CONFIG_PATTERNS.initializer,
    )
  })
  it('matches environment specific config', () => {
    expect('  config.action_mailer.delivery_method = :smtp').toMatch(
      CONFIG_PATTERNS.configSetting,
    )
  })
})
