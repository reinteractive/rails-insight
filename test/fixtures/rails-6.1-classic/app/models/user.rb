class User < ApplicationRecord
  devise :database_authenticatable, :registerable,
         :recoverable, :rememberable, :validatable

  has_many :posts, dependent: :destroy

  validates :email, presence: true, uniqueness: true
  validates :name, presence: true, length: { maximum: 100 }
end
