import { Controller } from '@hotwired/stimulus'

export default class extends Controller {
  static targets = ['content', 'button']
  static classes = ['hidden']
  static values = {
    open: { type: Boolean, default: false },
  }

  connect() {
    this.toggleVisibility()
  }

  toggle() {
    this.openValue = !this.openValue
  }

  openValueChanged() {
    this.toggleVisibility()
  }

  toggleVisibility() {
    if (this.openValue) {
      this.contentTarget.classList.remove(this.hiddenClass)
      this.buttonTarget.setAttribute('aria-expanded', 'true')
    } else {
      this.contentTarget.classList.add(this.hiddenClass)
      this.buttonTarget.setAttribute('aria-expanded', 'false')
    }
  }
}
