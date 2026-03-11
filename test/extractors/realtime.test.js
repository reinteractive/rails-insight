import { describe, it, expect } from 'vitest'
import { extractRealtime } from '../../src/extractors/realtime.js'

function mockProvider(files) {
  return {
    readFile(path) {
      return files[path] || null
    },
  }
}

describe('Realtime Extractor', () => {
  describe('full realtime config', () => {
    const files = {
      'config/cable.yml': `
production:
  adapter: redis
  url: redis://localhost:6379/1
development:
  adapter: async
test:
  adapter: test`,
      'app/channels/chat_channel.rb': `
class ChatChannel < ApplicationCable::Channel
  def subscribed
    stream_from "chat_room_\#{params[:room]}"
    stream_for current_user
  end

  def receive(data)
    ActionCable.server.broadcast("chat_room_\#{params[:room]}", data)
  end
end`,
      'app/channels/notifications_channel.rb': `
class NotificationsChannel < ApplicationCable::Channel
  def subscribed
    stream_for current_user
  end
end`,
      'app/channels/application_cable/connection.rb': `
module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :current_user

    def connect
      self.current_user = find_verified_user
    end
  end
end`,
      'app/views/posts/show.html.erb': `
<%= turbo_stream_from @post %>
<%= turbo_stream_from @post, :comments %>`,
    }

    const entries = [
      { path: 'app/channels/chat_channel.rb', category: 'channel' },
      { path: 'app/channels/notifications_channel.rb', category: 'channel' },
      { path: 'app/views/posts/show.html.erb', category: 'view' },
    ]

    const gemInfo = { gems: { 'turbo-rails': {} } }
    const provider = mockProvider(files)
    const result = extractRealtime(provider, entries, gemInfo)

    it('detects cable adapter per environment', () => {
      expect(result.adapter.production).toBe('redis')
      expect(result.adapter.development).toBe('async')
    })

    it('extracts channels', () => {
      expect(result.channels).toHaveLength(2)
      const chat = result.channels.find((c) => c.class === 'ChatChannel')
      expect(chat).toBeTruthy()
      expect(chat.streams_from).toContain('chat_room_#{params[:room]}')
      expect(chat.streams_for).toContain('current_user')
    })

    it('detects turbo_stream_from usage count', () => {
      expect(result.turbo_stream_from_usage).toBeGreaterThanOrEqual(2)
    })

    it('detects connection auth', () => {
      expect(result.connection_auth).toBe('find_verified_user')
    })

    it('does not detect anycable when not in gems', () => {
      expect(result.anycable).toBe(false)
    })
  })

  describe('anycable detection', () => {
    it('detects anycable from gems', () => {
      const provider = mockProvider({})
      const gemInfo = { gems: { 'anycable-rails': {} } }
      const result = extractRealtime(provider, [], gemInfo)
      expect(result.anycable).toBe(true)
    })
  })

  describe('no realtime', () => {
    it('returns empty result', () => {
      const provider = mockProvider({})
      const result = extractRealtime(provider, [], { gems: {} })
      expect(result.adapter).toEqual({})
      expect(result.channels).toEqual([])
      expect(result.turbo_stream_from_usage).toBe(0)
      expect(result.connection_auth).toBeNull()
    })
  })
})
