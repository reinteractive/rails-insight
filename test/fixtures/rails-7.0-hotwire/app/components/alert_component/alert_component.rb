class AlertComponent < ViewComponent::Base
  TYPES = %i[info success warning error].freeze

  param :message
  param :type, default: -> { :info }

  validates :type, inclusion: { in: TYPES }

  def icon_name
    case type
    when :success then "check-circle"
    when :warning then "exclamation-triangle"
    when :error then "x-circle"
    else "information-circle"
    end
  end

  def css_class
    "alert alert--#{type}"
  end
end
