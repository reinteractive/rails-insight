# frozen_string_literal: true

class ButtonComponent < ViewComponent::Base
  renders_one :icon

  def initialize(label:, variant: :primary, size: :md, disabled: false)
    @label = label
    @variant = variant
    @size = size
    @disabled = disabled
  end

  private

  def css_classes
    base = "btn"
    variant_class = "btn-#{@variant}"
    size_class = "btn-#{@size}"
    disabled_class = @disabled ? "btn-disabled" : nil

    [base, variant_class, size_class, disabled_class].compact.join(" ")
  end
end
