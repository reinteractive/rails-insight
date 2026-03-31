/**
 * Regex patterns for ViewComponent extraction.
 */
export const COMPONENT_PATTERNS = {
  // Matches both classic `SomethingComponent` and namespaced `Namespace::Component`
  // (the component.rb naming convention used in subdirectory-style ViewComponents)
  classDeclaration:
    /class\s+((?:\w+::)*(?:\w+Component|Component))\s*<\s*(\w+(?:::\w+)*)/,
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
  // Matches both classic `OfferComponent` and namespaced `Search::Component` renders
  componentRender:
    /render\s*\(?\s*((?:[A-Z]\w*::)*(?:[A-Z]\w*Component|Component))\.(?:new|with_collection|with_content)/g,
  partialRender: /render\s+partial:/g,
}
