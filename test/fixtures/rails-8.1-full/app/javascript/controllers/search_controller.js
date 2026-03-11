import { Controller } from '@hotwired/stimulus'

// Connects to data-controller="search"
export default class extends Controller {
  static targets = ['input', 'results', 'count']
  static values = {
    url: String,
    debounceMs: { type: Number, default: 300 },
    minLength: { type: Number, default: 2 },
  }

  connect() {
    this.timeout = null
  }

  disconnect() {
    if (this.timeout) {
      clearTimeout(this.timeout)
    }
  }

  search() {
    const query = this.inputTarget.value.trim()

    if (query.length < this.minLengthValue) {
      this.resultsTarget.innerHTML = ''
      this.countTarget.textContent = '0 results'
      return
    }

    if (this.timeout) {
      clearTimeout(this.timeout)
    }

    this.timeout = setTimeout(() => {
      this.performSearch(query)
    }, this.debounceMsValue)
  }

  async performSearch(query) {
    const url = `${this.urlValue}?q=${encodeURIComponent(query)}`

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'text/vnd.turbo-stream.html',
          'X-Requested-With': 'XMLHttpRequest',
        },
      })

      if (response.ok) {
        const html = await response.text()
        this.resultsTarget.innerHTML = html
      }
    } catch (error) {
      console.error('Search failed:', error)
    }
  }

  clear() {
    this.inputTarget.value = ''
    this.resultsTarget.innerHTML = ''
    this.countTarget.textContent = '0 results'
  }
}
