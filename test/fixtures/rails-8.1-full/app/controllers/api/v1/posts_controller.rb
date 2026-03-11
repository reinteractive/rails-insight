# frozen_string_literal: true

module Api
  module V1
    class PostsController < ApplicationController
      skip_before_action :verify_authenticity_token
      before_action :set_post, only: [:show, :update, :destroy]

      def index
        @pagy, @posts = pagy(Post.published.recent, items: 25)

        render json: {
          posts: @posts.as_json(include: :user, methods: :tag_list),
          pagy: pagy_metadata(@pagy)
        }
      end

      def show
        render json: @post.as_json(include: [:user, :comments], methods: :tag_list)
      end

      def create
        @post = current_user.posts.build(post_params)

        if @post.save
          render json: @post, status: :created
        else
          render json: { errors: @post.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def update
        if @post.update(post_params)
          render json: @post
        else
          render json: { errors: @post.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def destroy
        @post.destroy!
        head :no_content
      end

      private

      def set_post
        @post = Post.friendly.find(params[:id])
      end

      def post_params
        params.require(:post).permit(:title, :body, :status, tag_list: [])
      end
    end
  end
end
