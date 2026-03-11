# frozen_string_literal: true

class PostCreator
  attr_reader :user, :params, :post

  def initialize(user:, params:)
    @user = user
    @params = params
    @post = nil
  end

  def call
    @post = user.posts.build(params)

    ActiveRecord::Base.transaction do
      @post.save!
      ProcessPostJob.perform_later(@post.id)
      notify_followers
    end

    Result.new(success: true, post: @post)
  rescue ActiveRecord::RecordInvalid => e
    Result.new(success: false, post: @post, error: e.message)
  end

  private

  def notify_followers
    # Future: notify users who follow this author
  end

  Result = Struct.new(:success, :post, :error, keyword_init: true) do
    def success?
      success
    end
  end
end
