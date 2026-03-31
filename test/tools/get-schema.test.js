import { describe, it, expect } from 'vitest'
import { register } from '../../src/tools/handlers/get-schema.js'

function createMockServer() {
  const tools = {}
  return {
    server: {
      tool(name, description, schema, handler) {
        tools[name] = handler
      },
    },
    async callTool(name) {
      return tools[name]()
    },
  }
}

function parseResponse(result) {
  const text = result.content?.[0]?.text
  return text ? JSON.parse(text) : null
}

describe('get_schema handler', () => {
  describe('model_table_map filtering', () => {
    it('excludes abstract classes, ability classes, and STI subclasses', async () => {
      const state = {
        index: {
          extractions: {
            models: {
              User: { type: 'model', file: 'app/models/user.rb' },
              ApplicationRecord: { type: 'model', abstract: true },
              AdminAbility: {
                type: 'model',
                file: 'app/models/admin_ability.rb',
              },
              Place: { type: 'model', sti_parent: 'Venue' },
              Venue: { type: 'model', file: 'app/models/venue.rb' },
            },
            schema: {
              tables: [
                { name: 'users', columns: [], indexes: [] },
                { name: 'venues', columns: [], indexes: [] },
              ],
              foreign_keys: [],
            },
          },
        },
      }

      const mock = createMockServer()
      register(mock.server, state)
      const result = await mock.callTool('get_schema')
      const data = parseResponse(result)

      expect(data.model_table_map).toHaveProperty('User', 'users')
      expect(data.model_table_map).toHaveProperty('Venue', 'venues')
      expect(data.model_table_map).not.toHaveProperty('ApplicationRecord')
      expect(data.model_table_map).not.toHaveProperty('AdminAbility')
      expect(data.model_table_map).not.toHaveProperty('Place')
    })

    it('excludes models with tables not in schema', async () => {
      const state = {
        index: {
          extractions: {
            models: {
              User: { type: 'model', file: 'app/models/user.rb' },
              Ghost: { type: 'model', file: 'app/models/ghost.rb' },
            },
            schema: {
              tables: [{ name: 'users', columns: [], indexes: [] }],
              foreign_keys: [],
            },
          },
        },
      }

      const mock = createMockServer()
      register(mock.server, state)
      const result = await mock.callTool('get_schema')
      const data = parseResponse(result)

      expect(data.model_table_map).toHaveProperty('User', 'users')
      expect(data.model_table_map).not.toHaveProperty('Ghost')
    })
  })
})
