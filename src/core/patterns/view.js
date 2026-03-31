/**
 * Regex patterns for view and template extraction.
 */
export const VIEW_PATTERNS = {
  turboFrame:
    /(?:<turbo-frame\s+id=['"]([^'"]+)['"]|turbo_frame_tag\s+['"]([^'"]+)['"])/g,
  // Matches both `render OfferComponent.new(...)` (classic) and
  // `render Search::Component.new(...)` (namespaced component.rb convention)
  componentRender:
    /render\s*\(?\s*((?:[A-Z]\w*::)*(?:[A-Z]\w*Component|Component))\.(?:new|with_collection|with_content)/g,
  partialRender: /render\s+(?:partial:\s*)?['"]([^'"]+)['"]/g,
  contentFor: /content_for\s*[:(]\s*:?(\w+)/g,
  formWith: /form_with\s/g,
  formFor: /form_for\s/g,
  formTag: /form_tag\s/g,
  stimulusController: /data-controller=['"]([^'"]+)['"]/g,
  stimulusAction: /data-action=['"]([^'"]+)['"]/g,
  jbuilderField: /json\.(\w+)/g,
  jbuilderArray: /json\.array!/g,
  yieldContent: /yield\s*[:(]?\s*:?(\w+)/g,
  helperMethod: /helper_method\s+:(\w+)/g,
  turboStreamTag: /turbo_stream\.\w+/g,
}
