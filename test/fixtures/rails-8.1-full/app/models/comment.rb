# frozen_string_literal: true

class Comment < ApplicationRecord
  # Associations
  belongs_to :post, counter_cache: true
  belongs_to :user

  # Validations
  validates :body, presence: true, length: { minimum: 2, maximum: 5000 }

  # Scopes
  scope :recent, -> { order(created_at: :desc) }

  # Broadcasts
  broadcasts_refreshes
end
