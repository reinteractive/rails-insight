# frozen_string_literal: true

class ProcessPostJob < ApplicationJob
  queue_as :default

  retry_on ActiveRecord::Deadlocked, wait: 5.seconds, attempts: 3
  retry_on Net::OpenTimeout, wait: :polynomially_longer, attempts: 10
  discard_on ActiveJob::DeserializationError

  def perform(post_id)
    post = Post.find(post_id)

    post.reindex
    post.update!(processed_at: Time.current)

    PostChannel.broadcast_to(
      post,
      type: "post.processed",
      post_id: post.id
    )
  end
end
