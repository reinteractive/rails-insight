# frozen_string_literal: true

class User < ApplicationRecord
  include Searchable

  # Devise modules
  devise :database_authenticatable, :registerable,
         :recoverable, :rememberable, :validatable,
         :confirmable

  # Associations
  has_many :posts, dependent: :destroy
  has_many :comments, dependent: :destroy

  # Active Storage
  has_one_attached :avatar

  # Enums
  enum :role, { user: 0, admin: 1 }

  # Validations
  validates :email, presence: true, uniqueness: true
  validates :username, presence: true, uniqueness: true, length: { minimum: 3, maximum: 30 }

  # Scopes
  scope :active, -> { where(confirmed_at: ..Time.current) }
  scope :admins, -> { where(role: :admin) }

  # Callbacks
  after_create :send_welcome_email

  # Paper Trail
  has_paper_trail

  private

  def send_welcome_email
    UserMailer.welcome_email(self).deliver_later
  end
end
