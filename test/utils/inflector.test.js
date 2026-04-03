/**
 * Tests for the English inflection module.
 * @module inflector.test
 */

import { describe, it, expect } from 'vitest'
import {
  pluralize,
  singularize,
  classify,
  tableize,
  underscore,
} from '../../src/utils/inflector.js'

describe('pluralize', () => {
  it('pluralize: regular word', () => {
    expect(pluralize('user')).toBe('users')
  })

  it('pluralize: word ending in y', () => {
    expect(pluralize('category')).toBe('categories')
  })

  it('pluralize: word ending in s', () => {
    expect(pluralize('status')).toBe('statuses')
  })

  it('pluralize: word ending in ss', () => {
    expect(pluralize('address')).toBe('addresses')
  })

  it('pluralize: word ending in x', () => {
    expect(pluralize('box')).toBe('boxes')
  })

  it('pluralize: word ending in ch', () => {
    expect(pluralize('match')).toBe('matches')
  })

  it('pluralize: word ending in sh', () => {
    expect(pluralize('wish')).toBe('wishes')
  })

  it('pluralize: word ending in f', () => {
    expect(pluralize('wolf')).toBe('wolves')
  })

  it('pluralize: word ending in fe', () => {
    expect(pluralize('wife')).toBe('wives')
  })

  it('pluralize: word ending in o', () => {
    expect(pluralize('potato')).toBe('potatoes')
  })

  it('pluralize: word ending in is', () => {
    expect(pluralize('analysis')).toBe('analyses')
  })

  it('pluralize: word ending in um', () => {
    expect(pluralize('medium')).toBe('media')
  })

  it('pluralize: irregular person', () => {
    expect(pluralize('person')).toBe('people')
  })

  it('pluralize: irregular child', () => {
    expect(pluralize('child')).toBe('children')
  })

  it('pluralize: irregular man', () => {
    expect(pluralize('man')).toBe('men')
  })

  it('pluralize: uncountable', () => {
    expect(pluralize('sheep')).toBe('sheep')
  })

  it('pluralize: empty string', () => {
    expect(pluralize('')).toBe('')
  })
})

describe('singularize', () => {
  it('singularize: regular word', () => {
    expect(singularize('users')).toBe('user')
  })

  it('singularize: ies to y', () => {
    expect(singularize('categories')).toBe('category')
  })

  it('singularize: ses to s', () => {
    expect(singularize('statuses')).toBe('status')
  })

  it('singularize: sses to ss', () => {
    expect(singularize('addresses')).toBe('address')
  })

  it('singularize: xes to x', () => {
    expect(singularize('boxes')).toBe('box')
  })

  it('singularize: ves to f', () => {
    expect(singularize('wolves')).toBe('wolf')
  })

  it('singularize: ves to fe', () => {
    expect(singularize('wives')).toBe('wife')
  })

  it('singularize: irregular people', () => {
    expect(singularize('people')).toBe('person')
  })

  it('singularize: irregular children', () => {
    expect(singularize('children')).toBe('child')
  })

  it('singularize: uncountable', () => {
    expect(singularize('sheep')).toBe('sheep')
  })

  it('singularize: news', () => {
    expect(singularize('news')).toBe('news')
  })

  it('singularize: empty string', () => {
    expect(singularize('')).toBe('')
  })
})

describe('classify', () => {
  it('classify: snake_case plural', () => {
    expect(classify('user_profiles')).toBe('UserProfile')
  })

  it('classify: simple plural', () => {
    expect(classify('comments')).toBe('Comment')
  })

  it('classify: irregular plural', () => {
    expect(classify('people')).toBe('Person')
  })

  it('classify: singular already', () => {
    expect(classify('user')).toBe('User')
  })

  it('classify: empty string', () => {
    expect(classify('')).toBe('')
  })

  it('classify: single word plural', () => {
    expect(classify('categories')).toBe('Category')
  })

  it('classify: preserves double-s endings (ss)', () => {
    expect(classify('kids_class')).toBe('KidsClass')
    expect(classify('business')).toBe('Business')
    expect(classify('address')).toBe('Address')
  })
})

describe('tableize', () => {
  it('tableize: simple class', () => {
    expect(tableize('User')).toBe('users')
  })

  it('tableize: compound class', () => {
    expect(tableize('UserProfile')).toBe('user_profiles')
  })

  it('tableize: irregular', () => {
    expect(tableize('Person')).toBe('people')
  })

  it('tableize: ending in y', () => {
    expect(tableize('Category')).toBe('categories')
  })

  it('tableize: ending in ss', () => {
    expect(tableize('Address')).toBe('addresses')
  })
})

describe('underscore', () => {
  it('underscore: simple', () => {
    expect(underscore('User')).toBe('user')
  })

  it('underscore: compound', () => {
    expect(underscore('UserProfile')).toBe('user_profile')
  })

  it('underscore: consecutive caps', () => {
    expect(underscore('HTMLParser')).toBe('html_parser')
  })
})
