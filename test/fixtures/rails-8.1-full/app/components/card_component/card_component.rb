# frozen_string_literal: true

class CardComponent < ViewComponent::Base
  renders_many :actions

  def initialize(title:, subtitle: nil, collapsible: false)
    @title = title
    @subtitle = subtitle
    @collapsible = collapsible
  end
end
