class Post < ApplicationRecord
  belongs_to :user

  validates :title, presence: true, length: { maximum: 255 }
  validates :body, presence: true

  enum status: { draft: 0, published: 1, archived: 2 }

  scope :recent, -> { order(created_at: :desc) }
  scope :published_posts, -> { where(status: :published) }

  def publish!
    update!(status: :published, published_at: Time.current)
  end
end
