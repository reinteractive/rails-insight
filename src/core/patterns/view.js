/**
 * Regex patterns for view and template extraction.
 */
export const VIEW_PATTERNS = {
  turboFrame:
    /(?:<turbo-frame\s+id=['"]([^'"]+)['"]|turbo_frame_tag\s+['"]([^'"]+)['"])/g,
  componentRender: /render\s+(\w+(?:::\w+)*Component)/g,
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
