/**
 * Tests for controller action line range calculation with depth tracking.
 * @module controller-line-ranges.test
 */

import { describe, it, expect } from 'vitest'
import { extractController } from '../../src/extractors/controller.js'

/** Mock provider that returns specified content. */
function mockProvider(content) {
  return {
    readFile: () => content,
  }
}

describe('controller action line ranges', () => {
  it('simple action range', () => {
    const content = [
      'class PostsController < ApplicationController',
      '  def show',
      '    @post = Post.find(params[:id])',
      '  end',
      'end',
    ].join('\n')

    const ctrl = extractController(
      mockProvider(content),
      'app/controllers/posts_controller.rb',
    )
    expect(ctrl.action_line_ranges.show).toEqual({ start: 2, end: 4 })
  })

  it('action with conditional', () => {
    const content = [
      'class PostsController < ApplicationController',
      '  def create',
      '    if valid?',
      '      save',
      '    else',
      '      render :new',
      '    end',
      '  end',
      'end',
    ].join('\n')

    const ctrl = extractController(
      mockProvider(content),
      'app/controllers/posts_controller.rb',
    )
    expect(ctrl.action_line_ranges.create).toEqual({ start: 2, end: 8 })
  })

  it('action with block', () => {
    const content = [
      'class PostsController < ApplicationController',
      '  def index',
      '    @posts = Post.where do |p|',
      '      p.active',
      '    end',
      '  end',
      'end',
    ].join('\n')

    const ctrl = extractController(
      mockProvider(content),
      'app/controllers/posts_controller.rb',
    )
    expect(ctrl.action_line_ranges.index).toEqual({ start: 2, end: 6 })
  })

  it('multiple actions', () => {
    const content = [
      'class PostsController < ApplicationController',
      '  def index',
      '    @posts = Post.all',
      '  end',
      '  def show',
      '    @post = Post.find(params[:id])',
      '  end',
      'end',
    ].join('\n')

    const ctrl = extractController(
      mockProvider(content),
      'app/controllers/posts_controller.rb',
    )
    expect(ctrl.action_line_ranges.index).toEqual({ start: 2, end: 4 })
    expect(ctrl.action_line_ranges.show).toEqual({ start: 5, end: 7 })
  })

  it('action before private', () => {
    const content = [
      'class PostsController < ApplicationController',
      '  def index',
      '    @posts = Post.all',
      '  end',
      '  private',
      '  def secret',
      '    # hidden',
      '  end',
      'end',
    ].join('\n')

    const ctrl = extractController(
      mockProvider(content),
      'app/controllers/posts_controller.rb',
    )
    expect(ctrl.action_line_ranges.index).toEqual({ start: 2, end: 4 })
    expect(ctrl.action_line_ranges).not.toHaveProperty('secret')
  })
})
