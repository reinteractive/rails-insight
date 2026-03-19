/**
 * Regex patterns for ViewComponent extraction.
 */
export const COMPONENT_PATTERNS = {
  classDeclaration: /class\s+(\w+(?:::\w+)*Component)\s*<\s*(\w+(?:::\w+)*)/,
  initialize: /def\s+initialize\(([^)]+)\)/,
  rendersOne: /^\s*renders_one\s+:(\w+)(?:,\s*(.+))?/m,
  rendersMany: /^\s*renders_many\s+:(\w+)(?:,\s*(.+))?/m,
  collectionParam: /^\s*with_collection_parameter\s+:(\w+)/m,
  contentAreas: /^\s*with_content_areas?\s+(.+)/m,
  // Template patterns
  stimulusController: /data-controller=['"]([^'"]+)['"]/g,
  stimulusAction: /data-action=['"]([^'"]+)['"]/g,
  turboFrame: /<turbo-frame\s+id=['"]([^'"]+)['"]/g,
  turboStream: /<turbo-stream\s/g,
  componentRender: /render\s+(\w+(?:::\w+)*Component)/g,
  partialRender: /render\s+partial:/g,
}
