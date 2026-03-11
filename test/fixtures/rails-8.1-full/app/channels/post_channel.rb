# frozen_string_literal: true

class PostChannel < ApplicationCable::Channel
  def subscribed
    post = Post.find(params[:post_id])
    stream_for post
  end

  def unsubscribed
    stop_all_streams
  end

  def receive(data)
    # Handle incoming data from clients
  end
end
