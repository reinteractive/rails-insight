# frozen_string_literal: true

class Post < ApplicationRecord
  # Hotwire broadcasts
  broadcasts_refreshes

  # Associations
  belongs_to :user
  has_many :comments, dependent: :destroy

  # Rich Text
  has_rich_text :content

  # Tagging
  acts_as_taggable_on :tags

  # Friendly ID
  extend FriendlyId
  friendly_id :title, use: :slugged

  # Enums
  enum :status, { draft: 0, published: 1, archived: 2 }

  # Validations
  validates :title, presence: true, length: { maximum: 255 }
  validates :body, presence: true

  # Scopes
  scope :published, -> { where(status: :published) }
  scope :recent, -> { order(created_at: :desc) }
  scope :featured, -> { where(featured: true) }

  # Callbacks
  before_save :normalize_title

  # Paper Trail
  has_paper_trail

  private

  def normalize_title
    self.title = title.strip.titleize if title.present?
  end
end
