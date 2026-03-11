class Post < ApplicationRecord
  belongs_to :user
  has_many :comments, dependent: :destroy

  broadcasts_refreshes

  enum :status, { draft: 0, published: 1, archived: 2 }

  validates :title, presence: true, length: { maximum: 255 }
  validates :body, presence: true

  scope :recent, -> { order(created_at: :desc) }
  scope :published_posts, -> { published }

  def publish!
    update!(status: :published, published_at: Time.current)
  end
end
